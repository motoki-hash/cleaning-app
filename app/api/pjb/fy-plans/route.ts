import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 年度の事業計画（スプレッドシートの「予定値」タブ）を、アプリの pjb_fy_plans に取り込む。
//  - スプレッドシート側の Google Apps Script から、定期的に呼ばれる
//  - 合言葉（環境変数 PJB_SYNC_SECRET）が合わないものは受け付けない
//  - その年度・その事業の月別の計画を、シートの値で上書きする

const BUSINESSES = ['illi Stays & Hotels', 'Kyo Residence', 'Setup Office']

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const secret = process.env.PJB_SYNC_SECRET
  if (!url || !service || !secret) return reply(500, { error: 'サーバーの設定が未完了です（PJB_SYNC_SECRET）' })

  const given = req.headers.get('x-pjb-sync-secret') || ''
  if (!given || !safeEqual(given, secret)) return reply(401, { error: '合言葉が違います' })

  let body: { fiscal_year?: unknown; plans?: unknown }
  try { body = await req.json() } catch { return reply(400, { error: '入力の形式が正しくありません' }) }

  const fiscalYear = Number(body.fiscal_year)
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return reply(400, { error: '年度が正しくありません' })
  if (!Array.isArray(body.plans) || body.plans.length === 0 || body.plans.length > 200) return reply(400, { error: '計画の件数が正しくありません' })

  const now = new Date().toISOString()
  const rows = []
  for (const p of body.plans as Array<Record<string, unknown>>) {
    const business = String(p.business ?? '')
    const month = Number(p.month)
    const sales = Math.round(Number(p.sales))
    const cost = Math.round(Number(p.cost))
    if (!BUSINESSES.includes(business) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isFinite(sales) || !Number.isFinite(cost)) {
      return reply(400, { error: `計画の内容が正しくありません（${business} ${p.month}）` })
    }
    rows.push({ fiscal_year: fiscalYear, business, month, sales, cost, updated_at: now })
  }

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { error } = await admin.from('pjb_fy_plans').upsert(rows, { onConflict: 'fiscal_year,business,month' })
  if (error) return reply(500, { error: `保存に失敗しました：${error.message}` })
  return reply(200, { ok: true, fiscal_year: fiscalYear, saved: rows.length })
}
