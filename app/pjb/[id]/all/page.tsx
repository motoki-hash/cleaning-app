'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import Shell from '../../components/Shell'
import { KpiCard, SectionTitle } from '../../components/ui'
import { useProjectCards, type ProjectCardData } from '@/lib/pjb/useProjectCards'
import { periodLabelOf } from '@/lib/pjb/periods'
import { budgetGapStatus, hasBudgetKpi, BUDGET_KPI_RATE } from '@/lib/pjb/calc'
import { fiscalYearOf, currentFiscal } from '@/lib/pjb/fiscal'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'

const monthLabel = (d: string | null | undefined) => (d ? `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月` : '未設定')

// 全期の合計ダッシュボード。期ごとの数字（売上計上月は期ごとに違う）と、全期の合計を並べて見る
export default function AllPeriodsPage() {
  const { id } = useParams<{ id: string }>()
  const { cards, loading } = useProjectCards(true)
  const me = cards.find(c => c.project.id === id)

  if (!me) {
    return <Shell projectId={id} active="all"><p className="text-center text-[14px] text-slate-400 py-10">{loading ? '読み込み中…' : '案件が見つかりません'}</p></Shell>
  }

  const members: ProjectCardData[] = me.project.group_id
    ? cards.filter(c => c.project.group_id === me.project.group_id).sort((a, b) => (a.project.period_no ?? 99) - (b.project.period_no ?? 99))
    : [me]
  const sum = (f: (c: ProjectCardData) => number) => members.reduce((s, c) => s + f(c), 0)

  const totalBudget = sum(c => c.totalBudget)
  const execution = sum(c => c.executionBudget)
  const landing = sum(c => c.landingForecast)
  const remaining = sum(c => c.remaining)
  const sell = sum(c => c.bnsSell)
  const cost = sum(c => c.bnsCost)
  const profit = sum(c => c.grossProfit)
  const kpi = hasBudgetKpi(me.business)
  // 予実の判定は、総予算を入力した期だけで合計する
  const rated = members.filter(c => c.totalBudget > 0)
  const ratedBudget = rated.reduce((s, c) => s + c.totalBudget, 0)
  const ratedGap = rated.reduce((s, c) => s + c.budgetGap, 0)
  const ratedRate = ratedBudget > 0 ? ratedGap / ratedBudget : null
  const gapTone = ratedRate === null ? 'default' : Math.abs(ratedRate) <= BUDGET_KPI_RATE ? 'good' : ratedRate < 0 ? 'danger' : 'warning'
  const nowFy = currentFiscal().year

  // 売上計上月ごとの売上（期ごとに売上月が違うので、年度ごとの小計も出す）
  const bySales = [...members].sort((a, b) => (a.project.sales_month || '9999').localeCompare(b.project.sales_month || '9999'))
  const fyTotals = new Map<string, number>()
  for (const c of members) {
    const fy = fiscalYearOf(c.project.sales_month)
    const key = fy === null ? '売上計上月が未設定' : `${fy}年度`
    fyTotals.set(key, (fyTotals.get(key) ?? 0) + c.bnsSell)
  }

  const th = 'px-3 py-2 font-medium text-right whitespace-nowrap'
  const td = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap'

  return (
    <Shell projectId={id} projectName={me.project.name} projectStatus={me.project.status} active="all">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-slate-900">{me.project.name}　全期の合計</h1>
        <p className="text-[13px] text-slate-500 mt-1">{members.length}期の合計です。期ごとの詳細は、上の「1期・2期」で切り替えて見られます。</p>
      </div>

      <SectionTitle>全期の予算KPI <span className="text-[12px] font-normal text-slate-400 ml-1">金額はすべて税別</span></SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="PJ総予算（全期・手入力）" value={formatYen(totalBudget)} sub={`入力済 ${rated.length}/${members.length}期`} />
        <KpiCard label="実行費用（全期・自動）" value={formatYen(execution)} />
        {kpi && <KpiCard label="予実の差額（総予算−実行費用）" value={rated.length > 0 ? formatSignedYen(ratedGap) : '—'} tone={gapTone} sub="総予算を入力した期のみ" />}
        {kpi && <KpiCard label="予実の差率（目標 ±1%以内）" value={ratedRate === null ? '—' : formatPercent(ratedRate, 2)} tone={gapTone} sub={`達成 ${rated.filter(c => budgetGapStatus(c.totalBudget, c.budgetGap) === 'ok').length}/${rated.length}期`} />}
        <KpiCard label="着地見込（全期）" value={formatYen(landing)} />
        <KpiCard label="残予算（PJ総予算−実行費用）" value={totalBudget > 0 ? formatSignedYen(remaining) : '—'} tone={totalBudget <= 0 ? 'default' : remaining < 0 ? 'danger' : 'good'} sub="総予算を入力した期の合計" />
        <KpiCard label="消化率（実行費用÷PJ総予算）" value={totalBudget > 0 ? formatPercent(execution / totalBudget) : '—'} />
      </div>

      <SectionTitle>全期のBNS収益KPI</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="BNS売上（全期）" value={formatYen(sell)} />
        <KpiCard label="BNS原価（全期）" value={formatYen(cost)} />
        <KpiCard label="BNS粗利益（全期）" value={formatYen(profit)} tone={profit < 0 ? 'danger' : 'good'} />
        <KpiCard label="粗利率" value={sell > 0 ? formatPercent(profit / sell, 1) : '—'} tone={profit < 0 ? 'danger' : 'default'} />
      </div>

      <SectionTitle>期ごとの内訳</SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13.5px]">
          <thead>
            <tr className="text-slate-500 text-[12.5px] bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2 font-medium text-left">期</th>
              <th className="px-3 py-2 font-medium text-left">状態</th>
              <th className="px-3 py-2 font-medium text-left">売上計上月</th>
              <th className={th}>PJ総予算</th>
              <th className={th}>実行費用</th>
              <th className={th}>着地見込</th>
              <th className={th}>残予算</th>
              <th className={th}>BNS売上</th>
              <th className={th}>BNS粗利益</th>
              {kpi && <th className={th}>予実差率</th>}
            </tr>
          </thead>
          <tbody>
            {members.map(c => {
              const st = budgetGapStatus(c.totalBudget, c.budgetGap)
              return (
                <tr key={c.project.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold"><Link href={`/pjb/${c.project.id}`} className="text-blue-700 hover:underline">{periodLabelOf(c.project) || '—'}</Link></td>
                  <td className="px-3 py-2.5 text-slate-600">{c.project.status}</td>
                  <td className="px-3 py-2.5 text-slate-600">{monthLabel(c.project.sales_month)}</td>
                  <td className={td}>{c.totalBudget > 0 ? formatYen(c.totalBudget) : <span className="text-slate-300">未入力</span>}</td>
                  <td className={td}>{formatYen(c.executionBudget)}</td>
                  <td className={td}>{formatYen(c.landingForecast)}</td>
                  <td className={`${td} ${c.remaining < 0 ? 'text-rose-600' : ''}`}>{formatSignedYen(c.remaining)}</td>
                  <td className={td}>{formatYen(c.bnsSell)}</td>
                  <td className={`${td} ${c.grossProfit < 0 ? 'text-rose-600' : ''}`}>{formatSignedYen(c.grossProfit)}</td>
                  {kpi && <td className={`${td} ${st === 'ok' ? 'text-emerald-700' : st === 'over' ? 'text-rose-600' : st === 'under' ? 'text-amber-700' : 'text-slate-300'}`}>{st === 'unset' ? '—' : formatPercent(c.budgetGap / c.totalBudget, 2)}</td>}
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-4 py-2.5" colSpan={3}>全期の合計</td>
              <td className={td}>{formatYen(totalBudget)}</td>
              <td className={td}>{formatYen(execution)}</td>
              <td className={td}>{formatYen(landing)}</td>
              <td className={`${td} ${remaining < 0 ? 'text-rose-600' : ''}`}>{formatSignedYen(remaining)}</td>
              <td className={td}>{formatYen(sell)}</td>
              <td className={`${td} ${profit < 0 ? 'text-rose-600' : ''}`}>{formatSignedYen(profit)}</td>
              {kpi && <td className={td}>{ratedRate === null ? '—' : formatPercent(ratedRate, 2)}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      <SectionTitle>売上の計上月 <span className="text-[12px] font-normal text-slate-400 ml-1">期ごとに売上が立つ月が違います</span></SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100 text-[13.5px]">
          {bySales.map(c => (
            <li key={c.project.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-semibold text-slate-900 w-10">{periodLabelOf(c.project) || '—'}</span>
              <span className="text-slate-700">{monthLabel(c.project.sales_month)}</span>
              {fiscalYearOf(c.project.sales_month) === nowFy && <span className="text-[11.5px] text-emerald-700 font-medium">今期売上</span>}
              <span className="ml-auto tabular-nums font-medium">{formatYen(c.bnsSell)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-200 px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-slate-600 bg-slate-50 rounded-b-xl">
          {[...fyTotals.entries()].map(([k, v]) => <span key={k}>{k}　<b className="tabular-nums text-slate-900">{formatYen(v)}</b></span>)}
        </div>
      </div>
    </Shell>
  )
}
