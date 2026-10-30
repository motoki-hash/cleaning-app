'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPeriod, loadPeriods, periodLabelOf, type PeriodInfo } from '@/lib/pjb/periods'

// ページを切り替えても一瞬消えないよう、前回の結果を覚えておく
const cache = new Map<string, { list: PeriodInfo[]; ready: boolean }>()

// 案件の「期」の切り替え（1期・2期…）と、期の追加。いま開いているページ（予実管理・発注など）のまま期だけ切り替える
export default function PeriodSwitcher({ projectId, pageHref, variant }: { projectId: string; pageHref: string; variant: 'side' | 'top' }) {
  const router = useRouter()
  const [state, setState] = useState(cache.get(projectId) ?? null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let alive = true
    loadPeriods(projectId).then(r => { cache.set(projectId, r); if (alive) setState(r) })
    return () => { alive = false }
  }, [projectId])

  if (!state || !state.ready) return null
  const grouped = state.list.length > 1 || !!state.list[0]?.group_id
  const side = variant === 'side'

  const chip = (active: boolean) => side
    ? `px-2.5 py-1 rounded-full border text-[13px] whitespace-nowrap ${active ? 'bg-[#e2efe8] text-[#17382f] border-transparent font-semibold' : 'border-white/25 text-emerald-50/90 hover:bg-white/10'}`
    : `px-3 py-1.5 rounded-full border text-[13px] whitespace-nowrap ${active ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-200'}`

  return (
    <>
      <div className={side ? 'mt-3 flex flex-wrap items-center gap-1.5' : 'flex gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar items-center'}>
        {grouped && state.list.map(p => (
          <button key={p.id} onClick={() => { if (p.id !== projectId) router.push(`/pjb/${p.id}${pageHref}`) }} className={chip(p.id === projectId)}
            title={p.sales_month ? `売上計上月 ${p.sales_month.slice(0, 7).replace('-', '年')}月` : '売上計上月は未設定'}>
            {periodLabelOf(p) || '期'}
          </button>
        ))}
        <button onClick={() => setAdding(true)} className={`${chip(false)} border-dashed`}>＋ 期を追加</button>
      </div>
      {adding && (
        <AddPeriodModal
          nextNo={Math.max(1, ...state.list.map(p => p.period_no ?? 1)) + 1}
          onClose={() => setAdding(false)}
          onSubmit={async (label, salesMonth) => {
            const r = await addPeriod(projectId, { label, salesMonth })
            if (r.error || !r.id) return r.error ?? '追加できませんでした'
            cache.clear()
            router.push(`/pjb/${r.id}`)
            return null
          }}
        />
      )}
    </>
  )
}

function AddPeriodModal({ nextNo, onClose, onSubmit }: { nextNo: number; onClose: () => void; onSubmit: (label: string, salesMonth: string | null) => Promise<string | null> }) {
  const [label, setLabel] = useState(`${nextNo}期`)
  const [month, setMonth] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true); setError('')
    const err = await onSubmit(label, month ? `${month}-01` : null)
    if (err) { setError(err); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 text-slate-900">
        <div className="text-[15px] font-semibold mb-1">期を追加</div>
        <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">この案件に新しい期を作ります。事業・会社・担当者は引き継ぎ、予算・発注・スケジュールは空から始めます。売上計上月は期ごとに持てます。</p>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">期の名前</span>
            <input value={label} onChange={e => setLabel(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" />
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">この期の売上計上月（任意・あとから変更できます）</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px] bg-white" />
          </label>
        </div>
        {error && <p className="text-[13px] text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
          <button onClick={submit} disabled={busy || !label.trim()} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">{busy ? '作成中…' : '追加する'}</button>
        </div>
      </div>
    </div>
  )
}
