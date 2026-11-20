'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authState } from '@/lib/pjb/authState'
import { useProjectCards } from '@/lib/pjb/useProjectCards'
import { currentFiscal } from '@/lib/pjb/fiscal'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import { BUDGET_KPI_BUSINESS } from '@/lib/pjb/calc'
import { statusSummary, poolOf, aggregate, businessStats, type Scope } from '@/lib/pjb/dashboard'
import { KpiCard } from '../components/ui'
import TopShell from '../components/TopShell'

// ダッシュボード：全案件の状況・今期サマリー・事業別の分析をまとめて見る
export default function DashboardPage() {
  const router = useRouter()
  const [checked, setChecked] = useState(authState.checked)
  const { cards, loading } = useProjectCards(checked)
  const [scope, setScope] = useState<Scope>('fy')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login?redirect=%2Fpjb%2Fdashboard'); return }
      authState.checked = true
      setChecked(true)
    })
  }, [router])

  const nowFy = currentFiscal().year
  const summary = useMemo(() => statusSummary(cards), [cards])
  const pool = useMemo(() => poolOf(cards, scope), [cards, scope])
  const agg = useMemo(() => aggregate(pool), [pool])
  const biz = useMemo(() => businessStats(pool), [pool])
  const noSalesMonth = cards.filter(c => !c.project.sales_month).length

  if (!checked) return null

  const goList = (query: string) => router.push(`/pjb?${query}`)

  return (
    <TopShell active="dashboard">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24">
        <h1 className="text-[20px] font-semibold text-slate-900 mb-4">ダッシュボード</h1>

        {loading && <p className="text-[14px] text-slate-400 py-6">読み込み中…</p>}

        {/* 案件の状況（押すと、その条件で案件一覧を開く） */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile label="進行中の案件" value={`${summary.active}件`} sub={`総予算 ${formatYen(summary.budget)}`} onClick={() => goList('filter=' + encodeURIComponent('進行中'))} />
          <SummaryTile label="要対応あり" value={`${summary.alert}件`} tone={summary.alert > 0 ? 'warning' : 'default'}
            sub="確認が必要な項目がある案件" onClick={() => goList('filter=' + encodeURIComponent('要対応あり'))} />
          <SummaryTile label="予算超過" value={`${summary.over}件`} tone={summary.over > 0 ? 'danger' : 'default'}
            sub="実行費用がPJ総予算を超えている案件（期のある案件は全期の合計）" onClick={() => goList('filter=' + encodeURIComponent('予算超過'))} />
          <SummaryTile label="完了" value={`${summary.done}件`} sub="完了にした案件" onClick={() => goList('filter=' + encodeURIComponent('完了'))} />
        </div>
        <p className="text-[12px] text-slate-400 mt-1.5">タイルを押すと、その条件で案件一覧を開きます</p>

        {/* サマリー */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <h2 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-1 h-4 rounded-sm bg-blue-600" />
              {scope === 'fy' ? `今期（${nowFy}年度）サマリー` : scope === 'active' ? '進行中サマリー' : '全案件サマリー'}
            </h2>
            <div className="flex gap-0.5 rounded-lg bg-slate-200 p-0.5 text-[13px]">
              {([['fy', '今期売上'], ['active', '進行中のみ'], ['all', '全案件']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)}
                  className={`px-3 py-1 rounded-md ${scope === k ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-600'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="text-[12.5px] text-slate-500 mb-2">
            {scope === 'fy' && <>売上計上月が{nowFy}年4月〜{nowFy + 1}年3月の案件（期ごと）の集計です。{noSalesMonth > 0 && <>売上計上月が未設定の{noSalesMonth}件は含まれません。</>}<br /></>}
            予実管理（±1%）は、{BUDGET_KPI_BUSINESS} の案件だけが対象です
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KpiCard label="PJ総予算（合計・手入力）" value={formatYen(agg.totalBudget)} sub={`入力済 ${agg.ratedCount}案件${agg.unsetCount > 0 ? `／未入力 ${agg.unsetCount}案件（除く）` : ''}`} />
            <KpiCard label="実行費用（合計・自動）" value={formatYen(agg.execution)} sub="BNS外実行費用 ＋ BNS原価 ＋ 利益 ＋ 社内設計" />
            <KpiCard label="予実の差額（総予算−実行費用）" value={agg.ratedCount > 0 ? formatSignedYen(agg.gap) : '—'} tone={agg.rateTone} />
            <KpiCard
              label="予実の差率（対総予算）"
              value={agg.totalBudget > 0 ? formatPercent(agg.rate, 2) : '—'}
              sub={`目標：±1%以内　${agg.ratedCount > 0 ? `達成 ${agg.achieved}/${agg.ratedCount}案件` : ''}`}
              tone={agg.rateTone}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="BNS売上（合計）" value={formatYen(agg.sell)} />
            <KpiCard label="BNS粗利益（合計）" value={formatYen(agg.profit)} tone={agg.profit < 0 ? 'danger' : 'good'} />
            <KpiCard label="粗利率" value={formatPercent(agg.margin, 1)} tone={agg.margin < 0 ? 'danger' : 'default'} />
            <KpiCard label="予実1%以内の案件" value={agg.ratedCount > 0 ? `${agg.achieved}/${agg.ratedCount}件` : '—'}
              tone={agg.ratedCount > 0 && agg.achieved === agg.ratedCount ? 'good' : 'default'} sub="総予算と実行費用の差が±1%以内" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <KpiCard label="着地見込（合計）" value={formatYen(agg.landing)} />
            <KpiCard label="残予算（PJ総予算−実行費用）" value={formatSignedYen(agg.remaining)} tone={agg.remaining < 0 ? 'danger' : 'good'} sub="総予算を入力した案件の合計" />
          </div>

          {/* 事業別の分析 */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-slate-100 text-[14px] font-semibold text-slate-900">
              事業別の分析 <span className="text-[12px] font-normal text-slate-400 ml-1">（行を押すと、その事業の案件だけを案件一覧に出します）</span>
            </div>
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="text-left text-slate-500 text-[12.5px] bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">事業</th>
                  <th className="px-3 py-2 font-medium text-right">案件数</th>
                  <th className="px-3 py-2 font-medium text-right">売上</th>
                  <th className="px-3 py-2 font-medium text-right">原価</th>
                  <th className="px-3 py-2 font-medium text-right">利益</th>
                  <th className="px-3 py-2 font-medium text-right">利益率</th>
                  <th className="px-3 py-2 font-medium text-right">総予算（illi）</th>
                  <th className="px-4 py-2 font-medium text-right">予実差率</th>
                </tr>
              </thead>
              <tbody>
                {biz.map(b => (
                  <tr key={b.name} onClick={() => goList('biz=' + encodeURIComponent(b.name))}
                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{b.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(b.sell)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(b.cost)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${b.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatSignedYen(b.profit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.sell > 0 ? formatPercent(b.margin, 1) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.kpi ? formatYen(b.budget) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.kpi && b.budget > 0 ? formatPercent(b.rate, 2) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2.5">合計</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pool.length}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(agg.sell)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(agg.cost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${agg.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatSignedYen(agg.profit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{agg.sell > 0 ? formatPercent(agg.margin, 1) : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(agg.totalBudget)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{agg.totalBudget > 0 ? formatPercent(agg.rate, 2) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TopShell>
  )
}

function SummaryTile({
  label, value, sub, tone = 'default', onClick,
}: { label: string; value: string; sub?: string; tone?: 'default' | 'warning' | 'danger'; onClick: () => void }) {
  const valueColor = { default: 'text-slate-900', warning: 'text-amber-700', danger: 'text-rose-700' }[tone]
  return (
    <button onClick={onClick} className="text-left rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-300">
      <div className="text-[13px] text-slate-500 mb-1">{label}</div>
      <div className={`text-[24px] font-semibold tabular-nums leading-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-400 mt-1">{sub}</div>}
    </button>
  )
}
