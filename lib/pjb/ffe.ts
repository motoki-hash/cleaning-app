// FFE・OSE発注リスト：型・金額の計算・入力チェック・投資家ビュー（上乗せ配分）・CSV
//
// 金額のルール（全案件共通）
//  ・単価は「税込」で入力する（税込が正）
//  ・行の合計（税込）＝ 数量 × 単価（税込）
//  ・行の税別 ＝ 行の合計（税込）÷ 1.1 を、1行ずつ四捨五入
//  ・全体の合計は、行の合計を足し上げる（表の数字と必ず一致する）

export const FFE_TAX = 1.1

export const FFE_CATEGORIES = ['家具', '家電', '客室備品', '運営関係', '諸経費', '分離発注'] as const
export const FFE_STATUSES = ['未選定', '選定済', '発注済', '納品済', '保留', 'キャンセル'] as const
export const FFE_ORDERERS = ['BNS', 'デザイナー', 'セカイズ'] as const

export type InvestorMode = 'show' | 'hide' | 'fixed'
export const INVESTOR_MODE_LABEL: Record<InvestorMode, string> = {
  show: '表示（上乗せを受ける）',
  hide: '見せない（他の単価に上乗せ）',
  fixed: '表示（金額は変えない）',
}

export type FfeItem = {
  id: string
  project_id: string
  category: string
  section: string
  sort_order: number
  orderer: string
  staff: string
  status: string
  ordered_at: string | null
  vendor: string
  name: string
  spec: string
  color: string
  pack_qty: string
  qty: number
  url: string
  note: string
  unit_price: number          // 税込単価
  ship_to: string
  want_date: string | null
  fixed_date: string | null
  done: boolean
  pay_method: string
  invoice_set: string
  pay_month: string
  investor_mode: InvestorMode
}

export type FfeSettings = {
  project_id: string
  delivery_date: string | null
  fix_deadline: string | null
  notes: string
}

// 新しい品目の初期値
export const blankItem = (projectId: string, category: string, section: string, sort: number, orderer = 'BNS'): Omit<FfeItem, 'id'> => ({
  project_id: projectId, category, section, sort_order: sort, orderer, staff: '', status: '未選定', ordered_at: null,
  vendor: '', name: '', spec: '', color: '', pack_qty: '', qty: 1, url: '', note: '', unit_price: 0, ship_to: '',
  want_date: null, fixed_date: null, done: false, pay_method: '', invoice_set: '', pay_month: '', investor_mode: 'show',
})

// ---- 金額 ----
export const counted = (it: FfeItem) => it.status !== 'キャンセル'   // キャンセルは合計に入れない
export const lineIncl = (it: Pick<FfeItem, 'qty' | 'unit_price'>) => Math.round((Number(it.qty) || 0) * (Number(it.unit_price) || 0))
export const exclOf = (incl: number) => Math.round(incl / FFE_TAX)

export type Money = { incl: number; excl: number }
export function sumItems(items: FfeItem[]): Money {
  let incl = 0, excl = 0
  for (const it of items) {
    if (!counted(it)) continue
    const l = lineIncl(it)
    incl += l
    excl += exclOf(l)
  }
  return { incl, excl }
}

// 全体計算の分け方：分離発注／デザイナー手配／それ以外（BNS手配）
export type FfeGroup = 'bns' | 'designer' | 'separate'
export const groupOf = (it: FfeItem): FfeGroup => it.category === '分離発注' ? 'separate' : it.orderer === 'デザイナー' ? 'designer' : 'bns'

export function summarize(items: FfeItem[]) {
  const by = (g: FfeGroup) => sumItems(items.filter(i => groupOf(i) === g))
  const bnsItems = items.filter(i => groupOf(i) === 'bns')
  const categories = FFE_CATEGORIES.filter(c => c !== '分離発注').map(c => {
    const list = bnsItems.filter(i => i.category === c)
    return { category: c, count: list.filter(counted).length, ...sumItems(list) }
  })
  const extraCats = Array.from(new Set(bnsItems.map(i => i.category))).filter(c => !(FFE_CATEGORIES as readonly string[]).includes(c))
    .map(c => { const list = bnsItems.filter(i => i.category === c); return { category: c, count: list.filter(counted).length, ...sumItems(list) } })
  return { bns: by('bns'), designer: by('designer'), separate: by('separate'), total: sumItems(items), categories: [...categories, ...extraCats] }
}

