'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEFAULT_CATEGORIES, BUSINESSES, UNCLASSIFIED, STAFF_FIELDS } from '@/lib/pjb/constants'
import { fiscalYearOf, currentFiscal, monthInputToDate } from '@/lib/pjb/fiscal'
import { useProjectCards, type ProjectCardData } from '@/lib/pjb/useProjectCards'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import { BUDGET_KPI_RATE, budgetGapStatus } from '@/lib/pjb/calc'
import { MoneyInput, KpiCard } from './components/ui'
import TopShell from './components/TopShell'
import type { Project } from '@/lib/pjb/types'



type SortKey = 'newest' | 'name' | 'budget' | 'sell' | 'profit' | 'margin'
const SORT_LABELS: Record<SortKey, string> = {
  newest: '登録が新しい順', name: '案件名順', budget: '総予算が大きい順', sell: '売上が大きい順', profit: '利益が大きい順', margin: '利益率が高い順',
}

type Filter = '全て' | '進行中' | '完了' | '予算超過' | '要対応あり' | '今期売上'

export default function PjbHomePage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const { cards, loading, reload: load } = useProjectCards(checked)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('全て')
  const [showNew, setShowNew] = useState(false)
  const [businessFilter, setBusinessFilter] = useState<string>('すべて')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [groupByBusiness, setGroupByBusiness] = useState(false)
  const [scope, setScope] = useState<'all' | 'active'>('all')
  const [showAgg, setShowAgg] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem('pjb_home_agg') === 'closed') setShowAgg(false) } catch {}
  }, [])
  const toggleAgg = () => {
    setShowAgg(v => {
      try { localStorage.setItem('pjb_home_agg', v ? 'closed' : 'open') } catch {}
      return !v
    })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login?redirect=%2Fpjb'); return }
      setChecked(true)
    })
  }, [router])

  const filtered = useMemo(() => {
    const list = cards.filter(c => {
      if (businessFilter !== 'すべて' && c.business !== businessFilter) return false
      if (query && !c.project.name.includes(query)) return false
      if (filter === '進行中') return c.project.status === '進行中'
      if (filter === '完了') return c.project.status === '完了'
      if (filter === '予算超過') return c.remaining < 0
      if (filter === '要対応あり') return c.alertCount > 0
      if (filter === '今期売上') return fiscalYearOf(c.project.sales_month) === currentFiscal().year
      return true
    })
    const margin = (c: ProjectCardData) => (c.bnsSell > 0 ? c.grossProfit / c.bnsSell : -Infinity)
    const cmp: Record<SortKey, (a: ProjectCardData, b: ProjectCardData) => number> = {
      newest: (a, b) => b.project.created_at.localeCompare(a.project.created_at),
      name: (a, b) => a.project.name.localeCompare(b.project.name, 'ja'),
      budget: (a, b) => b.totalBudget - a.totalBudget,
      sell: (a, b) => b.bnsSell - a.bnsSell,
      profit: (a, b) => b.grossProfit - a.grossProfit,
      margin: (a, b) => margin(b) - margin(a),
    }
    return list.sort(cmp[sortKey])
  }, [cards, query, filter, businessFilter, sortKey])

  // 事業の並び（登録している事業 → 未分類）。案件がある事業だけ、絞り込みの候補に出す
  const businessNames = [...BUSINESSES, UNCLASSIFIED]

  if (!checked) return null

  const openCards = cards.filter(c => c.project.status !== '完了')
  const summary = {
    active: cards.filter(c => c.project.status === '進行中').length,
    budget: cards.filter(c => c.project.status === '進行中').reduce((s, c) => s + c.totalBudget, 0),
    alert: openCards.filter(c => c.alertCount > 0).length,
    over: openCards.filter(c => c.remaining < 0).length,
    done: cards.filter(c => c.project.status === '完了').length,
  }
  // 全案件（または進行中のみ）の集計。予実管理のKPIは「PJ総予算（手入力）と実行費用（自動）の差が、総予算の±1%以内」
  // 総予算が未入力（0）の案件は、判定の対象にしない
  const pool = scope === 'active' ? cards.filter(c => c.project.status === '進行中') : cards
  const agg = (() => {
    const rated = pool.filter(c => c.totalBudget > 0)
    const totalBudget = rated.reduce((s, c) => s + c.totalBudget, 0)
    const execution = rated.reduce((s, c) => s + c.executionBudget, 0)
    const gap = rated.reduce((s, c) => s + c.budgetGap, 0)
    const landing = pool.reduce((s, c) => s + c.landingForecast, 0)
    const remaining = pool.reduce((s, c) => s + c.remaining, 0)
    const sell = pool.reduce((s, c) => s + c.bnsSell, 0)
    const profit = pool.reduce((s, c) => s + c.grossProfit, 0)
    return {
      totalBudget, execution, gap, landing, remaining, sell, profit,
      rate: totalBudget > 0 ? gap / totalBudget : 0,
      margin: sell > 0 ? profit / sell : 0,
      achieved: rated.filter(c => budgetGapStatus(c.totalBudget, c.budgetGap) === 'ok').length,
      ratedCount: rated.length,
      unsetCount: pool.length - rated.length,
    }
  })()
  // 事業別の売上・原価・利益（上の「全案件／進行中のみ」の切り替えに合わせる）
  const bizStats = businessNames
    .map(name => {
      const list = pool.filter(c => c.business === name)
      const sell = list.reduce((s, c) => s + c.bnsSell, 0)
      const cost = list.reduce((s, c) => s + c.bnsCost, 0)
      const profit = list.reduce((s, c) => s + c.grossProfit, 0)
      const ratedList = list.filter(c => c.totalBudget > 0)
      const budget = ratedList.reduce((s, c) => s + c.totalBudget, 0)
      const gap = ratedList.reduce((s, c) => s + c.budgetGap, 0)
      return { name, count: list.length, sell, cost, profit, margin: sell > 0 ? profit / sell : 0, budget, rate: budget > 0 ? gap / budget : 0 }
    })
    .filter(b => b.count > 0 || b.name !== UNCLASSIFIED)
  const rateTone = agg.totalBudget <= 0 ? 'default' : Math.abs(agg.rate) <= BUDGET_KPI_RATE ? 'good' : agg.rate < 0 ? 'danger' : 'warning'
  const toggleFilter = (f: Filter) => setFilter(filter === f ? '全て' : f)

  return (
    <TopShell active="home">
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* 上部：タイトル＋状況のタイル（明るい背景） */}
      <div>
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="text-[18px] font-semibold text-slate-900 whitespace-nowrap">PJ予算管理</h1>
              <span className="hidden sm:inline text-[12px] font-mono tracking-wide text-slate-400">BARE NOTE STUDIO</span>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="text-[14px] font-medium bg-[#17382f] hover:bg-[#0f2a22] text-white px-4 py-2 rounded-lg whitespace-nowrap"
            >
              ＋ 新規案件
            </button>
          </div>
        </header>
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryTile
              label="進行中の案件" value={`${summary.active}件`} sub={`総予算 ${formatYen(summary.budget)}`}
              selected={filter === '進行中'} onClick={() => toggleFilter('進行中')}
            />
            <SummaryTile
              label="要対応あり" value={`${summary.alert}件`} tone={summary.alert > 0 ? 'warning' : 'default'}
              sub="確認が必要な項目がある案件" selected={filter === '要対応あり'} onClick={() => toggleFilter('要対応あり')}
            />
            <SummaryTile
              label="予算超過" value={`${summary.over}件`} tone={summary.over > 0 ? 'danger' : 'default'}
              sub="着地見込が総予算を超えている案件" selected={filter === '予算超過'} onClick={() => toggleFilter('予算超過')}
            />
            <SummaryTile
              label="完了" value={`${summary.done}件`} sub="完了にした案件"
              selected={filter === '完了'} onClick={() => toggleFilter('完了')}
            />
          </div>
        </div>
      </div>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* 全案件サマリー（開閉できる） */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 gap-2">
            <button onClick={toggleAgg} className="flex items-center gap-2 text-left" aria-expanded={showAgg}>
              <span className={`text-slate-400 text-[11px] transition-transform ${showAgg ? 'rotate-90' : ''}`}>▶</span>
              <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2"><span className="w-1 h-4 rounded-sm bg-blue-600" />全案件サマリー</h2>
              {!showAgg && (
                <span className="text-[13px] text-slate-500 ml-2">
                  予実差率 <b className={rateTone === 'good' ? 'text-emerald-700' : rateTone === 'danger' ? 'text-rose-700' : rateTone === 'warning' ? 'text-amber-700' : 'text-slate-500'}>{agg.totalBudget > 0 ? formatPercent(agg.rate, 2) : '—'}</b>（目標±1%以内）／BNS粗利益 <b>{formatYen(agg.profit)}</b>
                </span>
              )}
            </button>
            {showAgg && (
              <div className="flex gap-0.5 rounded-lg bg-slate-200 p-0.5 text-[13px]">
                {([['all', '全案件'], ['active', '進行中のみ']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setScope(k)}
                    className={`px-3 py-1 rounded-md ${scope === k ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-600'}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
          {showAgg && (
            <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCard label="PJ総予算（合計・手入力）" value={formatYen(agg.totalBudget)} sub={`入力済 ${agg.ratedCount}案件${agg.unsetCount > 0 ? `／未入力 ${agg.unsetCount}案件（除く）` : ''}`} />
              <KpiCard label="実行費用（合計・自動）" value={formatYen(agg.execution)} sub="BNS外実行費用 ＋ BNS原価 ＋ 利益 ＋ 社内設計" />
              <KpiCard label="予実の差額（総予算−実行費用）" value={agg.ratedCount > 0 ? formatSignedYen(agg.gap) : '—'} tone={rateTone} />
              <KpiCard
                label="予実の差率（対総予算）"
                value={agg.totalBudget > 0 ? formatPercent(agg.rate, 2) : '—'}
                sub={`目標：±1%以内　${agg.ratedCount > 0 ? `達成 ${agg.achieved}/${agg.ratedCount}案件` : ''}`}
                tone={rateTone}
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
              <KpiCard label="残予算（実行費用−着地見込）" value={formatSignedYen(agg.remaining)} tone={agg.remaining < 0 ? 'danger' : 'good'} />
            </div>

            {/* 事業別の分析 */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-slate-100 text-[14px] font-semibold text-slate-900">
                事業別の分析 <span className="text-[12px] font-normal text-slate-400 ml-1">（行を押すと、その事業の案件だけを一覧に出します）</span>
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
                    <th className="px-3 py-2 font-medium text-right">総予算</th>
                    <th className="px-4 py-2 font-medium text-right">予実差率</th>
                  </tr>
                </thead>
                <tbody>
                  {bizStats.map(b => (
                    <tr key={b.name} onClick={() => setBusinessFilter(businessFilter === b.name ? 'すべて' : b.name)}
                      className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${businessFilter === b.name ? 'bg-slate-50' : ''}`}>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{b.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(b.sell)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(b.cost)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${b.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatSignedYen(b.profit)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.sell > 0 ? formatPercent(b.margin, 1) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(b.budget)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.budget > 0 ? formatPercent(b.rate, 2) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5">合計</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pool.length}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(agg.sell)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(pool.reduce((s, c) => s + c.bnsCost, 0))}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${agg.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatSignedYen(agg.profit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{agg.sell > 0 ? formatPercent(agg.margin, 1) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYen(agg.totalBudget)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{agg.totalBudget > 0 ? formatPercent(agg.rate, 2) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <h2 className="text-[16px] font-semibold text-slate-900 sm:mr-3">
            案件一覧 <span className="text-[13px] font-normal text-slate-400">{filtered.length}件</span>
          </h2>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="案件名で検索"
            className="w-full sm:w-64 border border-slate-200 bg-white rounded-lg px-3 py-2 text-[14px]"
          />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(['全て', '進行中', '完了', '予算超過', '要対応あり', '今期売上'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[13px] px-3 py-1.5 rounded-full whitespace-nowrap border ${
                  filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] text-slate-500 mr-1">事業</span>
            {['すべて', ...businessNames.filter(n => n !== UNCLASSIFIED || cards.some(c => c.business === UNCLASSIFIED))].map(n => (
              <button key={n} onClick={() => setBusinessFilter(n)}
                className={`text-[13px] px-3 py-1.5 rounded-full whitespace-nowrap border ${
                  businessFilter === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                }`}>
                {n}{n !== 'すべて' && <span className="ml-1 opacity-60">{cards.filter(c => c.business === n).length}</span>}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
            並べ替え
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[13px]">
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600 cursor-pointer">
            <input type="checkbox" checked={groupByBusiness} onChange={e => setGroupByBusiness(e.target.checked)} />
            事業ごとにまとめて表示
          </label>
        </div>

        {loading && <p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 text-center text-[14px] text-slate-400 py-16">
            {cards.length === 0 ? 'まだ案件がありません。右上の「＋ 新規案件」から作成してください。' : '該当する案件がありません'}
          </div>
        )}

        {filtered.length > 0 && groupByBusiness && (
          <div className="grid gap-6">
            {businessNames.map(name => {
              const list = filtered.filter(c => c.business === name)
              if (list.length === 0) return null
              const sell = list.reduce((s, c) => s + c.bnsSell, 0)
              const profit = list.reduce((s, c) => s + c.grossProfit, 0)
              return (
                <section key={name}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <h3 className="text-[15px] font-bold text-slate-900">{name}</h3>
                    <span className="text-[12.5px] text-slate-500">{list.length}件　売上 {formatYen(sell)}　利益 {formatSignedYen(profit)}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map(c => <ProjectCard key={c.project.id} data={c} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        {filtered.length > 0 && !groupByBusiness && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => <ProjectCard key={c.project.id} data={c} />)}
          </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/pjb/${id}`)} />}
    </div>
    </TopShell>
  )
}

const STATUS_PILL: Record<Project['status'], string> = {
  '進行中': 'bg-blue-50 text-blue-700 border-blue-200',
  '完了': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '保留': 'bg-amber-50 text-amber-700 border-amber-200',
}

function SummaryTile({
  label, value, sub, tone = 'default', selected, onClick,
}: { label: string; value: string; sub?: string; tone?: 'default' | 'warning' | 'danger'; selected: boolean; onClick: () => void }) {
  const valueColor = { default: 'text-slate-900', warning: 'text-amber-700', danger: 'text-rose-700' }[tone]
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border bg-white px-4 py-3 transition-colors ${
        selected ? 'border-emerald-300 ring-2 ring-emerald-300' : 'border-slate-200 hover:border-emerald-300'
      }`}
    >
      <div className="text-[13px] text-slate-500 mb-1">{label}</div>
      <div className={`text-[24px] font-semibold tabular-nums leading-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-400 mt-1">{sub}</div>}
    </button>
  )
}

function ProjectCard({ data }: { data: ProjectCardData }) {
  const { project } = data
  const over = data.remaining < 0
  const warn = !over && data.consumptionRate >= 0.9
  const tone = over ? 'border-rose-300' : warn ? 'border-amber-300' : 'border-slate-200'
  const gapStatus = budgetGapStatus(data.totalBudget, data.budgetGap)

  return (
    <Link href={`/pjb/${project.id}`} className={`block rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow ${tone}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate">{project.name}</div>
          <span className={`inline-block mt-1 text-[12px] px-2 py-0.5 rounded-full border font-medium ${STATUS_PILL[project.status]}`}>
            {project.status}
          </span>
          <span className="inline-block mt-1 ml-1.5 text-[12px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
            {data.business}
          </span>
          {fiscalYearOf(project.sales_month) === currentFiscal().year && (
            <span className="inline-block mt-1 ml-1.5 text-[12px] px-2 py-0.5 rounded-full border border-emerald-300 bg-white text-emerald-700 font-medium">今期売上</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {gapStatus === 'ok' && <Badge tone="good">予実1%以内</Badge>}
          {(gapStatus === 'over' || gapStatus === 'under') && <Badge tone={gapStatus === 'over' ? 'danger' : 'warning'}>予実1%超</Badge>}
          {over && <Badge tone="danger">超過</Badge>}
          {warn && <Badge tone="warning">要注意</Badge>}
          {data.alertCount > 0 && <Badge tone="info">要対応 {data.alertCount}件</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13.5px] mb-2">
        <div>
          <div className="text-slate-400 text-[12px]">PJ総予算</div>
          <div className="font-medium tabular-nums">{data.totalBudget > 0 ? formatYen(data.totalBudget) : <span className="text-slate-300">未入力</span>}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">実行費用</div>
          <div className="font-medium tabular-nums">{formatYen(data.executionBudget)}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">予実の差</div>
          <div className={`font-medium tabular-nums ${gapStatus === 'ok' ? 'text-emerald-600' : gapStatus === 'over' ? 'text-rose-600' : gapStatus === 'under' ? 'text-amber-700' : 'text-slate-300'}`}>
            {gapStatus === 'unset' ? '—' : formatSignedYen(data.budgetGap)}
            {gapStatus !== 'unset' && <span className="ml-1 text-[12px] font-normal text-slate-500">({formatPercent(data.budgetGap / data.totalBudget, 2)})</span>}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">BNS粗利益</div>
          <div className="font-medium tabular-nums">{formatYen(data.grossProfit)}　{formatPercent(data.grossMargin)}</div>
        </div>
      </div>

      {(project.pm_name || project.qa_name) && (
        <div className="text-[12px] text-slate-500 mb-2">
          {project.pm_name && <span className="mr-3">進行 {project.pm_name}</span>}
          {project.qa_name && <span>品質 {project.qa_name}</span>}
        </div>
      )}
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-rose-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, data.consumptionRate * 100))}%` }}
        />
      </div>
      <div className="text-[12px] text-slate-400 mt-1">着地見込 {formatYen(data.landingForecast)}　残予算 {formatSignedYen(data.remaining)}　消化率 {formatPercent(data.consumptionRate)}</div>
    </Link>
  )
}

function Badge({ tone, children }: { tone: 'danger' | 'warning' | 'info' | 'good'; children: React.ReactNode }) {
  const cls = {
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }[tone]
  return <span className={`text-[11.5px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [targetProfit, setTargetProfit] = useState('')
  const [business, setBusiness] = useState('')
  const [salesMonth, setSalesMonth] = useState('')
  const [staff, setStaff] = useState<Record<string, string>>({})
  const [roomCount, setRoomCount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('プロジェクト名は必須です'); return }
    if (!business) { setError('事業を選んでください'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('pjb_projects').insert({
      name: name.trim(),
      total_budget: 0,
      business,
      // 入力があるものだけ送る（SQLパッチ018の前でも、空のままなら登録できるように）
      ...(salesMonth ? { sales_month: monthInputToDate(salesMonth) } : {}),
      ...Object.fromEntries(STAFF_FIELDS.filter(f => (staff[f.key] || '').trim()).map(f => [f.key, staff[f.key].trim()])),
      target_profit: Number(targetProfit) || 0,
      room_count: Number(roomCount) || 0,
    }).select('id').single()

    if (err || !data) { setError(`作成に失敗しました：${err?.message || '不明なエラー'}`); setSaving(false); return }

    const { error: catErr } = await supabase.from('pjb_budget_categories').insert(
      DEFAULT_CATEGORIES.map(c => ({ project_id: data.id, ...c }))
    )
    if (catErr) { setError(`カテゴリー作成に失敗しました：${catErr.message}`); setSaving(false); return }
    onCreated(data.id)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5">
        <div className="text-[15px] font-semibold text-slate-900 mb-4">新規プロジェクト</div>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">プロジェクト名</span>
            <input value={name} onChange={e => setName(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="例）赤坂ウエストビル改修工事" />
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">事業</span>
            <select value={business} onChange={e => setBusiness(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px] bg-white">
              <option value="">選択してください</option>
              {BUSINESSES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">売上計上月（任意・その月に売上が立つ）</span>
            <input type="month" value={salesMonth} onChange={e => setSalesMonth(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px] bg-white" />
          </label>
          <div className="rounded-lg border border-slate-200 p-3 grid gap-2.5">
            <div className="text-[13px] font-semibold text-slate-700">担当者 <span className="font-normal text-slate-400">（任意・あとから編集できます）</span></div>
            {STAFF_FIELDS.map(f => (
              <label key={f.key} className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <span className="text-[13px] text-slate-500">{f.label}</span>
                <input
                  value={staff[f.key] || ''} onChange={e => setStaff(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-[14px]" placeholder="未設定"
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">目標利益（円・任意）</span>
            <MoneyInput value={targetProfit} onChange={setTargetProfit} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="1,700,000" />
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">総部屋数（任意）</span>
            <input type="number" value={roomCount} onChange={e => setRoomCount(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="12" />
          </label>
        </div>
        {error && <p className="text-[13.5px] text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">
            {saving ? '作成中…' : '作成する'}
          </button>
        </div>
      </div>
    </div>
  )
}
