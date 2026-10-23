'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEFAULT_CATEGORIES } from '@/lib/pjb/constants'
import { summarizeCategory, summarizeProject, buildAlerts } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import { MoneyInput, KpiCard } from './components/ui'
import type { Project, BudgetCategory, Order, AdditionalWork, VeItem, SalesItem } from '@/lib/pjb/types'

type ProjectCardData = {
  project: Project
  totalBudget: number
  landingForecast: number
  remaining: number
  consumptionRate: number
  grossProfit: number
  grossMargin: number
  bnsSell: number
  alertCount: number
}

const KPI_RATE = 0.01   // 予実管理のKPI：残予算が総予算の±1%以内

type Filter = '全て' | '進行中' | '完了' | '予算超過' | '要対応あり'

export default function PjbHomePage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<ProjectCardData[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('全て')
  const [showNew, setShowNew] = useState(false)
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

  useEffect(() => { if (checked) load() }, [checked])

  const load = async () => {
    setLoading(true)
    const { data: projects } = await supabase.from('pjb_projects').select('*').order('created_at', { ascending: false })
    const list = (projects || []) as Project[]
    if (list.length === 0) { setCards([]); setLoading(false); return }

    const ids = list.map(p => p.id)
    const [catRes, orderRes, workRes, veRes, salesRes] = await Promise.all([
      supabase.from('pjb_budget_categories').select('*').in('project_id', ids),
      supabase.from('pjb_orders').select('*').in('project_id', ids),
      supabase.from('pjb_additional_works').select('*').in('project_id', ids),
      supabase.from('pjb_ve_items').select('*').in('project_id', ids),
      supabase.from('pjb_sales_items').select('*').in('project_id', ids),
    ])
    // 売上の内訳のテーブルがまだないときは null（従来どおり、項目に直接入れた売上を使う）
    const salesAll: SalesItem[] | null = salesRes.error ? null : ((salesRes.data || []) as SalesItem[])
    const categories = (catRes.data || []) as BudgetCategory[]
    const orders = (orderRes.data || []) as Order[]
    const works = (workRes.data || []) as AdditionalWork[]
    const ves = (veRes.data || []) as VeItem[]

    const result: ProjectCardData[] = list.map(project => {
      const cats = categories.filter(c => c.project_id === project.id)
      const summaries = cats.map(c => summarizeCategory(c, orders, works, ves))
      const totals = summarizeProject(project, cats, summaries, salesAll === null ? null : salesAll.filter(x => x.project_id === project.id))
      const alerts = buildAlerts(cats, summaries, orders.filter(o => o.project_id === project.id), works.filter(w => w.project_id === project.id), ves.filter(v => v.project_id === project.id), `/pjb/${project.id}`)
      return {
        project,
        totalBudget: totals.totalBudget,
        landingForecast: totals.landingForecast,
        remaining: totals.remaining,
        consumptionRate: totals.consumptionRate,
        grossProfit: totals.bnsGrossProfit,
        grossMargin: totals.grossMargin,
        bnsSell: totals.bnsSell,
        alertCount: alerts.length,
      }
    })
    setCards(result)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return cards.filter(c => {
      if (query && !c.project.name.includes(query)) return false
      if (filter === '進行中') return c.project.status === '進行中'
      if (filter === '完了') return c.project.status === '完了'
      if (filter === '予算超過') return c.remaining < 0
      if (filter === '要対応あり') return c.alertCount > 0
      return true
    })
  }, [cards, query, filter])

  if (!checked) return null

  const openCards = cards.filter(c => c.project.status !== '完了')
  const summary = {
    active: cards.filter(c => c.project.status === '進行中').length,
    budget: cards.filter(c => c.project.status === '進行中').reduce((s, c) => s + c.totalBudget, 0),
    alert: openCards.filter(c => c.alertCount > 0).length,
    over: openCards.filter(c => c.remaining < 0).length,
    done: cards.filter(c => c.project.status === '完了').length,
  }
  // 全案件（または進行中のみ）の集計。予実管理のKPIは「総予算に対する残予算（余り）が±1%以内」
  const pool = scope === 'active' ? cards.filter(c => c.project.status === '進行中') : cards
  const agg = (() => {
    const totalBudget = pool.reduce((s, c) => s + c.totalBudget, 0)
    const landing = pool.reduce((s, c) => s + c.landingForecast, 0)
    const remaining = pool.reduce((s, c) => s + c.remaining, 0)
    const sell = pool.reduce((s, c) => s + c.bnsSell, 0)
    const profit = pool.reduce((s, c) => s + c.grossProfit, 0)
    const rated = pool.filter(c => c.totalBudget > 0)
    return {
      totalBudget, landing, remaining, sell, profit,
      rate: totalBudget > 0 ? remaining / totalBudget : 0,
      margin: sell > 0 ? profit / sell : 0,
      achieved: rated.filter(c => Math.abs(c.remaining / c.totalBudget) <= KPI_RATE).length,
      ratedCount: rated.length,
    }
  })()
  const rateTone = Math.abs(agg.rate) <= KPI_RATE ? 'good' : agg.rate < 0 ? 'danger' : 'warning'
  const toggleFilter = (f: Filter) => setFilter(filter === f ? '全て' : f)

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* 上部：サイドバーと同じ深いグリーンの帯（タイトル＋状況のタイル） */}
      <div className="bg-[#17382f]">
        <header>
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="text-[18px] font-semibold text-white whitespace-nowrap">PJ予算管理</h1>
              <span className="hidden sm:inline text-[12px] font-mono tracking-wide text-emerald-100/50">BARE NOTE STUDIO</span>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="text-[14px] font-medium bg-[#e2efe8] hover:bg-white text-[#17382f] px-4 py-2 rounded-lg whitespace-nowrap"
            >
              ＋ 新規案件
            </button>
          </div>
        </header>
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-7">
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
                  残予算率 <b className={rateTone === 'good' ? 'text-emerald-700' : rateTone === 'danger' ? 'text-rose-700' : 'text-amber-700'}>{formatPercent(agg.rate, 1)}</b>（目標±1%以内）／BNS粗利益 <b>{formatYen(agg.profit)}</b>
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
              <KpiCard label="総予算（合計）" value={formatYen(agg.totalBudget)} sub={`${pool.length}案件`} />
              <KpiCard label="着地見込（合計）" value={formatYen(agg.landing)} />
              <KpiCard label="残予算（合計）" value={formatSignedYen(agg.remaining)} tone={rateTone} />
              <KpiCard
                label="残予算率（対総予算）"
                value={formatPercent(agg.rate, 1)}
                sub={`目標：±1%以内　${agg.ratedCount > 0 ? `達成 ${agg.achieved}/${agg.ratedCount}案件` : ''}`}
                tone={rateTone}
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="BNS売上（合計）" value={formatYen(agg.sell)} />
              <KpiCard label="BNS粗利益（合計）" value={formatYen(agg.profit)} tone={agg.profit < 0 ? 'danger' : 'good'} />
              <KpiCard label="粗利率" value={formatPercent(agg.margin, 1)} tone={agg.margin < 0 ? 'danger' : 'default'} />
              <KpiCard label="予実1%以内の案件" value={agg.ratedCount > 0 ? `${agg.achieved}/${agg.ratedCount}件` : '—'}
                tone={agg.ratedCount > 0 && agg.achieved === agg.ratedCount ? 'good' : 'default'} sub="残予算が総予算の±1%以内" />
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
            {(['全て', '進行中', '完了', '予算超過', '要対応あり'] as Filter[]).map(f => (
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

        {loading && <p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 text-center text-[14px] text-slate-400 py-16">
            {cards.length === 0 ? 'まだ案件がありません。右上の「＋ 新規案件」から作成してください。' : '該当する案件がありません'}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => <ProjectCard key={c.project.id} data={c} />)}
          </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/pjb/${id}`)} />}
    </div>
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
        selected ? 'border-emerald-300 ring-2 ring-emerald-300' : 'border-transparent hover:border-emerald-200'
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

  return (
    <Link href={`/pjb/${project.id}`} className={`block rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow ${tone}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate">{project.name}</div>
          <span className={`inline-block mt-1 text-[12px] px-2 py-0.5 rounded-full border font-medium ${STATUS_PILL[project.status]}`}>
            {project.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {data.totalBudget > 0 && Math.abs(data.remaining / data.totalBudget) <= KPI_RATE && <Badge tone="good">予実1%以内</Badge>}
          {over && <Badge tone="danger">超過</Badge>}
          {warn && <Badge tone="warning">要注意</Badge>}
          {data.alertCount > 0 && <Badge tone="info">要対応 {data.alertCount}件</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13.5px] mb-2">
        <div>
          <div className="text-slate-400 text-[12px]">総予算</div>
          <div className="font-medium tabular-nums">{formatYen(data.totalBudget)}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">着地見込</div>
          <div className={`font-medium tabular-nums ${over ? 'text-rose-600' : ''}`}>{formatYen(data.landingForecast)}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">残予算</div>
          <div className={`font-medium tabular-nums ${over ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatSignedYen(data.remaining)}
            {data.totalBudget > 0 && <span className="ml-1 text-[12px] font-normal text-slate-500">({formatPercent(data.remaining / data.totalBudget, 1)})</span>}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">BNS粗利益</div>
          <div className="font-medium tabular-nums">{formatYen(data.grossProfit)}　{formatPercent(data.grossMargin)}</div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-rose-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, data.consumptionRate * 100))}%` }}
        />
      </div>
      <div className="text-[12px] text-slate-400 mt-1">予算の消化率 {formatPercent(data.consumptionRate)}</div>
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
  const [roomCount, setRoomCount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('プロジェクト名は必須です'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('pjb_projects').insert({
      name: name.trim(),
      total_budget: 0,
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
