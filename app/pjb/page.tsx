'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authState } from '@/lib/pjb/authState'
import { syncAssignmentsFromNames } from '@/lib/pjb/staff'
import { DEFAULT_CATEGORIES, BUSINESSES, UNCLASSIFIED, STAFF_FIELDS } from '@/lib/pjb/constants'
import { fiscalYearOf, currentFiscal, monthInputToDate } from '@/lib/pjb/fiscal'
import { useProjectCards, type ProjectCardData } from '@/lib/pjb/useProjectCards'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import { budgetGapStatus, hasBudgetKpi } from '@/lib/pjb/calc'
import { periodLabelOf } from '@/lib/pjb/periods'
import { MoneyInput } from './components/ui'
import TopShell from './components/TopShell'
import BcsMark from './components/BcsMark'
import { makeIsOver } from '@/lib/pjb/dashboard'
import type { Project } from '@/lib/pjb/types'



type SortKey = 'newest' | 'business' | 'name' | 'budget' | 'sell' | 'profit' | 'margin'
const SORT_LABELS: Record<SortKey, string> = {
  newest: '登録が新しい順', business: '事業別（illi → Kyo → Setup）', name: '案件名順', budget: '総予算が大きい順', sell: '売上が大きい順', profit: '利益が大きい順', margin: '利益率が高い順',
}

type Filter = '全て' | '未着手' | '進行中' | '完了' | '予算超過' | '要対応あり' | '今期売上'

