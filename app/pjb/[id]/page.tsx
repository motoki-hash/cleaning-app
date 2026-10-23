'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Shell from '../components/Shell'
import DeleteProjectModal from '../components/DeleteProjectModal'
import { KpiCard, AlertList, StatePill, SectionTitle } from '../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { summarizeCategory, summarizeProject, buildAlerts } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, orders, additionalWorks, veItems, loading, notFound, reload } = useProjectData(id)
  const [showDelete, setShowDelete] = useState(false)

  const summaries = useMemo(
    () => categories.map(c => summarizeCategory(c, orders, additionalWorks, veItems)),
    [categories, orders, additionalWorks, veItems]
  )
  const totals = useMemo(() => project ? summarizeProject(project, categories, summaries) : null, [project, categories, summaries])
  const alerts = useMemo(
    () => buildAlerts(categories, summaries, orders, additionalWorks, veItems, `/pjb/${id}`),
    [categories, summaries, orders, additionalWorks, veItems, id]
  )

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project || !totals) {
    return <Shell projectId={id} active="dashboard"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const bnsExternal = summaries.filter(s => s.category.group_name === 'BNS外予算')
  const bns = summaries.filter(s => s.category.group_name === 'BNS予算')

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="dashboard" onQuickAdded={reload}>
      <SectionTitle>予算KPI</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <KpiCard label="PJ総予算" value={formatYen(totals.totalBudget)} />
        <KpiCard label="発注済金額" value={formatYen(totals.orderedAmount)} />
        <KpiCard label="未発注予定" value={formatYen(totals.unorderedPlanned)} />
        <KpiCard
          label="着地見込"
          value={formatYen(totals.landingForecast)}
          tone={totals.remaining < 0 ? 'danger' : totals.consumptionRate >= 0.9 ? 'warning' : 'default'}
        />
        <KpiCard label="残予算" value={formatSignedYen(totals.remaining)} tone={totals.remaining < 0 ? 'danger' : 'good'} />
        <KpiCard label="予算消化率" value={formatPercent(totals.consumptionRate)} tone={totals.consumptionRate >= 1 ? 'danger' : totals.consumptionRate >= 0.9 ? 'warning' : 'default'} />
      </div>

      <SectionTitle>BNS収益KPI</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <KpiCard label="BNS売上" value={formatYen(totals.bnsSell)} />
        <KpiCard label="BNS原価" value={formatYen(totals.bnsCost)} />
        <KpiCard label="BNS粗利益" value={formatYen(totals.bnsGrossProfit)} tone={totals.bnsGrossProfit < 0 ? 'danger' : 'good'} />
        <KpiCard label="粗利率" value={formatPercent(totals.grossMargin, 1)} />
        <KpiCard label="目標利益" value={formatYen(totals.targetProfit)} />
        <KpiCard label="目標利益との差額" value={formatSignedYen(totals.profitGap)} tone={totals.profitGap < 0 ? 'danger' : 'good'} />
      </div>

      <SectionTitle>要対応</SectionTitle>
      <AlertList alerts={alerts} />

      <SectionTitle action={<a href={`/pjb/${id}/budget`} className="text-[13px] text-slate-400">すべて見る ›</a>}>
        BNS外予算
      </SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {bnsExternal.map(s => <CategoryMiniCard key={s.category.id} s={s} />)}
      </div>

      <SectionTitle>BNS予算</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {bns.map(s => <BnsMiniCard key={s.category.id} s={s} />)}
      </div>

      <div className="mt-12 mb-4 text-right">
        <button onClick={() => setShowDelete(true)} className="text-[12.5px] text-slate-400 hover:text-rose-600 underline underline-offset-2">
          この案件を削除…
        </button>
      </div>
      {showDelete && <DeleteProjectModal projectId={id} projectName={project.name} onClose={() => setShowDelete(false)} />}
    </Shell>
  )
}

function BnsMiniCard({ s }: { s: ReturnType<typeof summarizeCategory> }) {
  const sales = s.category.original_budget || 0
  const cost = s.category.counts_as_cost ? s.landingForecast : 0
  const profit = sales - cost
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[14px] font-medium text-slate-900 mb-2">{s.category.name}</div>
      <div className="grid grid-cols-3 gap-x-3 text-[12.5px] text-slate-500">
        <div>売上 <span className="block text-slate-800 font-medium">{formatYen(sales)}</span></div>
        <div>原価 <span className="block text-slate-800 font-medium">{s.category.counts_as_cost ? formatYen(cost) : '—'}</span></div>
        <div>利益 <span className={`block font-semibold ${profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatSignedYen(profit)}</span></div>
      </div>
    </div>
  )
}

function CategoryMiniCard({ s }: { s: ReturnType<typeof summarizeCategory> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[14px] font-medium text-slate-900">{s.category.name}</div>
        <StatePill state={s.state} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-slate-500">
        <div>予算 <span className="text-slate-800 font-medium">{formatYen(s.category.latest_budget)}</span></div>
        <div>発注済 <span className="text-slate-800 font-medium">{formatYen(s.orderedAmount)}</span></div>
        <div>追加予定 <span className="text-slate-800 font-medium">{formatYen(s.unorderedPlanned + s.additionalCost)}</span></div>
        <div>着地見込 <span className="text-slate-800 font-medium">{formatYen(s.landingForecast)}</span></div>
      </div>
      <div className={`text-[13.5px] font-semibold mt-1.5 ${s.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
        残予算 {formatSignedYen(s.variance)}
      </div>
    </div>
  )
}
