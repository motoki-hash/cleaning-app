'use client'

import { Fragment, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import { KpiCard, StatePill, SectionTitle, EmptyState, InlineAmount, InlineText, MoneyInput } from '../../components/ui'
import { useProjectData, findOrCreateVendor } from '@/lib/pjb/useProjectData'
import { summarizeCategory, summarizeProject } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent, formatDate } from '@/lib/pjb/format'
import { createOrder, updateOrderAmount, updateOrderStatus, updateOrderTitle, updateOrderVendor, markOrderPlaced, updateOrderPaymentSchedule, markOrderPaid, deleteOrder } from '@/lib/pjb/orders'
import { ORDER_STATUSES, type BudgetCategory, type CategorySummary, type Order, type Vendor } from '@/lib/pjb/types'

const PRE_ORDER_STATUSES = new Set(['見積依頼中', '見積受領', '発注待ち'])
const STATUS_TONE: Record<string, string> = {
  '見積依頼中': 'bg-slate-100 text-slate-500',
  '見積受領': 'bg-sky-50 text-sky-600',
  '発注待ち': 'bg-amber-50 text-amber-700',
  '発注済': 'bg-blue-50 text-blue-700',
  '完了': 'bg-slate-100 text-slate-500',
  '請求書待ち': 'bg-amber-50 text-amber-700',
  '支払待ち': 'bg-amber-50 text-amber-700',
  '支払済': 'bg-emerald-50 text-emerald-700',
}

type EditableField = 'original_budget'

// 0円はうすく表示して、値のある行が目立つようにする
const zeroMute = (v: number, tone: string) => (v === 0 ? 'text-slate-300' : tone)

