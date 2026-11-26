'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { periodName, periodLabelOf } from '@/lib/pjb/periods'
import { applyFfeBudget, loadFfeBudgetState, planFfeBudget, type BudgetState } from '@/lib/pjb/ffeBudget'
import { formatYen } from '@/lib/pjb/format'
import { templateItems, TEMPLATE_CATEGORIES, type FurnitureBy } from '@/lib/pjb/ffeTemplate'
import { FFE_CATEGORIES, guessCategory, parseSheetCsv, type FfeItem, type ImportResult } from '@/lib/pjb/ffe'

type NewItem = Omit<FfeItem, 'id' | 'project_id' | 'sort_order'>

const Backdrop = ({ children, onClose, busy }: { children: React.ReactNode; onClose: () => void; busy: boolean }) => (
  <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center print:hidden">
    <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onClose} />
    <div className="relative w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5">{children}</div>
  </div>
)

// ---- Googleスプレッドシートから取り込む（タブごとにCSVで保存したファイル）----
type FileState = { name: string; category: string; text: string; result: ImportResult }

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (items: NewItem[], replaceAll: boolean) => Promise<string | null> }) {
  const [files, setFiles] = useState<FileState[]>([])
  const [replaceAll, setReplaceAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (list: FileList | null) => {
    if (!list) return
    const next: FileState[] = []
    for (const f of Array.from(list)) {
      const text = await f.text()
      const category = guessCategory(f.name)
      next.push({ name: f.name, category, text, result: parseSheetCsv(text, category) })
    }
    setFiles(prev => [...prev, ...next])
  }
  const setCategory = (i: number, category: string) =>
    setFiles(prev => prev.map((f, k) => k === i ? { ...f, category, result: parseSheetCsv(f.text, category) } : f))

  const total = files.reduce((s, f) => s + f.result.items.length, 0)
  const run = async () => {
    setBusy(true)
    setError('')
    const msg = await onImport(files.flatMap(f => f.result.items), replaceAll)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  return (
    <Backdrop onClose={onClose} busy={busy}>
      <div className="text-[16px] font-semibold text-slate-900 mb-1">スプレッドシートから取り込む</div>
      <ol className="text-[13px] text-slate-600 leading-relaxed list-decimal pl-5 mb-3">
        <li>Googleスプレッドシートで、取り込みたいタブ（家具-BNS・家電など）を開きます。</li>
        <li>「ファイル → ダウンロード → カンマ区切りの値（.csv）」で保存します（タブごとに1ファイル）。</li>
        <li>下のボタンで、保存したファイルを選びます（複数まとめて選べます）。</li>
      </ol>
      <input type="file" accept=".csv,text/csv" multiple onChange={e => { pick(e.target.files); e.target.value = '' }} className="block w-full text-[13px] mb-3" />

      {files.map((f, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-medium text-slate-800 truncate flex-1">{f.name}</div>
            <select value={f.category} onChange={e => setCategory(i, e.target.value)} className="text-[13px] border border-slate-300 rounded px-2 py-1">
              {FFE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={() => setFiles(prev => prev.filter((_, k) => k !== i))} className="text-slate-400 hover:text-rose-600 px-1">×</button>
          </div>
          {f.result.error
            ? <div className="text-[12.5px] text-rose-600 mt-1">{f.result.error}</div>
            : <div className="text-[12.5px] text-slate-500 mt-1">{f.result.items.length}品目（小見出し {f.result.sections}個）を取り込みます{f.result.skipped > 0 ? `／商品名がなく読み飛ばした行 ${f.result.skipped}` : ''}</div>}
          {f.result.mismatches.length > 0 && (
            <div className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[12.5px] text-amber-900">
              <div className="font-medium">シートの「合計（税込）」と、単価×数量が合わない行があります（シート側の式が上書きされている可能性）</div>
              {f.result.mismatches.map((m, k) => (
                <div key={k}>・{m.name}：単価 ¥{m.unit.toLocaleString('ja-JP')} × {m.qty} ＝ ¥{Math.round(m.unit * m.qty).toLocaleString('ja-JP')}、シートの合計は ¥{m.sheetTotal.toLocaleString('ja-JP')}</div>
              ))}
              <div className="mt-0.5">取り込みでは「単価×数量」を使います。取り込み後に、正しい方へ直してください。</div>
            </div>
          )}
        </div>
      ))}
      {files.length > 0 && <p className="text-[12px] text-slate-400 mb-2">※ 家具-BNSと家具-デザイナーのように、同じ品目が2つのタブにある場合は、取り込み後に重複を整理してください。</p>}
      <label className="flex items-start gap-2 text-[13px] text-slate-700 mt-2">
        <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} className="mt-1" />
        <span>取り込む前に、この案件の品目をすべて削除する（取り込み直し用。2回目の取り込みで二重にならないように）</span>
      </label>
      {error && <p className="text-[13px] text-rose-600 mb-2 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
        <button onClick={run} disabled={busy || total === 0} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-[14px] font-medium disabled:opacity-40">
          {busy ? '取り込み中…' : `${total}品目を取り込む`}
        </button>
      </div>
    </Backdrop>
  )
}

// ---- 他の案件の品目表をコピーする ----
type ProjectRow = { id: string; name: string; period_no: number | null; period_label: string | null }

export function CopyDialog({ projectId, onClose, onCopied }: { projectId: string; onClose: () => void; onCopied: (items: NewItem[]) => Promise<string | null> }) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [src, setSrc] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [reset, setReset] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('pjb_projects').select('id, name, period_no, period_label').order('name').then(({ data }) => {
      setProjects(((data || []) as ProjectRow[]).filter(p => p.id !== projectId))
    })
  }, [projectId])
  useEffect(() => {
    setCount(null)
    if (!src) return
    supabase.from('pjb_ffe_items').select('id', { count: 'exact', head: true }).eq('project_id', src).then(({ count: c }) => setCount(c ?? 0))
  }, [src])

  const run = async () => {
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.from('pjb_ffe_items').select('*').eq('project_id', src).order('sort_order')
    if (err) { setBusy(false); setError(err.message); return }
    const items = ((data || []) as FfeItem[]).map(({ id, project_id, sort_order, ...rest }) => {
      void id; void project_id; void sort_order
      return reset
        ? { ...rest, status: '未選定', ordered_at: null, want_date: null, fixed_date: null, done: false, pay_method: '', invoice_set: '', pay_month: '', ...('checked_at' in rest ? { checked_price: null, checked_at: null } : {}) }
        : rest
    })
    const msg = await onCopied(items)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  return (
    <Backdrop onClose={onClose} busy={busy}>
      <div className="text-[16px] font-semibold text-slate-900 mb-1">他の案件からコピー</div>
      <p className="text-[13px] text-slate-600 mb-3">選んだ案件の品目表を、この案件の末尾に追加します。この案件にある品目は、そのまま残ります。</p>
      <select value={src} onChange={e => setSrc(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[14px] mb-2">
        <option value="">コピー元の案件を選ぶ</option>
        {projects.map(p => <option key={p.id} value={p.id}>{periodName(p.name, periodLabelOf(p))}</option>)}
      </select>
      {src && <div className="text-[13px] text-slate-500 mb-2">{count === null ? '確認中…' : `${count}品目あります`}</div>}
      <label className="flex items-start gap-2 text-[13px] text-slate-700 mb-3">
        <input type="checkbox" checked={reset} onChange={e => setReset(e.target.checked)} className="mt-1" />
        <span>ステータス・日付・完了・支払の情報はリセットする（おすすめ。<br />品目名・数量・単価・購入先・投資家の扱いはそのままコピーします）</span>
      </label>
      {error && <p className="text-[13px] text-rose-600 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
        <button onClick={run} disabled={busy || !src || !count} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-[14px] font-medium disabled:opacity-40">{busy ? 'コピー中…' : 'コピーする'}</button>
      </div>
    </Backdrop>
  )
}


// ---- 雛形から入れる（標準の品目を、まとめて追加する）----
export function TemplateDialog({ existing, onClose, onAdd }: { existing: number; onClose: () => void; onAdd: (items: NewItem[]) => Promise<string | null> }) {
  const [cats, setCats] = useState<string[]>([...TEMPLATE_CATEGORIES])
  const [by, setBy] = useState<FurnitureBy>('BNS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const preview = templateItems(cats, by)
  const countOf = (c: string) => templateItems([c], by).length

  const run = async () => {
    if (preview.length === 0) return
    setBusy(true)
    setError('')
    const msg = await onAdd(preview)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  return (
    <Backdrop onClose={onClose} busy={busy}>
      <h2 className="text-[17px] font-bold text-slate-900 mb-1">雛形から入れる</h2>
      <p className="text-[13px] text-slate-500 mb-4">標準の品目を、区分ごとにまとめて追加します。入れたあとで、品目の追加・削除・金額の変更ができます。</p>

      <div className="text-[13px] font-medium text-slate-700 mb-1.5">入れる区分</div>
      <div className="grid gap-1.5 mb-4">
        {TEMPLATE_CATEGORIES.map(c => (
          <label key={c} className="flex items-center gap-2 text-[14px] text-slate-800 cursor-pointer">
            <input type="checkbox" checked={cats.includes(c)} onChange={e => setCats(e.target.checked ? [...cats, c] : cats.filter(x => x !== c))} />
            {c}<span className="text-[12px] text-slate-400">{countOf(c)}品目</span>
          </label>
        ))}
      </div>

      {cats.includes('家具') && (
        <div className="mb-4">
          <div className="text-[13px] font-medium text-slate-700 mb-1.5">家具の手配</div>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden bg-white text-[13.5px]">
            {(['BNS', 'デザイナー'] as const).map(b => (
              <button key={b} onClick={() => setBy(b)} className={`px-3.5 py-2 ${by === b ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{b}が手配</button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700 px-3 py-2 mb-4 leading-relaxed">
        追加する品目：<b>{preview.length}</b>件
        {existing > 0 && <><br />この案件には、すでに <b>{existing}</b> 件の品目があります。<b>いまの品目は消えず、その後ろに追加されます。</b></>}
        <br />ステータスは「未選定」（一部は「選定済」）で入ります。
      </div>

      {error && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-[14px] rounded-lg border border-slate-300 text-slate-700 bg-white">やめる</button>
        <button onClick={run} disabled={busy || preview.length === 0} className="px-4 py-2 text-[14px] rounded-lg bg-blue-600 text-white disabled:opacity-40">{busy ? '追加中…' : `${preview.length}件を追加する`}</button>
      </div>
    </Backdrop>
  )
}

// ---- 予実管理へ反映する（売上＝BNS手配FFEの税別合計、原価＝発注済・納品済の購入先ごとの合計）----
export function ReflectDialog({ projectId, items, onClose }: { projectId: string; items: FfeItem[]; onClose: () => void }) {
  const plan = useMemo(() => planFfeBudget(items), [items])
  const [state, setState] = useState<BudgetState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => { loadFfeBudgetState(projectId).then(setState) }, [projectId])

  const isFfe = (t: string) => t.startsWith('FFE｜')
  const manualSales = state?.sales.filter(r => !isFfe(r.title)) ?? []
  const manualOrders = state?.orders.filter(r => !isFfe(r.title)) ?? []
  const run = async () => {
    setBusy(true)
    setError('')
    const msg = await applyFfeBudget(projectId, items)
    setBusy(false)
    if (msg) setError(msg); else setDone(true)
  }
  const Row = ({ a, b, c }: { a: string; b?: string; c: string }) => (
    <div className="flex items-baseline gap-2 py-1 border-b border-slate-100 text-[13px]">
      <span className="flex-1 text-slate-800">{a}</span>
      {b && <span className="text-[12px] text-slate-400">{b}</span>}
      <span className="tabular-nums text-slate-900 w-28 text-right">{c}</span>
    </div>
  )

  return (
    <Backdrop onClose={onClose} busy={busy}>
      <h2 className="text-[17px] font-bold text-slate-900 mb-1">予実管理へ反映する</h2>
      <p className="text-[13px] text-slate-500 mb-4">「BNS予算」の「FFE・OSE費用」に、FFEの金額を入れます。金額はすべて税別です。FFEを直したら、もう一度押すと、入れ替わります。</p>

      <div className="text-[13px] font-medium text-slate-700 mb-1">売上（BNS手配のFFE。キャンセルを除く）</div>
      <div className="mb-1">
        {plan.sales.length === 0 && <div className="text-[13px] text-slate-400 py-1">反映する売上がありません</div>}
        {plan.sales.map(r => <Row key={r.title} a={r.title.replace('FFE｜', '')} b={`${r.count}品目`} c={formatYen(r.amount)} />)}
        <Row a="売上の合計" c={formatYen(plan.salesTotal)} />
      </div>
      {manualSales.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px] px-3 py-2 mb-4 leading-relaxed">
          いま手入力されている売上は、<b>消えて、FFEの金額に入れ替わります</b>：
          {manualSales.map(r => <div key={r.id}>・{r.title}　{formatYen(r.amount)}</div>)}
        </div>
      )}

      <div className="text-[13px] font-medium text-slate-700 mb-1 mt-3">原価（BNS手配のうち、発注済・納品済。購入先ごと）</div>
      <div className="mb-1">
        {plan.orders.length === 0 && <div className="text-[13px] text-slate-400 py-1">発注済・納品済の品目がまだありません（原価は入りません）</div>}
        {plan.orders.map(r => <Row key={r.title} a={r.vendor || '（購入先が未設定）'} b={`${r.count}品目・${r.status === '完了' ? '納品済' : '発注済'}`} c={formatYen(r.amount)} />)}
        <Row a="原価の合計" c={formatYen(plan.ordersTotal)} />
      </div>
      {manualOrders.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px] px-3 py-2 mb-4 leading-relaxed">
          発注管理の「FFE・OSE費用」に、手入力の発注が {manualOrders.length} 件あります（消しません）。FFEの発注と二重になっていないか、確認してください。
        </div>
      )}
      {state && !state.categoryId && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] px-3 py-2">この案件の予実管理に、「BNS予算」の「FFE・OSE費用」の項目がありません。</div>}
      {error && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] px-3 py-2">{error}</div>}
      {done && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] px-3 py-2">予実管理へ反映しました。<Link href={`/pjb/${projectId}/budget`} className="underline ml-1">予実管理を開く</Link></div>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-[14px] rounded-lg border border-slate-300 text-slate-700 bg-white">{done ? '閉じる' : 'やめる'}</button>
        {!done && <button onClick={run} disabled={busy || !state?.categoryId} className="px-4 py-2 text-[14px] rounded-lg bg-blue-600 text-white disabled:opacity-40">{busy ? '反映中…' : '予実管理へ反映する'}</button>}
      </div>
    </Backdrop>
  )
}
