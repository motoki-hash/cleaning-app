'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import { SectionTitle, EmptyState, InlineAmount, InlineNumber, InlineText, KpiCard, MoneyInput } from '../../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { formatYen, formatPercent } from '@/lib/pjb/format'
import { logActivity } from '@/lib/pjb/activity'
import type { Investor, InvestorBilling, InvestorPhase } from '@/lib/pjb/types'

const PHASES: InvestorPhase[] = ['着工', '中間', '完了']

export default function InvestorsPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, investors, billings, loading, notFound, reload } = useProjectData(id)
  const [showNew, setShowNew] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const totalRooms = project?.room_count || investors.reduce((s, i) => s + i.room_count, 0) || 0
  // BNS売上 = BNS予算グループの最新予算の合計（最新予算がそのまま投資家への請求ベース）
  const bnsSellTotal = useMemo(() => categories.filter(c => c.group_name === 'BNS予算').reduce((s, c) => s + (c.original_budget || 0), 0), [categories])
  // 1口（部屋）あたりの投資額 = BNS売上合計 ÷ 総部屋数（自動計算・手入力不可）
  const unitPrice = totalRooms > 0 ? Math.round(bnsSellTotal / totalRooms) : 0

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) {
    return <Shell projectId={id} active="investors"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const billingFor = (investorId: string, phase: InvestorPhase) => billings.find(b => b.investor_id === investorId && b.phase === phase)

  const totalBillingAll = billings.reduce((s, b) => s + (b.amount || 0), 0)
  const unbilledAll = billings.reduce((s, b) => s + (!b.invoiced ? b.amount : 0), 0)
  const unpaidAll = billings.reduce((s, b) => s + (!b.paid ? b.amount : 0), 0)

  const recalc = async () => {
    setRecalculating(true)
    for (const inv of investors) {
      const ratioEnd = 1 - inv.ratio_start - inv.ratio_mid
      const ratios: Record<InvestorPhase, number> = { '着工': inv.ratio_start, '中間': inv.ratio_mid, '完了': ratioEnd }
      for (const phase of PHASES) {
        // 請求額 = 投資額（税込）× フェーズ配分比率
        const amount = Math.round(inv.investment_amount * ratios[phase])
        const existing = billingFor(inv.id, phase)
        if (existing) {
          await supabase.from('pjb_investor_billings').update({ amount, updated_at: new Date().toISOString() }).eq('id', existing.id)
        } else {
          await supabase.from('pjb_investor_billings').insert({ investor_id: inv.id, phase, amount })
        }
      }
    }
    await logActivity({ projectId: id, action: 'update', entityType: 'investor_billing', entityLabel: '請求額を再計算' })
    setRecalculating(false)
    reload()
  }

  const toggle = async (billing: InvestorBilling | undefined, investorId: string, phase: InvestorPhase, field: 'invoiced' | 'paid') => {
    if (!billing) return
    await supabase.from('pjb_investor_billings').update({ [field]: !billing[field], updated_at: new Date().toISOString() }).eq('id', billing.id)
    reload()
  }

  const updateInvestor = async (inv: Investor, field: keyof Investor, value: string | number) => {
    if (value === inv[field]) return
    await supabase.from('pjb_investors').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', inv.id)
    await logActivity({ projectId: id, action: 'update', entityType: 'investor', entityLabel: `${inv.name} ${String(field)}`, before: inv[field] as string | number, after: value })
    reload()
  }

  const deleteInvestor = async (inv: Investor) => {
    if (!confirm(`「${inv.name}」を削除しますか？\nこの投資家の請求情報もすべて削除されます。`)) return
    const { error: err } = await supabase.from('pjb_investors').delete().eq('id', inv.id)
    if (err) { alert(`削除に失敗しました：${err.message}`); return }
    await logActivity({ projectId: id, action: 'delete', entityType: 'investor', entityLabel: inv.name, before: inv.investment_amount })
    reload()
  }

  const applyUnitPrice = async (inv: Investor) => {
    const amount = unitPrice * inv.room_count
    await updateInvestor(inv, 'investment_amount', amount)
  }

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="investors" onQuickAdded={reload}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
        <KpiCard label="総部屋数" value={`${totalRooms}部屋`} />
        <KpiCard label="請求合計" value={formatYen(totalBillingAll)} />
        <KpiCard label="未請求残り" value={formatYen(unbilledAll)} tone={unbilledAll > 0 ? 'warning' : 'good'} />
        <KpiCard label="未入金残り" value={formatYen(unpaidAll)} tone={unpaidAll > 0 ? 'warning' : 'good'} />
      </div>
      <div className="mb-4">
        <div className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
          <span>1口（部屋）あたりの投資額</span>
          <span className="font-semibold text-slate-900 tabular-nums">{formatYen(unitPrice)}</span>
          <span className="text-slate-400">（BNS売上合計 {formatYen(bnsSellTotal)} ÷ 総部屋数 {totalRooms}）</span>
        </div>
      </div>

      <SectionTitle
        action={
          <div className="flex gap-2">
            <button onClick={recalc} disabled={recalculating || investors.length === 0} className="text-[13px] px-3 py-1 rounded-full border border-slate-200 text-slate-600 disabled:opacity-40">
              {recalculating ? '計算中…' : '請求額を再計算'}
            </button>
            <button onClick={() => setShowNew(true)} className="text-[13px] px-3 py-1 rounded-full bg-blue-600 text-white">＋ 投資家</button>
          </div>
        }
      >
        投資家一覧（総部屋数 {totalRooms} ・ BNS売上合計 {formatYen(bnsSellTotal)}）
      </SectionTitle>

      {investors.length === 0 ? <EmptyState>投資家が登録されていません</EmptyState> : (
        <div className="grid gap-3">
          {investors.map(inv => {
            const ratioEnd = 1 - inv.ratio_start - inv.ratio_mid
            return (
              <div key={inv.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
                  <InlineText value={inv.name} onCommit={v => updateInvestor(inv, 'name', v)} className="text-[15px] font-semibold text-slate-900" />
                  <div className="text-[12.5px] text-slate-400 flex items-center gap-1">
                    <InlineNumber value={inv.room_count} onCommit={v => updateInvestor(inv, 'room_count', v)} width="w-10" />部屋 ・ 投資額
                    <InlineAmount value={inv.investment_amount} onCommit={v => updateInvestor(inv, 'investment_amount', v)} />
                    <button onClick={() => deleteInvestor(inv)} className="text-slate-300 hover:text-rose-500 text-[13px] ml-1" aria-label="削除">✕</button>
                  </div>
                </div>
                {unitPrice > 0 && inv.investment_amount !== unitPrice * inv.room_count && (
                  <div className="text-[12px] text-slate-400 mb-2 -mt-1 flex items-center gap-1.5">
                    1口{formatYen(unitPrice)} × {inv.room_count}口 = {formatYen(unitPrice * inv.room_count)}
                    <button onClick={() => applyUnitPrice(inv)} className="text-blue-700 underline">この金額を反映</button>
                  </div>
                )}
                <div className="text-[12px] text-slate-400 mb-2 flex items-center gap-1">
                  配分比率　着工
                  <InlineNumber
                    value={Math.round(inv.ratio_start * 100)}
                    onCommit={v => v + Math.round(inv.ratio_mid * 100) <= 100 ? updateInvestor(inv, 'ratio_start', v / 100) : alert('着工・中間の比率合計が100%を超えています')}
                    display={v => `${v}%`} width="w-10"
                  />
                  / 中間
                  <InlineNumber
                    value={Math.round(inv.ratio_mid * 100)}
                    onCommit={v => Math.round(inv.ratio_start * 100) + v <= 100 ? updateInvestor(inv, 'ratio_mid', v / 100) : alert('着工・中間の比率合計が100%を超えています')}
                    display={v => `${v}%`} width="w-10"
                  />
                  / 完了 {formatPercent(ratioEnd)}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PHASES.map(phase => {
                    const b = billingFor(inv.id, phase)
                    return (
                      <div key={phase} className="rounded-lg bg-slate-50 px-2.5 py-2">
                        <div className="text-[12px] text-slate-400 mb-0.5">{phase}</div>
                        <div className="text-[13.5px] font-semibold tabular-nums text-slate-900 mb-1.5">{formatYen(b?.amount || 0)}</div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggle(b, inv.id, phase, 'invoiced')}
                            className={`text-[11.5px] px-1.5 py-0.5 rounded-full border ${b?.invoiced ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-slate-400 border-slate-200'}`}
                          >
                            {b?.invoiced ? '請求済' : '未請求'}
                          </button>
                          <button
                            onClick={() => toggle(b, inv.id, phase, 'paid')}
                            className={`text-[11.5px] px-1.5 py-0.5 rounded-full border ${b?.paid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-slate-400 border-slate-200'}`}
                          >
                            {b?.paid ? '入金済' : '未入金'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewInvestorModal
          projectId={id}
          unitPrice={unitPrice}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); reload() }}
        />
      )}
    </Shell>
  )
}

function NewInvestorModal({
  projectId, unitPrice, onClose, onSaved,
}: { projectId: string; unitPrice: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [roomCount, setRoomCount] = useState('')
  const [investment, setInvestment] = useState('')
  const [investmentTouched, setInvestmentTouched] = useState(false)
  const [ratioStart, setRatioStart] = useState('50')
  const [ratioMid, setRatioMid] = useState('30')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleRoomCountChange = (v: string) => {
    setRoomCount(v)
    if (!investmentTouched && unitPrice > 0) {
      setInvestment(String((Number(v) || 0) * unitPrice))
    }
  }

  const submit = async () => {
    if (!name.trim() || !roomCount) { setError('投資家名と部屋数は必須です'); return }
    const rs = Number(ratioStart) / 100
    const rm = Number(ratioMid) / 100
    if (rs + rm > 1) { setError('着工・中間の比率合計が100%を超えています'); return }
    setSaving(true)
    const investmentAmount = Number(investment) || 0
    const { data, error: err } = await supabase.from('pjb_investors').insert({
      project_id: projectId, name: name.trim(), room_count: Number(roomCount) || 0,
      investment_amount: investmentAmount, ratio_start: rs, ratio_mid: rm,
    }).select('id').single()
    if (err || !data) { setSaving(false); setError(`追加に失敗しました：${err?.message || ''}`); return }

    // 追加と同時に、フェーズごとの請求額を計算して登録する
    const ratioEnd = 1 - rs - rm
    const ratios: Record<InvestorPhase, number> = { '着工': rs, '中間': rm, '完了': ratioEnd }
    await supabase.from('pjb_investor_billings').insert(
      PHASES.map(phase => ({ investor_id: data.id, phase, amount: Math.round(investmentAmount * ratios[phase]) }))
    )

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5">
        <div className="text-[15px] font-semibold text-slate-900 mb-4">投資家を追加</div>
        <div className="grid gap-3">
          <label className="grid gap-1"><span className="text-[13px] text-slate-500">投資家名</span>
            <input value={name} onChange={e => setName(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="例）A様" /></label>
          <label className="grid gap-1"><span className="text-[13px] text-slate-500">部屋数（口数）</span>
            <input type="number" value={roomCount} onChange={e => handleRoomCountChange(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" /></label>
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">
              投資額（税込）{unitPrice > 0 && !investmentTouched && '— 1口あたりの投資額から自動計算'}
            </span>
            <MoneyInput
              value={investment}
              onChange={v => { setInvestmentTouched(true); setInvestment(v) }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]"
            />
          </label>
          {unitPrice === 0 && (
            <p className="text-[12px] text-amber-600">「1口あたりの投資額」が未設定のため自動計算されません。投資家一覧の画面上部から設定できます。</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1"><span className="text-[13px] text-slate-500">着工比率（%）</span>
              <input type="number" value={ratioStart} onChange={e => setRatioStart(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" /></label>
            <label className="grid gap-1"><span className="text-[13px] text-slate-500">中間比率（%）</span>
              <input type="number" value={ratioMid} onChange={e => setRatioMid(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" /></label>
          </div>
          <p className="text-[12px] text-slate-400">完了比率は自動的に残りの割合になります</p>
        </div>
        {error && <p className="text-[13.5px] text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">{saving ? '追加中…' : '追加する'}</button>
        </div>
      </div>
    </div>
  )
}
