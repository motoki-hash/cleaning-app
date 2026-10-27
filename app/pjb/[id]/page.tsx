'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Shell from '../components/Shell'
import DeleteProjectModal from '../components/DeleteProjectModal'
import { KpiCard, AlertList, StatePill, SectionTitle, InlineNumber } from '../components/ui'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/pjb/activity'
import { BUSINESSES } from '@/lib/pjb/constants'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { summarizeCategory, summarizeProject, buildAlerts, categorySales } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'

const PURE_CONSTRUCTION = ['解体工事', '内装工事', '追加工事', '分離発注']

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, orders, additionalWorks, veItems, salesItems, loading, notFound, reload } = useProjectData(id)
  const [showDelete, setShowDelete] = useState(false)

  const summaries = useMemo(
    () => categories.map(c => summarizeCategory(c, orders, additionalWorks, veItems)),
    [categories, orders, additionalWorks, veItems]
  )
  const totals = useMemo(() => project ? summarizeProject(project, categories, summaries, salesItems) : null, [project, categories, summaries, salesItems])
  const alerts = useMemo(
    () => buildAlerts(categories, summaries, orders, additionalWorks, veItems, `/pjb/${id}`),
    [categories, summaries, orders, additionalWorks, veItems, id]
  )

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project || !totals) {
    return <Shell projectId={id} active="dashboard"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const tsubo = project.floor_area_tsubo || 0
  // 純粋な工事費：解体工事・内装工事・追加工事・分離発注（BNS外・BNS両方の同名カテゴリーを合算）
  const pureCost = summaries.filter(s => PURE_CONSTRUCTION.includes(s.category.name)).reduce((t, s) => t + s.landingForecast, 0)
  const bnsExternal = summaries.filter(s => s.category.group_name === 'BNS外予算')
  const bns = summaries.filter(s => s.category.group_name === 'BNS予算')

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="dashboard" onQuickAdded={reload}>
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className="text-[13px] text-slate-500">事業</span>
        <select
          value={project.business || ''}
          onChange={async e => {
            const next = e.target.value || null
            const { error } = await supabase.from('pjb_projects').update({ business: next, updated_at: new Date().toISOString() }).eq('id', id)
            if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ017を実行していない場合は、先に実行してください）`); return }
            await logActivity({ projectId: id, action: 'update', entityType: 'project', entityLabel: '事業', before: project.business || '未分類', after: next || '未分類' })
            reload()
          }}
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[14px] bg-white"
        >
          <option value="">未分類</option>
          {BUSINESSES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="text-[12.5px] text-slate-400">案件一覧の絞り込みと、事業別の分析に使います</span>
      </div>

      <SectionTitle>予算KPI <span className="text-[12px] font-normal text-slate-400 ml-1">金額はすべて税別</span></SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <KpiCard label="PJ総予算" value={formatYen(totals.totalBudget)} sub="BNS外予算の当初予算合計 ＋ BNS予算の売上合計（自動）" />
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

      <SectionTitle>
        工事費の坪単価 <span className="text-[12px] font-normal text-slate-400 ml-1">金額はすべて税別（着地見込ベース）</span>
      </SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[13px] text-slate-500 mb-1">延床面積（坪）</div>
          <div className="text-[21px] leading-tight font-bold tabular-nums text-slate-900">
            <InlineNumber
              value={tsubo} width="w-28" emphasize
              display={v => (v > 0 ? `${v.toLocaleString('ja-JP')}坪` : '坪数を入力')}
              onCommit={async v => {
                const { error } = await supabase.from('pjb_projects').update({ floor_area_tsubo: Math.max(0, v), updated_at: new Date().toISOString() }).eq('id', id)
                if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ011を実行していない場合は、先に実行してください）`); return }
                reload()
              }}
            />
          </div>
          <div className="text-[12px] text-slate-500 mt-1">タップして入力します</div>
        </div>
        <KpiCard
          label="坪単価（全コンバージョン費）"
          value={tsubo > 0 ? `${formatYen(Math.round(totals.landingForecast / tsubo))} /坪` : '—'}
          sub={tsubo > 0 ? `着地見込 ${formatYen(totals.landingForecast)} ÷ ${tsubo.toLocaleString('ja-JP')}坪` : '坪数を入れると表示されます'}
        />
        <KpiCard
          label="坪単価（純粋な工事費）"
          value={tsubo > 0 ? `${formatYen(Math.round(pureCost / tsubo))} /坪` : '—'}
          sub={tsubo > 0 ? `${PURE_CONSTRUCTION.join('・')} ${formatYen(pureCost)} ÷ ${tsubo.toLocaleString('ja-JP')}坪` : '解体・内装・追加工事・分離発注の合計'}
        />
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
        {bns.map(s => <BnsMiniCard key={s.category.id} s={s} sales={categorySales(s.category, salesItems)} />)}
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

function BnsMiniCard({ s, sales }: { s: ReturnType<typeof summarizeCategory>; sales: number }) {
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
        <div>予算 <span className="text-slate-800 font-medium">{formatYen(s.effectiveBudget)}</span></div>
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
