import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MAX_HTML, MAX_IMAGE, UUID, EXT, safeFetch, imageCandidates } from '@/lib/pjb/ffeImageServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
// 日本のサイトから取るので、サーバーも東京で動かす（アメリカのサーバーだと、遅くなったり、断られたりする）
export const preferredRegion = 'hnd1'

// 商品ページのURLから、商品画像を取ってきて、画像の保存場所（ffe-images）に入れる。
//  - ログイン中の人だけが使える（ブラウザから送られたログインの証明を確かめる）
//  - 社内のネットワークなどに向けて使われないよう、公開されているアドレス以外には接続しない
//  - Amazon は規約上、自動で取得しない（画像をコピーして貼り付けてもらう）

const BUCKET = 'ffe-images'
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !anon || !service) return reply({ error: 'サーバーの設定が未完了です' }, 500)

  // ログイン中の人だけ
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return reply({ error: 'ログインが必要です' }, 401)
  const authed = createClient(supaUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData } = await authed.auth.getUser(token)
  if (!userData?.user) return reply({ error: 'ログインが必要です' }, 401)

  let body: { url?: string; projectId?: string; itemId?: string } = {}
  try { body = await req.json() } catch { /* 下で弾く */ }
  const { url, projectId, itemId } = body
  if (!url || !projectId || !itemId || !UUID.test(projectId) || !UUID.test(itemId)) return reply({ error: '入力が正しくありません' }, 400)

  let page: URL
  try { page = new URL(url) } catch { return reply({ error: 'URLが正しくありません' }, 400) }
  if (/(^|\.)(amazon\.[a-z.]+|amzn\.[a-z.]+|a\.co)$/i.test(page.hostname)) {
    return reply({ error: 'Amazonの画像は、規約上、自動では取れません。商品画像をコピーして、詳細で貼り付けてください。', amazon: true })
  }

  try {
    // 一時的に失敗することがあるので、1回だけやり直す
    const { bytes: htmlBytes, finalUrl } = await safeFetch(page.toString(), MAX_HTML, 'text/html,application/xhtml+xml').catch(async () => safeFetch(page.toString(), MAX_HTML, 'text/html,application/xhtml+xml'))
    const html = new TextDecoder('utf-8').decode(htmlBytes)
    const candidates = imageCandidates(html, finalUrl)
    if (candidates.length === 0) return reply({ error: 'このページには、商品画像の情報がありませんでした。商品画像をコピーして、詳細で貼り付けてください。' })

    for (const c of candidates) {
      try {
        const { res, bytes } = await safeFetch(c, MAX_IMAGE, 'image/avif,image/webp,image/*')
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        const ext = EXT[type]
        if (!ext || bytes.length < 500) continue
        const admin = createClient(supaUrl, service, { auth: { persistSession: false, autoRefreshToken: false } })
        const path = `${projectId}/${itemId}-${Date.now()}.${ext}`
        const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false })
        if (up.error) return reply({ error: `画像を保存できませんでした：${up.error.message}（SQLパッチ031を実行しましたか？）` })
        return reply({ url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
      } catch { /* 次の候補へ */ }
    }
    return reply({ error: '画像を読み込めませんでした。商品画像をコピーして、詳細で貼り付けてください。' })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    return reply({ error: `ページを読み込めませんでした${m ? `（${m}）` : ''}。商品画像をコピーして、詳細で貼り付けてください。` })
  }
}
