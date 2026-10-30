'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/pjb/activity'
import { BUDGET_KPI_RATE, budgetGapStatus, hasBudgetKpi, type ProjectTotals } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import type { Project } from '@/lib/pjb/types'
import { KpiCard, EditableKpiCard } from './ui'

// 予実管理のKPI：PJ総予算（手入力）／実行費用（自動）／差額／差率（±1%以内が目標）
export default function PjBudgetKpis({ project, totals, onChanged }: { project: Project; totals: ProjectTotals; onChanged: () => void }) {
  const showGap = hasBudgetKpi(project.business)   // ±1%の予実判定は illi Stays & Hotels だけ
  const status = budgetGapStatus(totals.totalBudget, totals.budgetGap)
  const tone = status === 'ok' ? 'good' : status === 'over' ? 'danger' : status === 'under' ? 'warning' : 'default'
  const verdict = {
    unset: 'PJ総予算を入力すると判定します',
    ok: `予実1%以内（目標±${BUDGET_KPI_RATE * 100}%）`,
    over: `実行費用が総予算を${BUDGET_KPI_RATE * 100}%超えています`,
    under: `実行費用が総予算より${BUDGET_KPI_RATE * 100}%超、少ないです`,
  }[status]

  const save = async (v: number) => {
    const { error } = await supabase.from('pjb_projects').update({ total_budget: v, updated_at: new Date().toISOString() }).eq('id', project.id)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    await logActivity({ projectId: project.id, action: 'update', entityType: 'project', entityLabel: 'PJ総予算', before: String(project.total_budget ?? 0), after: String(v) })
    onChanged()
  }

  // PJ総予算のコメント（経緯・根拠など）。空にして消すこともできる
  const [note, setNote] = useState(project.notes ?? '')
  useEffect(() => { setNote(project.notes ?? '') }, [project.notes])
  const saveNote = async () => {
    const next = note.trim()
    if (next === (project.notes ?? '').trim()) return
    const { error } = await supabase.from('pjb_projects').update({ notes: next || null, updated_at: new Date().toISOString() }).eq('id', project.id)
    if (error) { alert(`コメントの保存に失敗しました：${error.message}`); return }
    await logActivity({ projectId: project.id, action: 'update', entityType: 'project', entityLabel: 'PJ総予算のコメント', before: project.notes ?? '', after: next })
    onChanged()
  }

  return (
    <>
      <EditableKpiCard
        label="PJ総予算（手入力）" value={totals.totalBudget} onCommit={save} formulaKey={`project:${project.id}:total`}
        sub="最初に決まった予算を入力します（タップして編集）"
      />
      <KpiCard label="実行費用（自動）" value={formatYen(totals.executionBudget)} sub="BNS外予算の実行費用 ＋ BNS予算の原価 ＋ BNS利益 ＋ 設計デザイン費用(社内)" />
      {showGap && <KpiCard label="予実の差額（総予算−実行費用）" value={status === 'unset' ? '—' : formatSignedYen(totals.budgetGap)} tone={tone} />}
      {showGap && <KpiCard label="予実の差率（目標 ±1%以内）" value={totals.budgetGapRate === null ? '—' : formatPercent(totals.budgetGapRate, 2)} tone={tone} sub={verdict} />}
      <label className="col-span-2 sm:col-span-4 rounded-xl border border-slate-200 bg-white px-4 py-3 grid gap-1">
        <span className="text-[13px] text-slate-500">PJ総予算のコメント <span className="text-slate-400">（経緯・根拠・変更理由など。入力欄を出たら保存されます）</span></span>
        <textarea
          value={note} onChange={e => setNote(e.target.value)} onBlur={saveNote} rows={2} placeholder="例：2026/10 オーナー承認の予算。設計変更で+300万の合意あり"
          className="w-full resize-y border border-slate-200 rounded-lg px-3 py-2 text-[14px] bg-white"
        />
      </label>
    </>
  )
}
