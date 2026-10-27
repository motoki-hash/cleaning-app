'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TopShell from '../components/TopShell'
import { InlineAmount, SectionTitle } from '../components/ui'
import { supabase } from '@/lib/supabase'
import { useProjectCards } from '@/lib/pjb/useProjectCards'
import { BUSINESSES, UNCLASSIFIED } from '@/lib/pjb/constants'
import { formatYen, formatPercent } from '@/lib/pjb/format'
import { FY_MONTH_LABELS, fiscalYearOf, fiscalMonthIndex, currentFiscal } from '@/lib/pjb/fiscal'

type Plan = { fiscal_year: number; business: string; month: number; sales: number; cost: number; updated_at?: string }

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const cumulative = (a: number[]) => a.reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] || 0) + x], [])
const k = (v: number) => Math.round(v / 1000).toLocaleString('ja-JP')
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function FyPage() {
  const now = currentFiscal()
  const [fy, setFy] = useState(now.year)
  const { cards, loading } = useProjectCards(true)
  const [plans, setPlans] = useState<Plan[]>([])
  const [planError, setPlanError] = useState(false)

  const loadPlans = useCallback(async () => {
    const { data, error } = await supabase.from('pjb_fy_plans').select('*').eq('fiscal_year', fy)
    if (error) { setPlanError(true); setPlans([]); return }
    setPlanError(false)
    setPlans((data || []) as Plan[])
  }, [fy])
  useEffect(() => { loadPlans() }, [loadPlans])

  const planOf = (b: string, m: number) => plans.find(p => p.business === b && p.month === m)
  const savePlan = async (b: string, m: number, field: 'sales' | 'cost', v: number) => {
    const cur = planOf(b, m)
    const row = { fiscal_year: fy, business: b, month: m, sales: cur?.sales || 0, cost: cur?.cost || 0, [field]: v, updated_at: new Date().toISOString() }
    setPlans(prev => [...prev.filter(p => !(p.business === b && p.month === m)), row as Plan])
    const { error } = await supabase.from('pjb_fy_plans').upsert(row, { onConflict: 'fiscal_year,business,month' })
    if (error) { alert('計画を保存できませんでした。SQLパッチ018が実行されているか確認してください。'); loadPlans() }
  }

  // 実績（完了）・見込（それ以外）を、事業×月で集計
  const actual = useMemo(() => {
    const m = new Map<string, { done: { sales: number; cost: number }; fc: { sales: number; cost: number } }>()
    const key = (b: string, i: number) => `${b}|${i}`
    for (const c of cards) {
      if (fiscalYearOf(c.project.sales_month) !== fy) continue
      const i = fiscalMonthIndex(c.project.sales_month)!
      const kk = key(c.business, i)
      const e = m.get(kk) || { done: { sales: 0, cost: 0 }, fc: { sales: 0, cost: 0 } }
      const t = c.project.status === '完了' ? e.done : e.fc
      t.sales += c.bnsSell; t.cost += c.bnsCost
      m.set(kk, e)
    }
    return (b: string | null, i: number) => {
      const out = { done: { sales: 0, cost: 0 }, fc: { sales: 0, cost: 0 } }
      for (const [kk, e] of m) {
        const [bb, ii] = kk.split('|')
        if (Number(ii) !== i || (b !== null && bb !== b)) continue
        out.done.sales += e.done.sales; out.done.cost += e.done.cost
        out.fc.sales += e.fc.sales; out.fc.cost += e.fc.cost
      }
      return out
    }
  }, [cards, fy])

  const businesses = [...BUSINESSES, UNCLASSIFIED]
  const series = (b: string | null) => MONTHS.map(i => {
    const planS = b === null ? sum(BUSINESSES.map(x => planOf(x, i)?.sales || 0)) : (planOf(b, i)?.sales || 0)
    const planC = b === null ? sum(BUSINESSES.map(x => planOf(x, i)?.cost || 0)) : (planOf(b, i)?.cost || 0)
    const a = actual(b, i)
    const sales = a.done.sales + a.fc.sales
    const cost = a.done.cost + a.fc.cost
    return { planS, planP: planS - planC, sales, profit: sales - cost, doneSales: a.done.sales, doneProfit: a.done.sales - a.done.cost }
  })
  const all = series(null)
  const isCur = fy === now.year
  const upTo = isCur ? now.month : fy < now.year ? 12 : 0
  const tot = (key: keyof typeof all[number], to = 12) => sum(all.slice(0, to).map(r => r[key]))

  const kpi = {
    ytdPlanS: tot('planS', upTo), ytdS: tot('sales', upTo), ytdPlanP: tot('planP', upTo), ytdP: tot('profit', upTo),
    fyPlanS: tot('planS'), fyS: tot('sales'), fyPlanP: tot('planP'), fyP: tot('profit'),
  }
  const rate = (a: number, b: number) => (b ? a / b : 0)

  return (
    <TopShell active="fy">
      <div className="max-w-6xl mx-auto px-4 py-5 pb-24">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h1 className="text-[20px] font-semibold text-slate-900">{fy}年度の売上分析</h1>
          <select value={fy} onChange={e => setFy(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1 text-[14px] bg-white">
            {[now.year - 1, now.year, now.year + 1].map(y => <option key={y} value={y}>{y}年度（{y}年4月〜{y + 1}年3月）</option>)}
          </select>
        </div>
        <p className="text-[13px] text-slate-500 mb-4">
          売上は各案件の「売上計上月」で集計します（完了＝実績、それ以外＝見込）。金額は税別。計画は下の表に入力できます。
        </p>

        {planError && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[13px] px-3 py-2">
            計画のテーブルがまだありません。SQLパッチ018を実行すると、計画を入力・保存できるようになります（実績の集計は今のままでも見られます）。
          </div>
        )}

        {loading ? <div className="text-slate-500 text-[14px]">読み込み中…</div> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Tile label={`${isCur ? `${FY_MONTH_LABELS[now.month - 1]}まで` : '期間'}の売上達成`} value={formatPercent(rate(kpi.ytdS, kpi.ytdPlanS), 1)} sub={`${formatYen(kpi.ytdS)} / 計画 ${formatYen(kpi.ytdPlanS)}`} />
              <Tile label="利益達成" value={formatPercent(rate(kpi.ytdP, kpi.ytdPlanP), 1)} sub={`${formatYen(kpi.ytdP)} / 計画 ${formatYen(kpi.ytdPlanP)}`} />
              <Tile label="通期の売上達成（見込）" value={formatPercent(rate(kpi.fyS, kpi.fyPlanS), 1)} sub={`${formatYen(kpi.fyS)} / 計画 ${formatYen(kpi.fyPlanS)}`} />
              <Tile label="通期の利益達成（見込）" value={formatPercent(rate(kpi.fyP, kpi.fyPlanP), 1)} sub={`${formatYen(kpi.fyP)} / 計画 ${formatYen(kpi.fyPlanP)}`} />
              <Tile label="通期の利益率（見込）" value={formatPercent(rate(kpi.fyP, kpi.fyS), 1)} sub={`計画 ${formatPercent(rate(kpi.fyPlanP, kpi.fyPlanS), 1)}`} />
              <Tile label="利益差額（通期・計画比）" value={formatYen(kpi.fyP - kpi.fyPlanP)} sub="見込 − 計画" tone={kpi.fyP - kpi.fyPlanP < 0 ? 'bad' : 'good'} />
              <Tile label="今期売上の案件" value={`${cards.filter(c => fiscalYearOf(c.project.sales_month) === fy).length}件`} sub={`うち完了 ${cards.filter(c => fiscalYearOf(c.project.sales_month) === fy && c.project.status === '完了').length}件`} />
              <Tile label="売上計上月が未設定" value={`${cards.filter(c => !c.project.sales_month && c.project.status === '進行中').length}件`} sub="進行中の案件のうち" />
            </div>

            <Chart rows={all} />

            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 overflow-x-auto">
              <SectionTitle>月別（全体・千円）</SectionTitle>
              <table className="w-full text-[13px] tabular-nums min-w-[760px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium py-1.5 pr-2 w-32"></th>
                    {FY_MONTH_LABELS.map(l => <th key={l} className="text-right font-medium px-1.5">{l}</th>)}
                    <th className="text-right font-medium pl-2">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['売上計画', 'planS'], ['売上 実績/見込', 'sales'], ['利益計画', 'planP'], ['利益 実績/見込', 'profit'],
                  ] as const).map(([label, key]) => (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{label}</td>
                      {all.map((r, i) => <td key={i} className="text-right px-1.5">{k(r[key])}</td>)}
                      <td className="text-right pl-2 font-semibold">{k(tot(key))}</td>
                    </tr>
                  ))}
                  {([['売上 計画差', 'sales', 'planS'], ['利益 計画差', 'profit', 'planP']] as const).map(([label, a, b]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{label}</td>
                      {all.map((r, i) => <td key={i} className={`text-right px-1.5 ${r[a] - r[b] < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{k(r[a] - r[b])}</td>)}
                      <td className={`text-right pl-2 font-semibold ${tot(a) - tot(b) < 0 ? 'text-rose-600' : ''}`}>{k(tot(a) - tot(b))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
              <SectionTitle>事業別の達成度（通期）</SectionTitle>
              <div className="grid gap-3">
                {businesses.map(b => {
                  const s = series(b)
                  const planS = sum(s.map(r => r.planS)), act = sum(s.map(r => r.sales)), actP = sum(s.map(r => r.profit)), planP = sum(s.map(r => r.planP))
                  if (b === UNCLASSIFIED && act === 0) return null
                  const pct = planS ? Math.min(act / planS, 1.5) : 0
                  return (
                    <div key={b}>
                      <div className="flex flex-wrap items-baseline gap-x-4 text-[13px] mb-1">
                        <span className="font-semibold text-slate-900 text-[14px]">{b}</span>
                        <span className="text-slate-600">売上 {formatYen(act)}／計画 {formatYen(planS)}（{formatPercent(rate(act, planS), 1)}）</span>
                        <span className="text-slate-600">利益 {formatYen(actP)}／計画 {formatYen(planP)}（{formatPercent(rate(actP, planP), 1)}）</span>
                      </div>
                      <div className="h-3 rounded bg-slate-100 overflow-hidden">
                        <div className={`h-full ${pct >= 1 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 overflow-x-auto">
              <SectionTitle>計画の入力（事業別・月別・円）</SectionTitle>
              <p className="text-[12px] text-slate-500 mb-1">金額をタップして入力します（計算式も使えます）。利益計画＝売上計画 − 原価計画。</p>
              <p className="text-[12px] text-slate-500 mb-2">
                事業計画のスプレッドシートと連携している場合、ここの数字はシートの値で自動的に更新されます（直接直しても、次の同期でシートの値に戻ります）。
                {plans.length > 0 && <>最終更新：{new Date(plans.reduce((m, p) => (p.updated_at && p.updated_at > m ? p.updated_at : m), '')).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
              </p>
              <table className="w-full text-[13px] min-w-[1100px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium py-1.5 pr-2 w-36">事業</th>
                    {FY_MONTH_LABELS.map(l => <th key={l} className="text-right font-medium px-1">{l}</th>)}
                    <th className="text-right font-medium pl-2">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {BUSINESSES.flatMap(b => (['sales', 'cost'] as const).map(f => {
                    const vals = MONTHS.map(i => planOf(b, i)?.[f] || 0)
                    return (
                      <tr key={b + f} className="border-t border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{b} <span className="text-slate-400">{f === 'sales' ? '売上' : '原価'}</span></td>
                        {MONTHS.map(i => (
                          <td key={i} className="px-0.5 min-w-[88px]">
                            <InlineAmount value={planOf(b, i)?.[f] || 0} onCommit={v => savePlan(b, i, f, v)} boxed />
                          </td>
                        ))}
                        <td className="text-right pl-2 font-semibold tabular-nums">{formatYen(sum(vals))}</td>
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <SectionTitle>この年度に売上が立つ案件</SectionTitle>
              <ul className="divide-y divide-slate-100">
                {cards.filter(c => fiscalYearOf(c.project.sales_month) === fy)
                  .sort((a, b) => (a.project.sales_month || '').localeCompare(b.project.sales_month || ''))
                  .map(c => (
                    <li key={c.project.id}>
                      <a href={`/pjb/${c.project.id}`} className="grid grid-cols-[4rem_1fr_auto] gap-2 py-2 text-[13px] hover:bg-slate-50">
                        <span className="text-slate-500">{FY_MONTH_LABELS[(fiscalMonthIndex(c.project.sales_month) || 1) - 1]}</span>
                        <span className="truncate text-slate-900">{c.project.name} <span className="text-slate-400">{c.business}／{c.project.status}</span></span>
                        <span className="tabular-nums text-slate-700">売上 {formatYen(c.bnsSell)}／利益 {formatYen(c.grossProfit)}</span>
                      </a>
                    </li>
                  ))}
              </ul>
              {cards.every(c => fiscalYearOf(c.project.sales_month) !== fy) && (
                <div className="text-[13px] text-slate-500 py-2">売上計上月を設定した案件がありません。各案件の画面の「案件情報」で設定してください。</div>
              )}
            </div>
          </>
        )}
      </div>
    </TopShell>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className={`text-[22px] font-semibold tabular-nums mt-0.5 ${tone === 'bad' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// 累計の推移（売上/利益 × 計画/実績・見込）
function Chart({ rows }: { rows: { planS: number; planP: number; sales: number; profit: number }[] }) {
  const lines = [
    { label: '売上計画', data: cumulative(rows.map(r => r.planS)), color: '#94a3b8', dash: '5 4' },
    { label: '売上 実績/見込', data: cumulative(rows.map(r => r.sales)), color: '#17382f' },
    { label: '利益計画', data: cumulative(rows.map(r => r.planP)), color: '#cbd5e1', dash: '5 4' },
    { label: '利益 実績/見込', data: cumulative(rows.map(r => r.profit)), color: '#10b981' },
  ]
  const W = 720, H = 240, L = 56, R = 12, T = 12, B = 28
  const max = Math.max(1, ...lines.flatMap(l => l.data))
  const x = (i: number) => L + (i * (W - L - R)) / 11
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
      <SectionTitle>累計の推移</SectionTitle>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" />
            <text x={L - 6} y={y(max * t) + 4} fontSize="10" textAnchor="end" fill="#64748b">{k(max * t)}</text>
          </g>
        ))}
        {FY_MONTH_LABELS.map((l, i) => <text key={l} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#64748b">{l}</text>)}
        {lines.map(l => (
          <polyline key={l.label} fill="none" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash}
            points={l.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[12px] text-slate-600">
        {lines.map(l => <span key={l.label} className="inline-flex items-center gap-1.5"><i className="inline-block w-4 h-0.5" style={{ background: l.color }} />{l.label}</span>)}
        <span className="text-slate-400">（単位：千円）</span>
      </div>
    </div>
  )
}
