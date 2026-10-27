// 事業計画シート（「予定値」タブ）の表を貼り付け／CSVで読み込んで、事業別・月別の計画にする。
// 行は名前で探すので、列や行が多少ずれていても読める。

// シートの行の名前 → アプリの事業名
export const SHEET_BUSINESS_MAP: Record<string, string> = {
  'ホテルPM': 'illi Stays & Hotels',
  'SUO': 'Setup Office',
  'ConceptK': 'Kyo Residence',
}

export type ImportedPlan = { business: string; month: number; sales: number; cost: number }
export type ImportResult = { fiscalYear: number | null; plans: ImportedPlan[] }

// タブ区切り（スプレッドシートからのコピー）か、カンマ区切り（CSV）を、行×列に直す
export function parseTable(text: string): string[][] {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const delim = t.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell); rows.push(row)
  return rows
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? '').replace(/[,¥￥\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function extractPlans(rows: string[][]): ImportResult {
  // 「合計」の列の右隣から、12か月分（4月〜3月）
  let totalCol = -1
  for (const r of rows.slice(0, 10)) { const i = r.findIndex(c => c.trim() === '合計'); if (i >= 0) { totalCol = i; break } }
  if (totalCol < 0) throw new Error('見出しの「合計」の列が見つかりません。予定値のタブの表（見出しの行から下）を含めて貼り付けてください')
  const first = totalCol + 1

  let fiscalYear: number | null = null
  for (const r of rows.slice(0, 5)) for (const c of r) {
    const m = c.match(/(\d{2,4})\s*年度/)
    if (m) { fiscalYear = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]); break }
  }

  const label = (r: string[]) => r.slice(0, totalCol).map(c => c.trim()).filter(Boolean).pop() || ''
  const find = (name: string, from: number) => { for (let i = from; i < rows.length; i++) if (label(rows[i]) === name) return i; return -1 }
  const sales = find('売上高', 0)
  const cost = sales < 0 ? -1 : find('売上原価', sales + 1)
  const gross = cost < 0 ? -1 : find('売上総利益', cost + 1)
  if (sales < 0 || cost < 0 || gross < 0) throw new Error('「売上高」「売上原価」「売上総利益」の行が見つかりません')
  const pick = (from: number, to: number, name: string) => { for (let i = from + 1; i < to; i++) if (label(rows[i]) === name) return i; return -1 }

  const plans: ImportedPlan[] = []
  for (const [name, business] of Object.entries(SHEET_BUSINESS_MAP)) {
    const rs = pick(sales, cost, name), rc = pick(cost, gross, name)
    if (rs < 0 || rc < 0) throw new Error(`「${name}」の行が見つかりません`)
    for (let m = 0; m < 12; m++) plans.push({ business, month: m + 1, sales: num(rows[rs][first + m]), cost: num(rows[rc][first + m]) })
  }
  return { fiscalYear, plans }
}