// ---- 入力チェック ----
export function warningsFor(items: FfeItem[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (id: string, m: string) => { out.set(id, [...(out.get(id) ?? []), m]) }
  const urlCount = new Map<string, number>()
  for (const it of items) if (counted(it) && it.url.trim()) urlCount.set(it.url.trim(), (urlCount.get(it.url.trim()) ?? 0) + 1)
  for (const it of items) {
    if (!counted(it)) continue
    const q = Number(it.qty) || 0, u = Number(it.unit_price) || 0
    if (q <= 0 && u > 0) add(it.id, '数量が0なのに単価が入っています（合計に入りません）')
    if (q > 0 && u <= 0) add(it.id, '単価が未入力です（合計が¥0になります）')
    if ((it.status === '発注済' || it.status === '納品済') && !it.ordered_at) add(it.id, '発注済なのに発注日が空です')
    if (it.status === '納品済' && !it.done) add(it.id, '納品済なのに「完了」にチェックがありません')
    if (!it.orderer.trim()) add(it.id, '発注者が未設定です')
    if (it.url.trim() && (urlCount.get(it.url.trim()) ?? 0) > 1) add(it.id, '同じURLの品目が他の行にもあります（二重登録の可能性）')
    if (!it.name.trim()) add(it.id, '商品名が空です')
  }
  return out
}

// ---- 投資家ビュー（見せない項目を、表示する品目の単価に按分して上乗せ。合計は社内と同じ）----
export type InvestorLine = { id: string; unit: number; incl: number; excl: number }
export type InvestorView = {
  lines: InvestorLine[]            // 投資家に見せる行（並びは元の順）
  hiddenTotal: number              // 見せない項目の合計（税込）
  internalTotal: number            // 社内の合計（税込）
  investorTotal: number            // 投資家に見せる合計（税込）
  remainder: number                // 合わせきれなかった端数（0なら完全一致）
  noAbsorber: boolean              // 上乗せを受ける品目が無い
  excl: number                     // 投資家に見せる税別合計（行ごとに四捨五入して足したもの）
}

export function investorView(items: FfeItem[]): InvestorView {
  const live = items.filter(counted)
  const internalTotal = live.reduce((s, i) => s + lineIncl(i), 0)
  const hiddenTotal = live.filter(i => i.investor_mode === 'hide').reduce((s, i) => s + lineIncl(i), 0)
  const visible = live.filter(i => i.investor_mode !== 'hide')
  const absorbers = visible.filter(i => i.investor_mode === 'show' && lineIncl(i) > 0 && Number(i.qty) > 0)
  const V = absorbers.reduce((s, i) => s + lineIncl(i), 0)

  const unit = new Map<string, number>(visible.map(i => [i.id, Number(i.unit_price) || 0]))
  let remainder = 0
  const noAbsorber = hiddenTotal !== 0 && absorbers.length === 0
  if (hiddenTotal !== 0 && absorbers.length > 0) {
    for (const i of absorbers) {
      const a = lineIncl(i)
      const target = Math.round(a + (hiddenTotal * a) / V)        // この品目に割り当てる金額（税込）
      unit.set(i.id, Math.max(0, Math.round(target / Number(i.qty))))
    }
    const lineOf = (i: FfeItem) => Math.round(Number(i.qty) * (unit.get(i.id) ?? 0))
    let residual = internalTotal - visible.reduce((s, i) => s + lineOf(i), 0)
    if (residual !== 0) {
      // 端数は、割り切れる品目に寄せる（数量1の品目の、金額が大きいものを優先）
      const cands = [...absorbers].sort((a, b) => (Number(a.qty) === 1 ? 0 : 1) - (Number(b.qty) === 1 ? 0 : 1) || lineIncl(b) - lineIncl(a))
      const hit = cands.find(i => residual % Number(i.qty) === 0 && (unit.get(i.id) ?? 0) + residual / Number(i.qty) >= 0)
      if (hit) {
        unit.set(hit.id, (unit.get(hit.id) ?? 0) + residual / Number(hit.qty))
        residual = 0
      } else {
        // 1つの品目では割り切れないときは、2つの品目の単価を少しずつ動かして、ぴったり合わせる
        let best: { i: FfeItem; da: number; j: FfeItem; db: number } | null = null
        for (const i of cands) for (const j of cands) {
          if (i === j) continue
          for (let da = -30; da <= 30; da++) {
            if (da === 0) continue
            const rest = residual - da * Number(i.qty)
            if (rest % Number(j.qty) !== 0) continue
            const db = rest / Number(j.qty)
            if ((unit.get(i.id) ?? 0) + da < 0 || (unit.get(j.id) ?? 0) + db < 0) continue
            if (!best || Math.abs(da) + Math.abs(db) < Math.abs(best.da) + Math.abs(best.db)) best = { i, da, j, db }
          }
        }
        if (best) {
          unit.set(best.i.id, (unit.get(best.i.id) ?? 0) + best.da)
          unit.set(best.j.id, (unit.get(best.j.id) ?? 0) + best.db)
          residual = 0
        }
      }
      if (residual !== 0) {
        const top = cands[0]
        const q = Number(top.qty)
        const adj = Math.trunc(residual / q)
        unit.set(top.id, Math.max(0, (unit.get(top.id) ?? 0) + adj))
        residual -= adj * q
      }
    }
    remainder = residual
  } else if (noAbsorber) {
    remainder = hiddenTotal
  }

  const lines: InvestorLine[] = visible.map(i => {
    const u = unit.get(i.id) ?? 0
    const incl = Math.round((Number(i.qty) || 0) * u)
    return { id: i.id, unit: u, incl, excl: exclOf(incl) }
  })
  const investorTotal = lines.reduce((s, l) => s + l.incl, 0)
  return { lines, hiddenTotal, internalTotal, investorTotal, remainder, noAbsorber, excl: lines.reduce((s, l) => s + l.excl, 0) }
}

// ---- CSV（Excelで文字化けしないよう、先頭にBOMをつける）----
const q = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: Array<Array<string | number | null | undefined>>) => '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function internalCsv(items: FfeItem[]): string {
  const head = ['No', '区分', '小見出し', '発注者', '社内発注担当', 'ステータス', '発注日', '購入先', '商品', '規格・カラー', '色', '入数', '数量', '単価(税込)', '税別単価', '合計(税込)', '合計(税別)', 'URL', '備考', '商品発送先', '希望納品日', '確定納品日', '完了', '支払い方法', '請求書セット名', '支払月', '投資家表示']
  const rows = items.map((it, i) => {
    const incl = lineIncl(it)
    const live = counted(it)
    return [i + 1, it.category, it.section, it.orderer, it.staff, it.status, it.ordered_at ?? '', it.vendor, it.name, it.spec, it.color, it.pack_qty, it.qty, it.unit_price,
      Math.round(it.unit_price / FFE_TAX), live ? incl : 0, live ? exclOf(incl) : 0, it.url, it.note, it.ship_to, it.want_date ?? '', it.fixed_date ?? '', it.done ? '済' : '', it.pay_method, it.invoice_set, it.pay_month,
      it.investor_mode === 'hide' ? '見せない' : it.investor_mode === 'fixed' ? '固定' : '表示']
  })
  const t = sumItems(items)
  return toCsv([head, ...rows, [], ['', '', '', '', '', '', '', '', '合計', '', '', '', '', '', '', t.incl, t.excl]])
}

