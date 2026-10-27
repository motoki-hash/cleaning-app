'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MoneyInput, isCommitEnter } from '../../components/ui'
import { categorySales } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen } from '@/lib/pjb/format'
import { logActivity } from '@/lib/pjb/activity'
import type { BudgetCategory, SalesItem, VeItem } from '@/lib/pjb/types'

// VE/CD表（スプレッドシート風）。元値と変更金額を並べて、想定増減金額（変更金額−元値）を自動で出す。
// 「採用可否」にチェックした行の想定増減が、予算（実行費用）に反映される。

const ALL = '__all__'

function TextCell({ value, onSave, placeholder, bold }: { value: string; onSave: (v: string) => void; placeholder?: string; bold?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v) }}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
      className={`w-full bg-transparent px-1.5 py-2 text-[12.5px] rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 ${bold ? 'font-medium text-slate-900' : 'text-slate-700'}`}
    />
  )
}

function AmountCell({ value, onSave, formulaKey }: { value: number; onSave: (v: number) => void; formulaKey: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  return (
    <span onBlur={() => { const n = Number(draft) || 0; if (n !== value) onSave(n) }}>
      <MoneyInput
        value={draft} onChange={setDraft} formulaKey={formulaKey} allowNegative placeholder="0"
        className="w-full bg-transparent px-1.5 py-2 text-[12.5px] text-right tabular-nums rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
    </span>
  )
}

export default function VeSheet({
  projectId, categories, veItems, salesItems, onChanged,
}: { projectId: string; categories: BudgetCategory[]; veItems: VeItem[]; salesItems: SalesItem[] | null; onChanged: () => void }) {
  // 対象は「内装工事（BNS外予算）」と「追加工事（BNS予算）」の2つだけ（どちらも無いときだけ全カテゴリー）
  const targets = useMemo(() => {
    const t = categories.filter(c => (c.name === '内装工事' && c.group_name === 'BNS外予算') || (c.name === '追加工事' && c.group_name === 'BNS予算'))
    return t.length > 0 ? t : categories
  }, [categories])
  const defaultCat = targets[0]?.id ?? ALL
  const [catId, setCatId] = useState<string>(defaultCat)
  useEffect(() => { if (!targets.some(c => c.id === catId)) setCatId(defaultCat) }, [targets, catId, defaultCat])

  const cat = categories.find(c => c.id === catId)
  const items = useMemo(
    () => veItems
      .filter(v => (catId === ALL ? true : v.category_id === catId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [veItems, catId],
  )

  const orig = (v: VeItem) => v.original_amount ?? 0
  const chg = (v: VeItem) => v.changed_amount ?? 0
  const delta = (v: VeItem) => chg(v) - orig(v)               // 想定増減金額（マイナス＝減額）
  const adopted = (v: VeItem) => v.status === '採用'

  const adoptedTotal = items.filter(adopted).reduce((s, v) => s + delta(v), 0)
  const allTotal = items.reduce((s, v) => s + delta(v), 0)

  // 上の集計（スプレッドシートの「内装工事予算／見積／目標VE額／VE・増減金額／差額・合計」）
  const budget = cat ? (cat.group_name === 'BNS予算' ? categorySales(cat, salesItems) : cat.original_budget) : 0
  const quote = cat ? cat.latest_budget : 0                 // 取得した見積金額（内訳の合計）
  const target = quote - budget                              // 目標VE額（プラス＝予算超過、削る必要がある額）
  const finalDiff = target + adoptedTotal                    // 増減の最終金額

  const save = async (v: VeItem, patch: Partial<VeItem>, label: string, before?: unknown, after?: unknown) => {
    const next = { ...v, ...patch }
    // 想定増減金額（削減額）を、予算への反映用の項目にも常に合わせておく
    const reduction = orig(next) - chg(next)
    const { error } = await supabase.from('pjb_ve_items').update({
      ...patch, planned_reduction: reduction, confirmed_reduction: reduction, updated_at: new Date().toISOString(),
    }).eq('id', v.id)
    if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ016を実行していない場合は、先に実行してください）`); return }
    await logActivity({ projectId, action: 'update', entityType: 've_item', entityLabel: `${v.content || '（無題）'} ${label}`, before: String(before ?? ''), after: String(after ?? '') })
    onChanged()
  }

  const addRow = async (count = 1) => {
    if (catId === ALL) { alert('行を追加するには、上でカテゴリーを選んでください。'); return }
    const rows = Array.from({ length: count }, () => ({
      project_id: projectId, category_id: catId, content: '', planned_reduction: 0, confirmed_reduction: 0,
      original_amount: 0, changed_amount: 0, status: '検討中',
    }))
    const { error } = await supabase.from('pjb_ve_items').insert(rows)
    if (error) { alert(`追加に失敗しました：${error.message}（SQLパッチ016を実行していない場合は、先に実行してください）`); return }
    onChanged()
  }

  // 入力済みの行を、もう一方のカテゴリー（内装工事⇄追加工事）へ移す
  const moveTo = targets.find(c => c.id !== catId)
  const move = async (v: VeItem) => {
    if (!moveTo) return
    if (!confirm(`「${v.content || '（無題）'}」を ${moveTo.name}（${moveTo.group_name}）に移動しますか？`)) return
    const { error } = await supabase.from('pjb_ve_items').update({ category_id: moveTo.id, updated_at: new Date().toISOString() }).eq('id', v.id)
    if (error) { alert(`移動に失敗しました：${error.message}`); return }
    await logActivity({ projectId, action: 'update', entityType: 've_item', entityLabel: `${v.content || '（無題）'} カテゴリー`, before: cat ? `${cat.name}（${cat.group_name}）` : '', after: `${moveTo.name}（${moveTo.group_name}）` })
    onChanged()
  }

  const remove = async (v: VeItem) => {
    if ((v.content || orig(v) || chg(v)) && !confirm(`「${v.content || '（無題）'}」を削除しますか？`)) return
    const { error } = await supabase.from('pjb_ve_items').delete().eq('id', v.id)
    if (error) { alert(`削除に失敗しました：${error.message}`); return }
    await logActivity({ projectId, action: 'delete', entityType: 've_item', entityLabel: v.content || '（無題）', before: String(orig(v) - chg(v)) })
    onChanged()
  }

  const toggleAdopt = (v: VeItem, on: boolean) => {
    if (on && !v.category_id) { alert('対象カテゴリーがないため、予算に反映できません。上でカテゴリーを選んで、行を追加し直してください。'); return }
    save(v, { status: on ? '採用' : '検討中' }, '採用可否', v.status, on ? '採用' : '検討中')
  }

  const header = 'px-1.5 py-2 text-left text-[11.5px] leading-tight font-semibold text-white align-bottom'
  const cell = 'border-b border-slate-200'

  return (
    <div>
      {/* 対象カテゴリー */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[13px] text-slate-500">対象</span>
        <select value={catId} onChange={e => setCatId(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] bg-white">
          {targets.map(c => <option key={c.id} value={c.id}>{c.name}（{c.group_name}）</option>)}
        </select>
        <span className="text-[12.5px] text-slate-400">カテゴリーごとに、元値と変更金額を比べます</span>
      </div>

      {/* 集計 */}
      {cat && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-4 max-w-xl">
          {([
            [`${cat.name}予算`, formatYen(budget), '当初予算（BNS予算は売上）', ''],
            [`${cat.name}見積`, formatYen(quote), '取得した見積金額（内訳の合計）', ''],
            ['目標VE額', formatSignedYen(target), '見積−予算（プラス＝予算超過）', target > 0 ? 'text-rose-600' : 'text-slate-900'],
            ['VE／増減金額', formatSignedYen(adoptedTotal), '採用可否にチェックした行の合計', adoptedTotal < 0 ? 'text-emerald-700' : 'text-slate-900'],
            ['差額／合計', formatSignedYen(finalDiff), '増減の最終金額（目標VE額＋VE／増減金額）', finalDiff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'],
          ] as Array<[string, string, string, string]>).map(([label, value, note, tone], i) => (
            <div key={label} className={`grid grid-cols-[8.5rem_9rem_1fr] items-center ${i >= 2 ? 'bg-slate-50' : ''} ${i > 0 ? 'border-t border-slate-100' : ''}`}>
              <div className="px-3 py-2 text-[13px] font-semibold text-slate-700">{label}</div>
              <div className={`px-3 py-2 text-right tabular-nums text-[14px] font-semibold ${tone || 'text-slate-900'}`}>{value}</div>
              <div className="px-3 py-2 text-[12px] text-slate-400">← {note}</div>
            </div>
          ))}
        </div>
      )}

      {/* 表 */}
      <div className="rounded-xl border border-slate-300 bg-white overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-[12.5px]">
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-700">
              <th className={`${header} text-center`}>No.</th>
              <th className={header}>図面番号</th>
              <th className={header}>項目</th>
              <th className={header}>増減対象：<br />VE・CD候補</th>
              <th className={`${header} text-center`}>採用可否</th>
              <th className={`${header} text-right`}>元値<br />（現状金額）</th>
              <th className={`${header} text-right`}>変更金額</th>
              <th className={`${header} text-right`}>想定<br />増減金額</th>
              <th className={header}>設計会社<br />コメント欄</th>
              <th className={header}>別途質疑・<br />コメント、備考</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">まだVE／CDの行がありません。下の「＋ 行を追加」から入力してください。</td></tr>
            )}
            {items.map((v, i) => (
              <tr key={v.id} className={`${adopted(v) ? 'bg-emerald-50/50' : ''} hover:bg-slate-50`}>
                <td className={`${cell} text-center text-slate-400 tabular-nums`}>{i + 1}</td>
                <td className={cell}><TextCell value={v.drawing_no ?? ''} onSave={x => save(v, { drawing_no: x || null }, '図面番号', v.drawing_no, x)} /></td>
                <td className={cell}><TextCell bold value={v.content} placeholder="例）M：木紐無垢材" onSave={x => save(v, { content: x }, '項目', v.content, x)} /></td>
                <td className={cell}><TextCell value={v.target_item ?? ''} placeholder="例）他に安価なやり方or中止" onSave={x => save(v, { target_item: x || null }, '増減対象', v.target_item, x)} /></td>
                <td className={`${cell} text-center`}>
                  <input type="checkbox" checked={adopted(v)} onChange={e => toggleAdopt(v, e.target.checked)} className="w-4 h-4 accent-emerald-700 cursor-pointer" aria-label="採用可否" />
                </td>
                <td className={cell}><AmountCell value={orig(v)} formulaKey={`ve:${v.id}:orig`} onSave={n => save(v, { original_amount: n }, '元値', orig(v), n)} /></td>
                <td className={cell}><AmountCell value={chg(v)} formulaKey={`ve:${v.id}:chg`} onSave={n => save(v, { changed_amount: n }, '変更金額', chg(v), n)} /></td>
                <td className={`${cell} px-2 text-right tabular-nums font-semibold ${delta(v) < 0 ? 'text-emerald-700' : delta(v) > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                  {formatSignedYen(delta(v))}
                </td>
                <td className={cell}><TextCell value={v.designer_comment ?? ''} onSave={x => save(v, { designer_comment: x || null }, '設計会社コメント', v.designer_comment, x)} /></td>
                <td className={cell}><TextCell value={v.notes ?? ''} onSave={x => save(v, { notes: x || null }, '備考', v.notes, x)} /></td>
                <td className={`${cell} text-center`}>
                  {moveTo && (
                    <button onClick={() => move(v)} title={`${moveTo.name}（${moveTo.group_name}）へ移動`} className="mr-1 text-[11px] text-slate-400 hover:text-slate-700 border border-slate-200 rounded px-1 py-0.5 whitespace-nowrap">→{moveTo.name.slice(0, 2)}</button>
                  )}
                  <button onClick={() => remove(v)} className="text-slate-300 hover:text-rose-500" aria-label="行を削除">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-700 text-white">
              <td colSpan={5} className="px-3 py-2.5 text-right text-[12px]">合計（採用可否にチェックした行）</td>
              <td colSpan={2} className="px-1.5 py-2.5 text-right text-[11.5px] text-slate-300 leading-tight">候補すべて<br />{formatSignedYen(allTotal)}</td>
              <td className="px-1.5 py-2.5 text-right tabular-nums font-bold text-[13px]">{formatSignedYen(adoptedTotal)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => addRow(1)} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">＋ 行を追加</button>
        <button onClick={() => addRow(5)} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">＋ 5行追加</button>
        <span className="text-[12px] text-slate-400">金額の欄は、計算式も入力できます（例：1200000*0.8）</span>
      </div>
    </div>
  )
}
