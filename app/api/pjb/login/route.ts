import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PINだけでログインする（メールアドレス・パスワード不要）。
//  - PINはサーバーの環境変数 PJB_LOGIN_PIN と照合する（ブラウザには置かない）
//  - 当てずっぽうで破られないよう、失敗の回数をサーバー側で数えて制限する
//  - 正しいPINのときだけ、共有アカウントでSupabaseにログインしてセッションを返す
//    （共有アカウントのパスワードは PJB_SESSION_SECRET から作り、誰にも見せない）

const IP_MAX_FAILS = 5          // 同じ場所から：15分間に5回まで
const IP_WINDOW_MIN = 15
const GLOBAL_MAX_FAILS = 30     // 全体で：60分間に30回まで
const GLOBAL_WINDOW_MIN = 60
const SHARED_EMAIL = 'pjb-shared@barenotestudio.com'

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pin = process.env.PJB_LOGIN_PIN
  const secret = process.env.PJB_SESSION_SECRET
  if (!url || !anon || !service || !pin || !secret) {
    return fail(500, 'サーバーの設定が未完了です（PJB_LOGIN_PIN / PJB_SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY）')
  }

  let input = ''
  try { input = String((await req.json())?.pin ?? '') } catch { /* 不正な入力は下で弾く */ }
  if (!/^\d{6}$/.test(input)) return fail(400, 'PINは6桁の数字で入力してください')

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  // --- 失敗回数の制限 ---
  const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  const [ipRes, globalRes] = await Promise.all([
    admin.from('pjb_login_attempts').select('id', { count: 'exact', head: true }).eq('success', false).eq('ip', ip).gte('created_at', since(IP_WINDOW_MIN)),
    admin.from('pjb_login_attempts').select('id', { count: 'exact', head: true }).eq('success', false).gte('created_at', since(GLOBAL_WINDOW_MIN)),
  ])
  if (ipRes.error || globalRes.error) {
    return fail(500, 'ログインの準備ができていません（SQLパッチ007を実行してください）')
  }
  const ipFails = ipRes.count ?? 0
  if (ipFails >= IP_MAX_FAILS) return fail(429, `入力を間違えすぎました。${IP_WINDOW_MIN}分ほど待ってからお試しください`)
  if ((globalRes.count ?? 0) >= GLOBAL_MAX_FAILS) return fail(429, '現在ログインが制限されています。しばらくしてからお試しください')

  // --- PINの照合 ---
  const ok = safeEqual(input, pin)
  await admin.from('pjb_login_attempts').insert({ ip, success: ok })
  if (!ok) return fail(401, 'PINが違います', { remaining: Math.max(0, IP_MAX_FAILS - (ipFails + 1)) })

  // 成功したら、この場所の失敗回数をリセットし、古い記録を片づける
  await admin.from('pjb_login_attempts').delete().eq('ip', ip).eq('success', false)
  await admin.from('pjb_login_attempts').delete().lt('created_at', since(60 * 24))

  // --- 共有アカウントでログイン（なければ作る）---
  const password = crypto.createHmac('sha256', secret).update('pjb-shared-login').digest('hex')
  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  let { data, error } = await anonClient.auth.signInWithPassword({ email: SHARED_EMAIL, password })
  if (error || !data.session) {
    const created = await admin.auth.admin.createUser({ email: SHARED_EMAIL, password, email_confirm: true })
    if (created.error) {
      // すでに別のパスワードで存在する場合は、パスワードを合わせ直す
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existing = list.data?.users.find(u => u.email === SHARED_EMAIL)
      if (!existing) return fail(500, `共有アカウントを作成できませんでした：${created.error.message}`)
      const upd = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      if (upd.error) return fail(500, `共有アカウントを更新できませんでした：${upd.error.message}`)
    }
    ;({ data, error } = await anonClient.auth.signInWithPassword({ email: SHARED_EMAIL, password }))
    if (error || !data.session) return fail(500, `ログインに失敗しました：${error?.message ?? '不明なエラー'}`)
  }

  return NextResponse.json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
