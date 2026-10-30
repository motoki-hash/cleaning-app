'use client'

import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/pjb/activity'
import { BUDGET_KPI_RATE, budgetGapStatus, type ProjectTotals } from '@/lib/pjb/calc'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import type { Project } from '@/lib/pjb/types'
import { KpiCard, EditableKpiCard } from './ui'

// 予実管理のKPI：PJ総予算（手入力）／実行費用（自動）／差額／差率（±1%以内が目標）
export default function PjBudgetKpis({ project, totals, onChanged }: { project: Project; totals: ProjectTotals; onChanged: () => void }) {
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

  return (
    <>
      <EditableKpiCard
        label="PJ総予算（手入力）" value={totals.totalBudget} onCommit={save} formulaKey={`project:${project.id}:total`}
        sub="最初に決まった予算を入力します（タップして編集）"
      />
      <KpiCard label="実行費用（自動）" value={formatYen(totals.executionBudget)} sub="BNS外予算の当初予算合計 ＋ BNS予算の売上合計 ＋ BNSキャッシュ持ち出し" />
      <KpiCard label="予実の差額（総予算−実行費用）" value={status === 'unset' ? '—' : formatSignedYen(totals.budgetGap)} tone={tone} />
      <KpiCard label="予実の差率（目標 ±1%以内）" value={totals.budgetGapRate === null ? '—' : formatPercent(totals.budgetGapRate, 2)} tone={tone} sub={verdict} />
    </>
  )
}
