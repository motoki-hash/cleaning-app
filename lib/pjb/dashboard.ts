// ダッシュボード（全案件の集計）の計算。案件一覧とダッシュボードで同じ判定を使う。
import { BUSINESSES, UNCLASSIFIED } from './constants'
import { fiscalYearOf, currentFiscal } from './fiscal'
import { BUDGET_KPI_RATE, BUDGET_KPI_BUSINESS, budgetGapStatus, hasBudgetKpi } from './calc'
import type { ProjectCardData } from './useProjectCards'

export type Scope = 'all' | 'active' | 'fy'

// 予算超過の判定。期のある案件は、期ごとではなく全期を合計して（PJ全体で）超過しているかで見る
export function makeIsOver(cards: ProjectCardData[]) {
  const groupRemaining = new Map<string, number>()
  for (const c of cards) {
    const g = c.project.group_id
    if (g) groupRemaining.set(g, (groupRemaining.get(g) ?? 0) + c.remaining)
  }
  return (c: ProjectCardData) => (c.project.group_id ? (groupRemaining.get(c.project.group_id) ?? 0) : c.remaining) < 0
}

// 上の4つのタイル（進行中・要対応あり・予算超過・完了の件数）
export function statusSummary(cards: ProjectCardData[]) {
  const isOver = makeIsOver(cards)
  const openCards = cards.filter(c => c.project.status !== '完了')
  return {
    active: cards.filter(c => c.project.status === '進行中').length,
    budget: cards.filter(c => c.project.status === '進行中').reduce((s, c) => s + c.totalBudget, 0),
    alert: openCards.filter(c => c.alertCount > 0).length,
    // 期のある案件は、全期で1件と数える
    over: new Set(openCards.filter(isOver).map(c => c.project.group_id || c.project.id)).size,
    done: cards.filter(c => c.project.status === '完了').length,
  }
}

// 集計の対象。今期売上＝売上計上月が今期（4月始まり）の案件。期ごとに売上月が違うので、期（1期・2期…）単位で判定する
export function poolOf(cards: ProjectCardData[], scope: Scope) {
  const nowFy = currentFiscal().year
  return scope === 'active' ? cards.filter(c => c.project.status === '進行中')
    : scope === 'fy' ? cards.filter(c => fiscalYearOf(c.project.sales_month) === nowFy) : cards
}

// 予実管理のKPIは「PJ総予算（手入力）と実行費用（自動）の差が、総予算の±1%以内」。
// 対象は illi Stays & Hotels の案件だけ。総予算が未入力（0）の案件は、判定の対象にしない
export function aggregate(pool: ProjectCardData[]) {
  const rated = pool.filter(c => hasBudgetKpi(c.business) && c.totalBudget > 0)
  const totalBudget = rated.reduce((s, c) => s + c.totalBudget, 0)
  const execution = rated.reduce((s, c) => s + c.executionBudget, 0)
  const gap = rated.reduce((s, c) => s + c.budgetGap, 0)
  const landing = pool.reduce((s, c) => s + c.landingForecast, 0)
  const remaining = pool.reduce((s, c) => s + c.remaining, 0)
  const sell = pool.reduce((s, c) => s + c.bnsSell, 0)
  const cost = pool.reduce((s, c) => s + c.bnsCost, 0)
  const profit = pool.reduce((s, c) => s + c.grossProfit, 0)
  const rate = totalBudget > 0 ? gap / totalBudget : 0
  return {
    totalBudget, execution, gap, landing, remaining, sell, cost, profit, rate,
    margin: sell > 0 ? profit / sell : 0,
    achieved: rated.filter(c => budgetGapStatus(c.totalBudget, c.budgetGap) === 'ok').length,
    ratedCount: rated.length,
    unsetCount: pool.filter(c => hasBudgetKpi(c.business)).length - rated.length,
    rateTone: (totalBudget <= 0 ? 'default' : Math.abs(rate) <= BUDGET_KPI_RATE ? 'good' : rate < 0 ? 'danger' : 'warning') as 'default' | 'good' | 'danger' | 'warning',
  }
}

// 事業別の売上・原価・利益
export function businessStats(pool: ProjectCardData[]) {
  return [...BUSINESSES, UNCLASSIFIED]
    .map(name => {
      const list = pool.filter(c => c.business === name)
      const sell = list.reduce((s, c) => s + c.bnsSell, 0)
      const cost = list.reduce((s, c) => s + c.bnsCost, 0)
      const profit = list.reduce((s, c) => s + c.grossProfit, 0)
      const ratedList = list.filter(c => hasBudgetKpi(c.business) && c.totalBudget > 0)
      const budget = ratedList.reduce((s, c) => s + c.totalBudget, 0)
      const gap = ratedList.reduce((s, c) => s + c.budgetGap, 0)
      return { name, count: list.length, sell, cost, profit, margin: sell > 0 ? profit / sell : 0, budget, rate: budget > 0 ? gap / budget : 0, kpi: name === BUDGET_KPI_BUSINESS }
    })
    .filter(b => b.count > 0 || b.name !== UNCLASSIFIED)
}
