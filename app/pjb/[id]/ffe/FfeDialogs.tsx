'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { periodName, periodLabelOf } from '@/lib/pjb/periods'
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

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (items: NewItem[]) => Promise<string | null> }) {
  const [files, setFiles] = useState<FileState[]>([])
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
    const msg = await onImport(files.flatMap(f => f.result.items))
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
        </div>
      ))}
      {files.length > 0 && <p className="text-[12px] text-slate-400 mb-2">※ 家具-BNSと家具-デザイナーのように、同じ品目が2つのタブにある場合は、取り込み後に重複を整理してください。</p>}
      {error && <p className="text-[13px] text-rose-600 mb-2">{error}</p>}
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
        ? { ...rest, status: '未選定', ordered_at: null, want_date: null, fixed_date: null, done: false, pay_method: '', invoice_set: '', pay_month: '' }
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