export default function BudgetPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, orders, additionalWorks, veItems, vendors, loading, notFound, reload } = useProjectData(id)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (categoryId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId)
      return next
    })
  }

  const summaries = useMemo(
    () => categories.map(c => summarizeCategory(c, orders, additionalWorks, veItems)),
    [categories, orders, additionalWorks, veItems]
  )
  const totals = useMemo(() => project ? summarizeProject(project, categories, summaries) : null, [project, categories, summaries])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project || !totals) {
    return <Shell projectId={id} active="budget"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const updateField = async (category: BudgetCategory, field: EditableField, value: number) => {
    if (!isFinite(value) || value === category[field]) return
    await supabase.from('pjb_budget_categories').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', category.id)
    reload()
  }

  const groups: Array<[BudgetCategory['group_name'], CategorySummary[]]> = [
    ['BNS外予算', summaries.filter(s => s.category.group_name === 'BNS外予算')],
    ['BNS予算', summaries.filter(s => s.category.group_name === 'BNS予算')],
  ]

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="budget" onQuickAdded={reload}>
      {(() => {
        const remainingRate = totals.totalBudget > 0 ? totals.remaining / totals.totalBudget : 0
        const remainTone = remainingRate < 0 ? 'danger' : remainingRate <= 0.01 ? 'warning' : 'good'
        return (
          <>
            <div className="text-[13px] font-semibold text-slate-600 mb-1.5">プロジェクト全体</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <KpiCard label="PJ総予算" value={formatYen(totals.totalBudget)} />
              <KpiCard
                label="原価（着地見込）"
                value={formatYen(totals.landingForecast)}
                tone={totals.remaining < 0 ? 'danger' : totals.consumptionRate >= 0.9 ? 'warning' : 'default'}
              />
              <KpiCard label="残予算" value={formatSignedYen(totals.remaining)} tone={totals.remaining < 0 ? 'danger' : 'good'} />
              <KpiCard label="残予算率（対総予算）" value={formatPercent(remainingRate, 1)} tone={remainTone} />
            </div>
            <div className="text-[13px] font-semibold text-slate-600 mb-1.5">BNS収益</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <KpiCard label="BNS売上" value={formatYen(totals.bnsSell)} />
              <KpiCard label="BNS原価" value={formatYen(totals.bnsCost)} />
              <KpiCard label="BNS粗利益" value={formatYen(totals.bnsGrossProfit)} tone={totals.bnsGrossProfit < 0 ? 'danger' : 'good'} />
              <KpiCard label="粗利率" value={formatPercent(totals.grossMargin, 1)} tone={totals.grossMargin < 0 ? 'danger' : 'good'} />
            </div>
          </>
        )
      })()}
      <p className="text-[12.5px] text-slate-500 mb-2">当初予算はセルをタップして編集できます。最新予算はカテゴリー名をタップして開く「内訳」の登録・編集・削除だけで変わります（直接入力はできません）。BNS売上は「BNS予算」グループの最新予算の合計から自動計算されます</p>

      {groups.map(([group, list]) => (
        <div key={group}>
          <SectionTitle>{group}</SectionTitle>
          {list.length === 0 ? <EmptyState>カテゴリーがありません</EmptyState> : (
            <>
              {/* mobile: cards */}
              <div className="grid gap-2 sm:hidden">
                {list.map(s => (
                  <MobileCard
                    key={s.category.id} s={s} onCommit={updateField}
                    expanded={expanded.has(s.category.id)}
                    onToggle={() => toggleExpand(s.category.id)}
                    orders={orders.filter(o => o.category_id === s.category.id)}
                    vendors={vendors}
                    projectId={id}
                    categoryName={s.category.name}
                    onChanged={reload}
                  />
                ))}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className="text-[13.5px] font-semibold text-slate-700 mb-1.5">{group} 合計</div>
                  <Row label="当初予算合計" value={formatYen(list.reduce((s, c) => s + c.category.original_budget, 0))} />
                  <Row label="最新予算合計" value={formatYen(list.reduce((s, c) => s + c.category.latest_budget, 0))} />
                  <Row
                    label="当初予算からの増減"
                    value={formatSignedYen(
                      list.reduce((s, c) => s + c.category.latest_budget, 0)
                      - list.reduce((s, c) => s + c.category.original_budget, 0)
                    )}
                    strong
                  />
                </div>
              </div>
              {/* desktop: table */}
              <div className="hidden sm:block rounded-xl border border-slate-300 bg-white overflow-x-auto shadow-sm">
                <table className="w-full text-[13.5px] min-w-[820px]">
                  <thead>
                    <tr className="text-left text-slate-600 bg-slate-100 border-b border-slate-300 text-[13px]">
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">項目</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">当初予算</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap bg-blue-100/70 text-blue-800">最新予算</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">発注済</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">未発注予定</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">着地見込</th>
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">残予算</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(s => (
                      <Fragment key={s.category.id}>
                        <tr className="border-b border-slate-200 last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap">
                            <button onClick={() => toggleExpand(s.category.id)} className="flex items-center gap-1.5 hover:text-slate-950">
                              <span className={`text-slate-400 text-[11.5px] transition-transform ${expanded.has(s.category.id) ? 'rotate-90' : ''}`}>▶</span>
                              {s.category.name}
                            </button>
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <InlineAmount value={s.category.original_budget} onCommit={v => updateField(s.category, 'original_budget', v)} />
                          </td>
                          <td className={`px-3 py-3 text-right tabular-nums font-bold bg-blue-50/60 ${zeroMute(s.category.latest_budget, 'text-slate-900')}`}>
                            {formatYen(s.category.latest_budget)}
                          </td>
                          <td className={`px-3 py-3 text-right tabular-nums ${zeroMute(s.orderedAmount, 'text-slate-800')}`}>{formatYen(s.orderedAmount)}</td>
                          <td className={`px-3 py-3 text-right tabular-nums ${zeroMute(s.unorderedPlanned, 'text-slate-600')}`}>{formatYen(s.unorderedPlanned)}</td>
                          <td className={`px-3 py-3 text-right tabular-nums font-semibold ${zeroMute(s.landingForecast, 'text-slate-900')}`}>{formatYen(s.landingForecast)}</td>
                          <td className={`px-3 py-3 text-right tabular-nums font-semibold ${s.variance < 0 ? 'text-rose-600' : zeroMute(s.variance, 'text-emerald-600')}`}>{formatSignedYen(s.variance)}</td>
                          <td className="px-3 py-3"><StatePill state={s.state} /></td>
                        </tr>
                        {expanded.has(s.category.id) && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={8} className="bg-slate-50/60 px-6 py-4">
                              <CategoryBreakdown
                                orders={orders.filter(o => o.category_id === s.category.id)}
                                vendors={vendors}
                                projectId={id}
                                categoryId={s.category.id}
                                categoryName={s.category.name}
                                onChanged={reload}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                      <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">{group} 合計</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">
                        {formatYen(list.reduce((s, c) => s + c.category.original_budget, 0))}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">
                        {formatYen(list.reduce((s, c) => s + c.category.latest_budget, 0))}
                      </td>
                      <td colSpan={3}></td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-blue-700 whitespace-nowrap" colSpan={2}>
                        当初予算からの増減 {formatSignedYen(
                          list.reduce((s, c) => s + c.category.latest_budget, 0)
                          - list.reduce((s, c) => s + c.category.original_budget, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

    </Shell>
  )
}

function MobileCard({
  s, onCommit, expanded, onToggle, orders, vendors, projectId, categoryName, onChanged,
}: {
  s: CategorySummary; onCommit: (c: BudgetCategory, f: EditableField, v: number) => void
  expanded: boolean; onToggle: () => void
  orders: Order[]; vendors: Vendor[]; projectId: string; categoryName: string; onChanged: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
          <span className={`text-slate-400 text-[11.5px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {s.category.name}
        </button>
        <StatePill state={s.state} />
      </div>
      <EditableRow label="当初予算" value={s.category.original_budget} onCommit={v => onCommit(s.category, 'original_budget', v)} />
      <Row label="最新予算" value={formatYen(s.category.latest_budget)} strong />
      <Row label="発注済" value={formatYen(s.orderedAmount)} />
      <Row label="未発注予定" value={formatYen(s.unorderedPlanned)} muted />
      <div className="h-px bg-slate-100 my-1.5" />
      <Row label="着地見込" value={formatYen(s.landingForecast)} strong />
      <Row label="残予算" value={formatSignedYen(s.variance)} tone={s.variance < 0 ? 'danger' : 'good'} strong />
      <div className="text-[12px] text-slate-400 mt-1">消化率 {formatPercent(s.consumptionRate)}</div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <CategoryBreakdown
            orders={orders} vendors={vendors} projectId={projectId}
            categoryId={s.category.id} categoryName={categoryName} onChanged={onChanged}
          />
        </div>
      )}
    </div>
  )
}

function CategoryBreakdown({
  orders, vendors, projectId, categoryId, categoryName, onChanged,
}: { orders: Order[]; vendors: Vendor[]; projectId: string; categoryId: string; categoryName: string; onChanged: () => void }) {
  const [title, setTitle] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const vendorLabel = (vid: string | null) => vendors.find(v => v.id === vid)?.name || ''

  const addItem = async () => {
    if (!title.trim() || !amount) { setError('工事項目と金額は必須です'); return }
    setSaving(true)
    const vendorId = vendorName.trim() ? await findOrCreateVendor(vendorName.trim()) : null
    const { error: err } = await createOrder({
      projectId, categoryId, categoryName, title: title.trim(), amount: Number(amount), vendorId,
    })
    setSaving(false)
    if (err) { setError(`登録に失敗しました：${err}`); return }
    setTitle(''); setVendorName(''); setAmount(''); setError('')
    onChanged()
  }

  return (
    <div className="grid gap-2">
      {orders.length === 0 ? (
        <p className="text-[13px] text-slate-400">まだ内訳がありません。下から追加してください。</p>
      ) : (
        orders.map(o => (
          <div key={o.id} className="rounded-lg border border-slate-150 bg-white px-3 py-2.5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0 grid gap-0.5">
                <InlineText
                  value={o.title}
                  onCommit={v => updateOrderTitle(o, v, projectId).then(onChanged)}
                  className="text-[13.5px] font-medium text-slate-900"
                />
                <InlineText
                  value={vendorLabel(o.vendor_id)}
                  emptyLabel="業者未設定"
                  placeholder="業者名"
                  onCommit={async v => {
                    const vendorId = await findOrCreateVendor(v)
                    await updateOrderVendor(o, vendorId, v, projectId)
                    onChanged()
                  }}
                  className="text-[12px] text-slate-400"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <InlineAmount value={o.order_amount || o.estimate_amount} onCommit={v => updateOrderAmount(o, v, projectId, categoryName).then(onChanged)} />
                <button
                  onClick={() => { if (confirm(`「${o.title}」を削除しますか？`)) deleteOrder(o, projectId, categoryName).then(onChanged) }}
                  className="text-slate-300 hover:text-rose-500 text-[12px]" aria-label="削除"
                >✕</button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={o.status}
                onChange={e => updateOrderStatus(o, e.target.value, projectId).then(onChanged)}
                className={`text-[12px] px-2 py-0.5 rounded-md border-0 font-medium ${STATUS_TONE[o.status]}`}
              >
                {ORDER_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
              {PRE_ORDER_STATUSES.has(o.status) && (
                <button
                  onClick={() => markOrderPlaced(o, projectId).then(onChanged)}
                  className="text-[12px] px-2 py-0.5 rounded-md bg-blue-600 text-white font-medium"
                >
                  発注済みにする
                </button>
              )}
              {!o.paid && (
                <button
                  onClick={() => markOrderPaid(o, projectId).then(onChanged)}
                  className="text-[12px] px-2 py-0.5 rounded-md bg-blue-600 text-white font-medium"
                >
                  支払済みにする
                </button>
              )}
              {o.paid && <span className="text-[12px] text-emerald-600">支払済{o.paid_at ? `（${formatDate(o.paid_at)}）` : ''}</span>}
              <Link
                href={`/pjb/${projectId}/orders/${o.id}/po`}
                target="_blank"
                className="text-[12px] px-2 py-0.5 rounded-md border border-slate-200 text-slate-500"
              >
                📄 発注書
              </Link>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-1.5">
              {o.ordered_at && <span className="text-[12px] text-slate-400">発注日 {formatDate(o.ordered_at)}</span>}
              <label className="flex items-center gap-1.5 text-[12px] text-slate-400">
                <span>支払予定日</span>
                <input
                  type="date"
                  defaultValue={o.payment_scheduled_at || ''}
                  onBlur={e => { if (e.target.value !== (o.payment_scheduled_at || '')) updateOrderPaymentSchedule(o, e.target.value || null, projectId).then(onChanged) }}
                  className="border border-slate-200 rounded-md px-1.5 py-0.5 text-[12px]"
                />
              </label>
            </div>
          </div>
        ))
      )}

      <div className="rounded-lg border border-dashed border-slate-250 bg-slate-50/60 px-3 py-2.5 grid gap-1.5 sm:flex sm:items-end sm:gap-2">
        <label className="grid gap-0.5 flex-1 min-w-0">
          <span className="text-[12px] text-slate-400">工事項目</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例）電気配線追加" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <label className="grid gap-0.5 flex-1 min-w-0">
          <span className="text-[12px] text-slate-400">業者（任意）</span>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="例）〇〇工務店" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <label className="grid gap-0.5 sm:w-40">
          <span className="text-[12px] text-slate-400">金額</span>
          <MoneyInput value={amount} onChange={setAmount} placeholder="0" className="w-full min-w-0 border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <button onClick={addItem} disabled={saving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-[13.5px] font-medium disabled:opacity-50 whitespace-nowrap">
          {saving ? '追加中…' : '＋ 追加'}
        </button>
      </div>
      {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
    </div>
  )
}

function Row({ label, value, muted, strong, tone }: { label: string; value: string; muted?: boolean; strong?: boolean; tone?: 'danger' | 'good' }) {
  const color = tone === 'danger' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-600' : muted ? 'text-slate-500' : 'text-slate-800'
  return (
    <div className="flex justify-between text-[13.5px] py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${color}`}>{value}</span>
    </div>
  )
}

function EditableRow({ label, value, onCommit, strong }: { label: string; value: number; onCommit: (v: number) => void; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[13.5px] py-0.5">
      <span className="text-slate-400">{label}</span>
      <InlineAmount value={value} onCommit={onCommit} emphasize={strong} />
    </div>
  )
}