export function investorCsv(items: FfeItem[], view: InvestorView): string {
  const byId = new Map(view.lines.map(l => [l.id, l]))
  const vis = items.filter(i => byId.has(i.id))
  const head = ['No', '区分', '小見出し', '商品', '規格・カラー', '数量', '単価(税込)', '合計(税込)', '合計(税別)']
  const rows = vis.map((it, i) => { const l = byId.get(it.id)!; return [i + 1, it.category, it.section, it.name, [it.spec, it.color].filter(Boolean).join(' '), it.qty, l.unit, l.incl, l.excl] })
  return toCsv([head, ...rows, [], ['', '', '', '合計', '', '', '', view.investorTotal, view.excl]])
}

// ---- Googleスプレッドシート（タブごとにCSV出力したもの）の取り込み ----
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

const norm = (s: string) => s.replace(/[\s　]/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/※.*$/, '').toLowerCase()
const FIELD_BY_HEADER: Record<string, keyof FfeItem> = {
  '発注者': 'orderer', '社内発注担当': 'staff', 'ステータス': 'status', '発注日': 'ordered_at', '購入先': 'vendor', '購入元': 'vendor',
  '商品': 'name', '規格・カラー': 'spec', '仕様/用途': 'spec', '規格': 'spec', '仕様': 'spec', 'カラー': 'color', '入数': 'pack_qty', '数量': 'qty',
  'url': 'url', '備考': 'note', '単価(税込)': 'unit_price', '商品発送先': 'ship_to', '希望納品日': 'want_date', '確定納品日': 'fixed_date',
  '完了': 'done', '支払い方法': 'pay_method', '支払方法': 'pay_method', '請求書セット名': 'invoice_set', 'bns支払月': 'pay_month', '支払月': 'pay_month',
}
const toNum = (s: string) => { const n = Number(s.replace(/[¥￥,\s円]/g, '')); return isFinite(n) ? n : 0 }
const toDate = (s: string): string | null => {
  const t = s.trim()
  let m = t.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[\/](\d{1,2})$/)
  if (m) return `${new Date().getFullYear()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

// シートの「合計（税込）」と、単価×数量が合わない行（シート側の式の上書きなど）
export type ImportMismatch = { name: string; unit: number; qty: number; sheetTotal: number }
export type ImportResult = { items: Array<Omit<FfeItem, 'id' | 'project_id' | 'sort_order'>>; sections: number; skipped: number; mismatches: ImportMismatch[]; error?: string }

export function parseSheetCsv(text: string, category: string): ImportResult {
  const rows = parseCsv(text)
  const hi = rows.findIndex(r => { const n = r.map(norm); return n.includes('商品') && n.includes('数量') })
  if (hi < 0) return { items: [], sections: 0, skipped: 0, mismatches: [], error: '見出しの行（「商品」「数量」がある行）が見つかりませんでした。シートのタブを、そのままCSVで保存したファイルを選んでください' }
  const idx = new Map<keyof FfeItem, number>()
  rows[hi].forEach((h, c) => { const f = FIELD_BY_HEADER[norm(h)]; if (f && !idx.has(f)) idx.set(f, c) })
  // 「合計（税込）」の列（単価の小数点以下が、CSVでは丸めて出力されるのを補うために読む）
  const totalCol = rows[hi].findIndex(h => norm(h) === '合計(税込)')
  const cell = (r: string[], f: keyof FfeItem) => { const c = idx.get(f); return c === undefined ? '' : (r[c] ?? '').trim() }

  const items: ImportResult['items'] = []
  let section = '', sections = 0, skipped = 0
  const mismatches: ImportMismatch[] = []
  for (const r of rows.slice(hi + 1)) {
    const filled = r.map(x => x.trim()).filter(Boolean)
    if (filled.length === 0) continue
    const name = cell(r, 'name')
    const isNumbery = cell(r, 'qty') !== '' || (cell(r, 'unit_price') !== '' && toNum(cell(r, 'unit_price')) !== 0)
    // 小見出しの行（「テーブル&チェア」など）：文字が1〜2個だけで、数量・単価が空
    if (!isNumbery && !cell(r, 'orderer') && filled.length <= 2) {
      section = name || filled[0]
      sections++
      continue
    }
    if (!name) { skipped++; continue }
    const status = cell(r, 'status') || '未選定'
    const qty = toNum(cell(r, 'qty'))
    let unit = toNum(cell(r, 'unit_price'))
    // シートの単価は 1,567.5円 のように小数を持っていても、CSVでは ¥1,568 に丸めて出る。
    // 合計（税込）が単価×数量と1〜2円ずれるだけなら、合計÷数量を単価として使う。大きくずれる行は、確認用に知らせる
    if (totalCol >= 0 && qty > 0 && (r[totalCol] ?? '').trim() !== '') {
      const sheetTotal = toNum(r[totalCol])
      const diff = sheetTotal - unit * qty
      if (diff !== 0 && Math.abs(diff) <= qty) unit = Math.round((sheetTotal / qty) * 100) / 100
      else if (Math.abs(diff) > qty) mismatches.push({ name, unit, qty, sheetTotal })
    }
    items.push({
      category, section, orderer: cell(r, 'orderer'), staff: cell(r, 'staff'), status, ordered_at: toDate(cell(r, 'ordered_at')),
      vendor: cell(r, 'vendor'), name, spec: cell(r, 'spec'), color: cell(r, 'color'), pack_qty: cell(r, 'pack_qty'), qty,
      url: cell(r, 'url'), note: cell(r, 'note'), unit_price: unit, ship_to: cell(r, 'ship_to'),
      want_date: toDate(cell(r, 'want_date')), fixed_date: toDate(cell(r, 'fixed_date')),
      done: /^(true|✓|☑|済|1)$/i.test(cell(r, 'done')), pay_method: cell(r, 'pay_method'), invoice_set: cell(r, 'invoice_set'), pay_month: cell(r, 'pay_month'),
      investor_mode: 'show',
    })
  }
  return { items, sections, skipped, mismatches }
}

// ファイル名から、区分（カテゴリ）を推測する
export const guessCategory = (filename: string) => (FFE_CATEGORIES.find(c => filename.includes(c)) ?? '家具')
