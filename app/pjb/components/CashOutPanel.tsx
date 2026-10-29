'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/pjb/activity'
import { formatYen, formatDate } from '@/lib/pjb/format'
import { InlineAmount, InlineText, MoneyInput, SectionTitle, isCommitEnter } from './ui'
import type { CashOut } from '@/lib/pjb/types'

// BNSキャッシュ持ち出し：売上にならず、BNSが補填する費用。
// 売上・原価・利益・予算の計算には含めず、別枠で合計だけを見る（トップのダッシュボードと年度の売上分析にも出る）
const today = () => new Date().toISOString().slice(0, 10)

export default function CashOutPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<CashOut[]>([])
  const [missing, setMissing] = useState(false)
  const [date, setDate] = useState(today())
  const [content, setContent] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('pjb_cash_outs').select('*').eq('project_id', projectId).order('occurred_on', { ascending: true }).order('created_at', { ascending: true })
    if (error) { setMissing(true); return }
    setMissing(false)
    setItems((data || []) as CashOut[])
  }, [projectId])
  useEffect(() => { load() }, [load])

  const total = items.reduce((s, x) => s + Number(x.amount || 0), 0)

  const add = async () => {
    if (!content.trim() || !amount) { alert('内容と金額を入れてください'); return }
    setSaving(true)
    const { error } = await supabase.from('pjb_cash_outs').insert({ project_id: projectId, occurred_on: date || today(), content: content.trim(), amount: Number(amount) })
    setSaving(false)
    if (error) { alert(`登録に失敗しました：${error.message}（SQLパッチ020を実行していない場合は、先に実行してください）`); return }
    await logActivity({ projectId, action: 'create', entityType: 'cash_out', entityLabel: `キャッシュ持ち出し：${content.trim()}`, after: amount })
    setContent(''); setAmount('')
    load()
  }
  const update = async (it: CashOut, patch: Partial<CashOut>, label: string, before: unknown, after: unknown) => {
    const { error } = await supabase.from('pjb_cash_outs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', it.id)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    await logActivity({ projectId, action: 'update', entityType: 'cash_out', entityLabel: `キャッシュ持ち出し：${it.content} ${label}`, before: String(before ?? ''), after: String(after ?? '') })
    load()
  }
  const remove = async (it: CashOut) => {
    if (!confirm(`「${it.content || '（無題）'}」を削除しますか？`)) return
    const { error } = await supabase.from('pjb_cash_outs').delete().eq('id', it.id)
    if (error) { alert(`削除に失敗しました：${error.message}`); return }
    await logActivity({ projectId, action: 'delete', entityType: 'cash_out', entityLabel: `キャッシュ持ち出し：${it.content}`, before: String(it.amount) })
    load()
  }

  return (
    <div className="mt-6">
      <SectionTitle>BNSキャッシュ持ち出し</SectionTitle>
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-300 flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-slate-800">売上にならず、BNSが補填した費用</span>
          <span className="text-[12px] text-slate-500">売上・原価・利益の計算には入りません。合計だけ、トップと年度の売上分析に出ます</span>
        </div>

        {missing && <p className="px-4 py-3 text-[13px] text-amber-700 bg-amber-50">持ち出しを保存するテーブルがまだありません。SQLパッチ020を実行すると使えるようになります。</p>}

        <div className="p-3 grid gap-2">
          {items.length === 0 && !missing && <p className="text-[13px] text-slate-400 px-1">まだ持ち出しはありません。下から追加してください。</p>}
          {items.map(it => (
            <div key={it.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_1.5rem] gap-2 items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
              <input
                type="date" defaultValue={it.occurred_on}
                onBlur={e => { if (e.target.value && e.target.value !== it.occurred_on) update(it, { occurred_on: e.target.value }, '日付', it.occurred_on, e.target.value) }}
                onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
                className="text-[12.5px] border border-slate-200 rounded-md px-1.5 py-1 bg-white" aria-label={`日付 ${formatDate(it.occurred_on)}`}
              />
              <InlineText boxed value={it.content} onCommit={v => update(it, { content: v }, '内容', it.content, v)} className="text-[13.5px] font-medium text-slate-900" />
              <InlineAmount boxed emphasize value={Number(it.amount)} formulaKey={`cash:${it.id}`} onCommit={v => update(it, { amount: v }, '金額', it.amount, v)} />
              <button onClick={() => remove(it)} className="text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除">✕</button>
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_8.5rem_auto] items-center rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-[12.5px] border border-slate-200 rounded-md px-1.5 py-1.5 bg-white" />
            <input
              value={content} onChange={e => setContent(e.target.value)} placeholder="内容（例：設計会社への立替）"
              onKeyDown={e => { if (isCommitEnter(e)) add() }}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] min-w-0"
            />
            <MoneyInput value={amount} onChange={setAmount} placeholder="金額（税別）" className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] text-right tabular-nums" />
            <button onClick={add} disabled={saving} className="text-[13.5px] px-3 py-1.5 rounded-lg bg-[#17382f] text-white disabled:opacity-50 whitespace-nowrap">＋ 追加</button>
          </div>
        </div>

        <div className="px-4 py-3 border-t-2 border-slate-300 bg-slate-100 flex items-center justify-between">
          <span className="font-bold text-slate-900 text-[13.5px]">BNSキャッシュ持ち出し 合計</span>
          <span className="font-bold tabular-nums text-slate-900">{formatYen(total)}</span>
        </div>
      </div>
    </div>
  )
}
