'use client'

import { Fragment, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import CashOutPanel from '../../components/CashOutPanel'
import PjBudgetKpis from '../../components/PjBudgetKpis'
import { KpiCard, StatePill, SectionTitle, EmptyState, InlineAmount, InlineText, MoneyInput, isCommitEnter } from '../../components/ui'
import { useProjectData, findOrCreateVendor } from '@/lib/pjb/useProjectData'
import { summarizeCategory, summarizeProject, categorySales } from '@/lib/pjb/calc'
import { logActivity } from '@/lib/pjb/activity'
import { formatYen, formatSignedYen, formatPercent, formatDate } from '@/lib/pjb/format'
import { createOrder, updateOrderAmount, updateOrderStatus, updateOrderTitle, updateOrderVendor, markOrderPlaced, updateOrderPaymentSchedule, markOrderPaid, deleteOrder } from '@/lib/pjb/orders'
import { ORDER_STATUSES, type BudgetCategory, type CategorySummary, type Order, type Project, type SalesItem, type Vendor } from '@/lib/pjb/types'

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
  const { project, categories, orders, additionalWorks, veItems, vendors, salesItems, cashOutTotal, loading, notFound, reload } = useProjectData(id)
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
  const totals = useMemo(() => project ? summarizeProject(project, categories, summaries, salesItems, cashOutTotal) : null, [project, categories, summaries, salesItems, cashOutTotal])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project || !totals) {
    return <Shell projectId={id} active="budget"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const updateField = async (category: BudgetCategory, field: EditableField, value: number) => {
    if (!isFinite(value) || value === category[field]) return
    await supabase.from('pjb_budget_categories').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', category.id)
    reload()
  }

  // PJ全体のBNS予算（売上・原価・利益）の保存
  const updateProject = async (patch: Partial<Project>) => {
    const { error } = await supabase.from('pjb_projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ008を実行していない場合は、先に実行してください）`); return }
    reload()
  }

  const groups: Array<[BudgetCategory['group_name'], CategorySummary[]]> = [
    ['BNS外予算', summaries.filter(s => s.category.group_name === 'BNS外予算')],
    ['BNS予算', summaries.filter(s => s.category.group_name === 'BNS予算')],
  ]

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="budget" onQuickAdded={reload}>
      {(() => {
        const remainingRate = totals.executionBudget > 0 ? totals.remaining / totals.executionBudget : 0
        const remainTone = remainingRate < 0 ? 'danger' : remainingRate <= 0.01 ? 'warning' : 'good'
        return (
          <>
            <div className="text-[13px] font-semibold text-slate-600 mb-1.5">プロジェクト全体 <span className="font-normal text-slate-400">（金額はすべて税別）</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <PjBudgetKpis project={project} totals={totals} onChanged={reload} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <KpiCard
                label="原価（着地見込）"
                value={formatYen(totals.landingForecast)}
                tone={totals.remaining < 0 ? 'danger' : totals.consumptionRate >= 0.9 ? 'warning' : 'default'}
              />
              <KpiCard label="残予算（実行費用−原価）" value={formatSignedYen(totals.remaining)} tone={totals.remaining < 0 ? 'danger' : 'good'} />
              <KpiCard label="残予算率（対実行費用）" value={formatPercent(remainingRate, 1)} tone={remainTone} />
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
      <p className="text-[12.5px] text-slate-500 mb-2"><b className="text-slate-700">金額はすべて税別で入力・表示します。</b>金額の欄は、計算式も入力できます（例：150万+30万、1200000*1.1）。当初予算はセルをタップして編集できます。BNS外予算の実行費用は、カテゴリー名をタップして開く「内訳」の登録・編集・削除だけで変わります（直接入力はできません）。BNS予算は、項目の行をクリックして、「売上の内訳」と「原価の内訳」をそれぞれ複数行で入力します（利益は売上−原価で自動計算）</p>

      {groups.map(([group, list]) => group === 'BNS予算' ? (
        <BnsSection
          key={group} list={list} project={project} salesItems={salesItems} expanded={expanded} toggleExpand={toggleExpand}
          orders={orders} vendors={vendors} projectId={id} onChanged={reload}
          updateField={updateField} updateProject={updateProject}
        />
      ) : (
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
                  <Row label="実行費用合計" value={formatYen(list.reduce((s, c) => s + c.effectiveBudget, 0))} />
                  <Row
                    label="当初予算からの増減"
                    value={formatSignedYen(
                      list.reduce((s, c) => s + c.effectiveBudget, 0)
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
                      <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">実行費用</th>
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
                        <tr onClick={() => toggleExpand(s.category.id)} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-slate-400 text-[11.5px] transition-transform ${expanded.has(s.category.id) ? 'rotate-90' : ''}`}>▶</span>
                              {s.category.name}
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-right cursor-default" onClick={e => e.stopPropagation()}>
                            <InlineAmount value={s.category.original_budget} formulaKey={`cat:${s.category.id}:original`} onCommit={v => updateField(s.category, 'original_budget', v)} />
                          </td>
                          <td className={`px-3 py-3 text-right tabular-nums font-bold ${zeroMute(s.effectiveBudget, 'text-slate-900')}`}>
                            {formatYen(s.effectiveBudget)}
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
                        {formatYen(list.reduce((s, c) => s + c.effectiveBudget, 0))}
                      </td>
                      <td colSpan={3}></td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-blue-700 whitespace-nowrap" colSpan={2}>
                        当初予算からの増減 {formatSignedYen(
                          list.reduce((s, c) => s + c.effectiveBudget, 0)
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

      <CashOutPanel projectId={id} onChanged={reload} />

    </Shell>
  )
}

// PJ全体の「原価の予算」から除く項目（利益と、社内の設計費）
const BUDGET_COST_EXCLUDED = ['BNS利益', '設計デザイン費用(社内)']

// BNS予算：項目ごとに「売上・原価・利益」で見る。売上も原価も、項目ごとに複数の行（内訳）で入れる。
// 予算は項目ごとではなく、PJ全体で入力する。
function BnsSection({
  list, project, salesItems, expanded, toggleExpand, orders, vendors, projectId, onChanged, updateField, updateProject,
}: {
  list: CategorySummary[]; project: Project; salesItems: SalesItem[] | null
  expanded: Set<string>; toggleExpand: (id: string) => void
  orders: Order[]; vendors: Vendor[]; projectId: string; onChanged: () => void
  updateField: (c: BudgetCategory, f: EditableField, v: number) => void
  updateProject: (patch: Partial<Project>) => void
}) {
  const rows = list.map(s => {
    const sales = categorySales(s.category, salesItems)
    const counted = s.category.counts_as_cost          // BNS利益・PJ予備費・設計デザイン費用(社内)などは原価に含めない
    const cost = counted ? s.landingForecast : 0
    return { s, sales, cost, counted, profit: sales - cost }
  })
  const totalSales = rows.reduce((t, r) => t + r.sales, 0)
  const totalCost = rows.reduce((t, r) => t + r.cost, 0)
  const totalProfit = totalSales - totalCost
  const margin = totalSales > 0 ? totalProfit / totalSales : 0

  // PJ全体の予算は、すべて下の項目の売上の積み上げから自動で計算する（入力しない）
  //   売上の予算 = すべての項目の売上の合計
  //   原価の予算 = 「BNS利益」と「設計デザイン費用(社内)」を除いた項目の売上の合計
  //   利益の予算 = 売上の予算 − 原価の予算
  const budgetSales = totalSales
  const budgetCost = rows.filter(r => !BUDGET_COST_EXCLUDED.includes(r.s.category.name)).reduce((t, r) => t + r.sales, 0)
  const budgetRows: Array<{ label: string; field: string; budget: number; actual: number; costLike?: boolean }> = [
    { label: '売上', field: 'sales', budget: budgetSales, actual: totalSales },
    { label: '原価', field: 'cost', budget: budgetCost, actual: totalCost, costLike: true },
    { label: '利益', field: 'profit', budget: budgetSales - budgetCost, actual: totalProfit },
  ]

  const profitTone = (v: number) => (v < 0 ? 'text-rose-600' : v === 0 ? 'text-slate-300' : 'text-emerald-600')

  // 開いたときの中身：左に「売上の内訳」、右に「原価の内訳」を並べる
  const detail = (r: typeof rows[number]) => (
    <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[13px] font-semibold text-slate-700 mb-2">売上の内訳 <span className="font-normal text-slate-400">（税別）</span></div>
        {salesItems === null ? (
          <div className="grid gap-2">
            <EditableRow label="売上（一括入力）" value={r.sales} onCommit={v => updateField(r.s.category, 'original_budget', v)} />
            <p className="text-[12px] text-amber-700">売上を複数の行で入れるには、SQLパッチ014の実行が必要です。</p>
          </div>
        ) : (
          <SalesBreakdown
            items={salesItems.filter(i => i.category_id === r.s.category.id)}
            projectId={projectId} categoryId={r.s.category.id} categoryName={r.s.category.name} onChanged={onChanged}
          />
        )}
      </div>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[13px] font-semibold text-slate-700 mb-2">原価の内訳 <span className="font-normal text-slate-400">（税別・発注）</span></div>
        {r.counted ? (
          <CategoryBreakdown
            orders={orders.filter(o => o.category_id === r.s.category.id)} vendors={vendors} projectId={projectId}
            categoryId={r.s.category.id} categoryName={r.s.category.name} onChanged={onChanged}
          />
        ) : (
          <p className="text-[13px] text-slate-400">この項目は、原価に含めない設定です（売上がそのまま利益になります）。</p>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <SectionTitle>BNS予算</SectionTitle>

      {/* PJ全体の予算 */}
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-300 flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-slate-800">PJ全体の予算</span>
          <span className="text-[12px] text-slate-500">下の項目の売上の積み上げで、自動計算されます（原価の予算は、BNS利益・設計デザイン費用(社内)を除く）</span>
        </div>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-slate-500 text-[12.5px] border-b border-slate-200">
              <th className="px-4 py-2 font-medium">区分</th>
              <th className="px-3 py-2 font-medium text-right">予算</th>
              <th className="px-3 py-2 font-medium text-right">実績（下の表の合計）</th>
              <th className="px-4 py-2 font-medium text-right">差</th>
            </tr>
          </thead>
          <tbody>
            {budgetRows.map(r => {
              const diff = r.costLike ? r.budget - r.actual : r.actual - r.budget   // プラスが「良い方向」
              return (
                <tr key={r.field} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{r.label}</td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums font-semibold ${r.budget === 0 ? 'text-slate-300' : r.budget < 0 ? 'text-rose-600' : 'text-slate-800'}`}
                    title={r.field === 'sales' ? 'すべての項目の売上の合計' : r.field === 'cost' ? '「BNS利益」と「設計デザイン費用(社内)」を除いた項目の売上の合計' : '売上の予算 − 原価の予算'}
                  >
                    <span className="text-[11px] font-normal text-slate-400 mr-2">自動</span>{r.field === 'profit' ? formatSignedYen(r.budget) : formatYen(r.budget)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatYen(r.actual)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.budget === 0 ? 'text-slate-300' : diff < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {r.budget === 0 ? '—' : formatSignedYen(diff)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[12px] text-slate-400 border-t border-slate-100">差：売上・利益は「実績−予算」、原価は「予算−実績」（プラスなら良い方向）</p>
      </div>

      {/* mobile: cards */}
      <div className="grid gap-2 sm:hidden">
        {rows.map(r => (
          <div key={r.s.category.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <button onClick={() => toggleExpand(r.s.category.id)} className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 mb-2">
              <span className={`text-slate-400 text-[11.5px] transition-transform ${expanded.has(r.s.category.id) ? 'rotate-90' : ''}`}>▶</span>
              {r.s.category.name}
            </button>
            <Row label="売上" value={formatYen(r.sales)} />
            <Row label="原価" value={r.counted ? formatYen(r.cost) : '—'} muted />
            <div className="h-px bg-slate-100 my-1.5" />
            <Row label="利益" value={formatSignedYen(r.profit)} tone={r.profit < 0 ? 'danger' : 'good'} strong />
            {expanded.has(r.s.category.id) && <div className="mt-3 pt-3 border-t border-slate-100">{detail(r)}</div>}
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <div className="text-[13.5px] font-semibold text-slate-700 mb-1.5">BNS予算 合計</div>
          <Row label="売上" value={formatYen(totalSales)} />
          <Row label="原価" value={formatYen(totalCost)} />
          <Row label={`利益（利益率 ${formatPercent(margin, 1)}）`} value={formatSignedYen(totalProfit)} tone={totalProfit < 0 ? 'danger' : 'good'} strong />
        </div>
      </div>

      {/* desktop: table */}
      <div className="hidden sm:block rounded-xl border border-slate-300 bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-[13.5px] min-w-[620px] table-fixed">
          <colgroup>
            <col style={{ width: '37%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-600 bg-slate-100 border-b border-slate-300 text-[13px]">
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">項目 <span className="font-normal text-slate-400">（行をクリックして、売上・原価の内訳を入力）</span></th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">売上</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">原価</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">利益</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <Fragment key={r.s.category.id}>
                <tr onClick={() => toggleExpand(r.s.category.id)} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-slate-400 text-[11.5px] transition-transform ${expanded.has(r.s.category.id) ? 'rotate-90' : ''}`}>▶</span>
                      {r.s.category.name}
                    </div>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${zeroMute(r.sales, 'text-slate-900')}`}>{formatYen(r.sales)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-bold ${r.counted ? zeroMute(r.cost, 'text-slate-900') : 'text-slate-300'}`} title={r.counted ? undefined : '原価に含めない項目です'}>
                    {r.counted ? formatYen(r.cost) : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${profitTone(r.profit)}`}>{formatSignedYen(r.profit)}</td>
                </tr>
                {expanded.has(r.s.category.id) && (
                  <tr className="border-b border-slate-100">
                    <td colSpan={4} className="bg-slate-50/60 px-5 py-4">{detail(r)}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100">
              <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">BNS予算 合計</td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">{formatYen(totalSales)}</td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">{formatYen(totalCost)}</td>
              <td className={`px-3 py-3 text-right tabular-nums font-bold ${totalProfit < 0 ? 'text-rose-600' : 'text-blue-700'}`}>
                <div>{formatSignedYen(totalProfit)}</div>
                <div className="text-[11.5px] font-medium text-slate-500">利益率 {formatPercent(margin, 1)}</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// 売上の内訳（項目ごとに複数行）。原価の内訳（発注）と同じ操作感：名前・金額はタップで編集、下の欄から追加
function SalesBreakdown({
  items, projectId, categoryId, categoryName, onChanged,
}: { items: SalesItem[]; projectId: string; categoryId: string; categoryName: string; onChanged: () => void }) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const add = async () => {
    if (!title.trim() || !amount) { setError('項目名と金額は必須です'); return }
    setSaving(true)
    const { error: err } = await supabase.from('pjb_sales_items').insert({
      project_id: projectId, category_id: categoryId, title: title.trim(), amount: Number(amount),
    })
    setSaving(false)
    if (err) { setError(`登録に失敗しました：${err.message}`); return }
    await logActivity({ projectId, action: 'create', entityType: 'sales_item', entityLabel: `${categoryName} 売上：${title.trim()}`, after: amount })
    setTitle(''); setAmount(''); setError('')
    onChanged()
  }
  const update = async (it: SalesItem, patch: Partial<SalesItem>, label: string, before: unknown, after: unknown) => {
    const { error: err } = await supabase.from('pjb_sales_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', it.id)
    if (err) { alert(`保存に失敗しました：${err.message}`); return }
    await logActivity({ projectId, action: 'update', entityType: 'sales_item', entityLabel: `${categoryName} 売上：${it.title} ${label}`, before: String(before), after: String(after) })
    onChanged()
  }
  const remove = async (it: SalesItem) => {
    if (!confirm(`「${it.title}」を削除しますか？`)) return
    const { error: err } = await supabase.from('pjb_sales_items').delete().eq('id', it.id)
    if (err) { alert(`削除に失敗しました：${err.message}`); return }
    await logActivity({ projectId, action: 'delete', entityType: 'sales_item', entityLabel: `${categoryName} 売上：${it.title}`, before: String(it.amount) })
    onChanged()
  }

  return (
    <div className="grid gap-2">
      {items.length === 0 && <p className="text-[13px] text-slate-400">まだ売上がありません。下から追加してください。</p>}
      {items.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_1.5rem] gap-2 px-3 text-[12px] text-slate-400 -mb-1">
          <span>項目名</span><span className="text-right pr-2">売上（税別）</span><span />
        </div>
      )}
      {items.map(it => (
        <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_8.5rem_1.5rem] gap-2 items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
          <InlineText boxed value={it.title} onCommit={v => update(it, { title: v }, '項目名', it.title, v)} className="text-[13.5px] font-medium text-slate-900" />
          <InlineAmount boxed emphasize value={it.amount} formulaKey={`sales:${it.id}`} onCommit={v => update(it, { amount: v }, '金額', it.amount, v)} />
          <button onClick={() => remove(it)} className="text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除">✕</button>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-slate-250 bg-slate-50/60 px-3 py-2.5 flex flex-wrap items-end gap-2">
        <label className="grid gap-0.5 flex-1 min-w-[150px]">
          <span className="text-[12px] text-slate-400">項目名</span>
          <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (isCommitEnter(e)) add() }} placeholder="例）家具一式" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <label className="grid gap-0.5 w-36">
          <span className="text-[12px] text-slate-400">売上（税別）</span>
          <MoneyInput value={amount} onChange={setAmount} placeholder="0" className="w-full min-w-0 border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <button onClick={add} disabled={saving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-[13.5px] font-medium disabled:opacity-50 whitespace-nowrap">＋ 追加</button>
      </div>
      {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
    </div>
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
      <Row label="実行費用" value={formatYen(s.effectiveBudget)} strong />
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
        <>
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_8.5rem_1.5rem] gap-2 px-3 text-[12px] text-slate-400 -mb-1">
            <span>工事項目</span><span>業者</span><span className="text-right pr-2">金額（税別）</span><span />
          </div>
          {orders.map(o => (
          <div key={o.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            {/* 1行目：工事項目・業者・金額（枠付きで、タップして直せることが分かる） */}
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_1.5rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_8.5rem_1.5rem] gap-2 items-center mb-2">
              <div className="order-1 min-w-0">
                <InlineText
                  boxed value={o.title}
                  onCommit={v => updateOrderTitle(o, v, projectId).then(onChanged)}
                  className="text-[13.5px] font-medium text-slate-900"
                />
              </div>
              <div className="order-4 col-span-3 sm:col-span-1 sm:order-2 min-w-0">
                <InlineText
                  boxed value={vendorLabel(o.vendor_id)}
                  emptyLabel="業者を入力"
                  placeholder="業者名"
                  onCommit={async v => {
                    const vendorId = await findOrCreateVendor(v)
                    await updateOrderVendor(o, vendorId, v, projectId)
                    onChanged()
                  }}
                  className="text-[13px] text-slate-600"
                />
              </div>
              <div className="order-2 sm:order-3">
                <InlineAmount boxed emphasize value={o.order_amount || o.estimate_amount} formulaKey={`order:${o.id}`} onCommit={v => updateOrderAmount(o, v, projectId, categoryName).then(onChanged)} />
              </div>
              <button
                onClick={() => { if (confirm(`「${o.title}」を削除しますか？`)) deleteOrder(o, projectId, categoryName).then(onChanged) }}
                className="order-3 sm:order-4 text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除"
              >✕</button>
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
          ))}
        </>
      )}

      <div className="rounded-lg border border-dashed border-slate-250 bg-slate-50/60 px-3 py-2.5 flex flex-wrap items-end gap-2">
        <label className="grid gap-0.5 flex-1 min-w-[150px]">
          <span className="text-[12px] text-slate-400">工事項目</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例）電気配線追加" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <label className="grid gap-0.5 flex-1 min-w-[150px]">
          <span className="text-[12px] text-slate-400">業者（任意）</span>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="例）〇〇工務店" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px]" />
        </label>
        <label className="grid gap-0.5 w-40">
          <span className="text-[12px] text-slate-400">金額（税別）</span>
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