export default function PjbHomePage() {
  const router = useRouter()
  const [checked, setChecked] = useState(authState.checked)
  const { cards, loading, reload: load } = useProjectCards(checked)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('全て')
  const [showNew, setShowNew] = useState(false)
  const [businessFilter, setBusinessFilter] = useState<string>('すべて')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  // ダッシュボードのタイル・事業別の行から開いたときは、その条件で絞り込む（?filter=進行中 / ?biz=事業名）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const f = q.get('filter') as Filter | null
    if (f && ['未着手', '進行中', '完了', '予算超過', '要対応あり', '今期売上'].includes(f)) setFilter(f)
    const bz = q.get('biz')
    if (bz) setBusinessFilter(bz)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login?redirect=%2Fpjb'); return }
      authState.checked = true
      setChecked(true)
    })
  }, [router])

  const isOver = useMemo(() => makeIsOver(cards), [cards])

  const filtered = useMemo(() => {
    const list = cards.filter(c => {
      if (businessFilter !== 'すべて' && c.business !== businessFilter) return false
      if (query && !c.project.name.includes(query)) return false
      if (filter === '未着手') return c.project.status === '未着手'
      if (filter === '進行中') return c.project.status === '進行中'
      if (filter === '完了') return c.project.status === '完了'
      if (filter === '予算超過') return isOver(c)
      if (filter === '要対応あり') return c.alertCount > 0
      if (filter === '今期売上') return c.project.status !== '未着手' && fiscalYearOf(c.project.sales_month) === currentFiscal().year
      return true
    })
    const margin = (c: ProjectCardData) => (c.bnsSell > 0 ? c.grossProfit / c.bnsSell : -Infinity)
    const cmp: Record<SortKey, (a: ProjectCardData, b: ProjectCardData) => number> = {
      newest: (a, b) => b.project.created_at.localeCompare(a.project.created_at),
      // 事業の並び（illi → Kyo → Setup → 未分類）。同じ事業の中は、登録が新しい順
      business: (a, b) => businessOrder(a.business) - businessOrder(b.business) || b.project.created_at.localeCompare(a.project.created_at),
      name: (a, b) => a.project.name.localeCompare(b.project.name, 'ja'),
      budget: (a, b) => b.totalBudget - a.totalBudget,
      sell: (a, b) => b.bnsSell - a.bnsSell,
      profit: (a, b) => b.grossProfit - a.grossProfit,
      margin: (a, b) => margin(b) - margin(a),
    }
    return list.sort(cmp[sortKey])
  }, [cards, isOver, query, filter, businessFilter, sortKey])

  // 期のある案件（group_idが同じ）は、1枚のカードにまとめる。絞り込みに合う期が1つでもあれば表示し、合計は全期で出す
  const units = (() => {
    const seen = new Set<string>()
    const out: Array<{ key: string; members: ProjectCardData[] }> = []
    for (const c of filtered) {
      const gid = c.project.group_id
      if (!gid) { out.push({ key: c.project.id, members: [c] }); continue }
      if (seen.has(gid)) continue
      seen.add(gid)
      out.push({ key: gid, members: cards.filter(x => x.project.group_id === gid).sort((a, b) => (a.project.period_no ?? 99) - (b.project.period_no ?? 99)) })
    }
    return out
  })()
  const renderUnit = (u: { key: string; members: ProjectCardData[] }) =>
    u.members.length > 1 || u.members[0].project.group_id ? <GroupCard key={u.key} members={u.members} /> : <ProjectCard key={u.key} data={u.members[0]} />

  // 事業の並び（登録している事業 → 未分類）。案件がある事業だけ、絞り込みの候補に出す
  const businessNames = [...BUSINESSES, UNCLASSIFIED]

  if (!checked) return null

  return (
    <TopShell active="home">
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* 上部：タイトル＋状況のタイル（明るい背景） */}
      <div>
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BcsMark size={30} />
              <h1 className="text-[18px] font-semibold text-slate-900 whitespace-nowrap">Budget Control System</h1>
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
      </div>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <h2 className="text-[16px] font-semibold text-slate-900 sm:mr-3">
            案件一覧 <span className="text-[13px] font-normal text-slate-400">{units.length}件</span>
          </h2>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="案件名で検索"
            className="w-full sm:w-64 border border-slate-200 bg-white rounded-lg px-3 py-2 text-[14px]"
          />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(['全て', '未着手', '進行中', '完了', '予算超過', '要対応あり', '今期売上'] as Filter[]).map(f => (
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
                {n !== 'すべて' && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: bizColor(n) }} />}{n}{n !== 'すべて' && <span className="ml-1 opacity-60">{cards.filter(c => c.business === n).length}</span>}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
            並べ替え
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[13px]">
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </label>
        </div>

        {loading && <p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 text-center text-[14px] text-slate-400 py-16">
            {cards.length === 0 ? 'まだ案件がありません。右上の「＋ 新規案件」から作成してください。' : '該当する案件がありません'}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid gap-6">
            {businessNames.map(name => {
              const us = units.filter(u => u.members[0].business === name)
              if (us.length === 0) return null
              const list = us.flatMap(u => u.members)
              const sell = list.reduce((s, c) => s + c.bnsSell, 0)
              const profit = list.reduce((s, c) => s + c.grossProfit, 0)
              return (
                <section key={name}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <h3 className="text-[15px] font-bold text-slate-900">{name}</h3>
                    <span className="text-[12.5px] text-slate-500">{us.length}件　売上 {formatYen(sell)}　利益 {formatSignedYen(profit)}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {us.map(renderUnit)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/pjb/${id}`)} />}
    </div>
    </TopShell>
  )
}

const STATUS_PILL: Record<Project['status'], string> = {
  '未着手': 'bg-slate-100 text-slate-600 border-slate-300',
  '進行中': 'bg-blue-50 text-blue-700 border-blue-200',
  '完了': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '保留': 'bg-amber-50 text-amber-700 border-amber-200',
}

function ProjectCard({ data }: { data: ProjectCardData }) {
  const { project } = data
  const over = data.remaining < 0
  const tone = over ? 'border-rose-300' : 'border-slate-200'
  const kpi = hasBudgetKpi(data.business)
  const gapStatus = kpi ? budgetGapStatus(data.totalBudget, data.budgetGap) : 'unset'

  return (
    <Link href={`/pjb/${project.id}`} style={{ '--pjb-accent': bizColor(data.business) } as React.CSSProperties} className={`pjb-card block rounded-xl border bg-white p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate">{project.name}</div>
          <span className={`inline-block mt-1 text-[12px] px-2 py-0.5 rounded-full border font-medium ${STATUS_PILL[project.status]}`}>
            {project.status}
          </span>
          <span className="inline-block mt-1 ml-1.5 text-[12px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
            {data.business}
          </span>
          {project.status !== '未着手' && fiscalYearOf(project.sales_month) === currentFiscal().year && (
            <span className="inline-block mt-1 ml-1.5 text-[12px] px-2 py-0.5 rounded-full border border-emerald-300 bg-white text-emerald-700 font-medium">今期売上</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {gapStatus === 'ok' && <Badge tone="good">予実1%以内</Badge>}
          {(gapStatus === 'over' || gapStatus === 'under') && <Badge tone={gapStatus === 'over' ? 'danger' : 'warning'}>予実1%超</Badge>}
          {over && <Badge tone="danger">超過</Badge>}
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
        {kpi && (
          <div>
            <div className="text-slate-400 text-[12px]">予実の差</div>
            <div className={`font-medium tabular-nums ${gapStatus === 'ok' ? 'text-emerald-600' : gapStatus === 'over' ? 'text-rose-600' : gapStatus === 'under' ? 'text-amber-700' : 'text-slate-300'}`}>
              {gapStatus === 'unset' ? '—' : formatSignedYen(data.budgetGap)}
              {gapStatus !== 'unset' && <span className="ml-1 text-[12px] font-normal text-slate-500">({formatPercent(data.budgetGap / data.totalBudget, 2)})</span>}
            </div>
          </div>
        )}
        <div>
          <div className="text-slate-400 text-[12px]">BNS粗利益</div>
          <div className="font-medium tabular-nums">{formatYen(data.grossProfit)}　{formatPercent(data.grossMargin)}</div>
        </div>
      </div>

      <Assignees pm={data.pmNames} qa={data.qaNames} />
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-rose-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, data.consumptionRate * 100))}%` }}
        />
      </div>
      <div className="text-[12px] text-slate-400 mt-1">着地見込 {formatYen(data.landingForecast)}　残予算 {data.totalBudget > 0 ? formatSignedYen(data.remaining) : '—'}　消化率 {data.totalBudget > 0 ? formatPercent(data.consumptionRate) : '—'}</div>
    </Link>
  )
}

// 期のある案件のカード：全期の合計と、期ごとの行（期を押すと、その期の案件ページへ）
// 進行管理・品質管理の担当者（複数名OK）。ない役割は出さない
function Assignees({ pm, qa }: { pm: string[]; qa: string[] }) {
  if (pm.length === 0 && qa.length === 0) return null
  return (
    <div className="text-[12px] text-slate-500 mb-2">
      {pm.length > 0 && <span className="mr-3">進行 {pm.join('・')}</span>}
      {qa.length > 0 && <span>品質 {qa.join('・')}</span>}
    </div>
  )
}

// 事業ごとの色（カードの上端のラインと、事業の絞り込みボタンの点）
const BIZ_COLOR: Record<string, string> = { 'illi Stays & Hotels': '#008CE3', 'Kyo Residence': '#796EFF', 'Setup Office': '#059669' }
const bizColor = (name: string) => BIZ_COLOR[name] ?? '#94A3B8'

const businessOrder = (name: string) => { const i = (BUSINESSES as readonly string[]).indexOf(name); return i < 0 ? BUSINESSES.length : i }

const uniqueNames = (names: string[]) => Array.from(new Set(names))

function GroupCard({ members }: { members: ProjectCardData[] }) {
  const first = members[0]
  const sum = (f: (c: ProjectCardData) => number) => members.reduce((s, c) => s + f(c), 0)
  const remaining = sum(c => c.remaining)
  const over = remaining < 0
  const alerts = sum(c => c.alertCount)
  const nowFy = currentFiscal().year
  const kpi = hasBudgetKpi(first.business)

  return (
    <div style={{ '--pjb-accent': bizColor(first.business) } as React.CSSProperties} className={`pjb-card rounded-xl border bg-white p-4 ${over ? 'border-rose-300' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <Link href={`/pjb/${first.project.id}/all`} className="block text-[15px] font-semibold text-slate-900 truncate hover:underline">{first.project.name}</Link>
          <span className="inline-block mt-1 text-[12px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">{first.business}</span>
          <span className="inline-block mt-1 ml-1.5 text-[12px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600">{members.length}期</span>
          <Link href={`/pjb/${first.project.id}/all`} className="inline-block mt-1 ml-1.5 text-[12px] text-blue-700 hover:underline">全期のダッシュボード ›</Link>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {over && <Badge tone="danger">超過</Badge>}
          {alerts > 0 && <Badge tone="info">要対応 {alerts}件</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13.5px] mb-3">
        <div>
          <div className="text-slate-400 text-[12px]">PJ総予算（全期）</div>
          <div className="font-medium tabular-nums">{sum(c => c.totalBudget) > 0 ? formatYen(sum(c => c.totalBudget)) : <span className="text-slate-300">未入力</span>}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">実行費用（全期）</div>
          <div className="font-medium tabular-nums">{formatYen(sum(c => c.executionBudget))}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">BNS粗利益（全期）</div>
          <div className="font-medium tabular-nums">{formatYen(sum(c => c.grossProfit))}</div>
        </div>
        <div>
          <div className="text-slate-400 text-[12px]">残予算（全期）</div>
          <div className={`font-medium tabular-nums ${remaining < 0 ? 'text-rose-600' : ''}`}>{formatSignedYen(remaining)}</div>
        </div>
      </div>

      {/* 期のある案件は、どの期かに関わらず、全期の担当者をまとめて出す */}
      <Assignees pm={uniqueNames(members.flatMap(c => c.pmNames))} qa={uniqueNames(members.flatMap(c => c.qaNames))} />

      <div className="rounded-lg border border-slate-100 divide-y divide-slate-100">
        {members.map(c => {
          const st = kpi ? budgetGapStatus(c.totalBudget, c.budgetGap) : 'unset'
          const fy = fiscalYearOf(c.project.sales_month)
          return (
            <Link key={c.project.id} href={`/pjb/${c.project.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-slate-50 text-[13px]">
              <span className="font-semibold text-slate-900 w-9">{periodLabelOf(c.project) || '—'}</span>
              <span className={`text-[11.5px] px-1.5 py-0.5 rounded-full border font-medium ${STATUS_PILL[c.project.status]}`}>{c.project.status}</span>
              <span className="text-slate-500">
                {c.project.sales_month ? `売上 ${c.project.sales_month.slice(0, 7).replace('-', '年')}月` : '売上月 未設定'}
              </span>
              {fy === nowFy && <span className="text-[11.5px] text-emerald-700 font-medium">今期売上</span>}
              <span className="ml-auto tabular-nums text-slate-700">{formatYen(c.executionBudget)}</span>
              {st === 'ok' && <Badge tone="good">予実1%以内</Badge>}
              {(st === 'over' || st === 'under') && <Badge tone={st === 'over' ? 'danger' : 'warning'}>予実1%超</Badge>}
            </Link>
          )
        })}
      </div>
    </div>
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
    await syncAssignmentsFromNames(data.id, { 進行管理: staff.pm_name, 品質管理: staff.qa_name })
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
