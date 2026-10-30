import type {
  BudgetCategory, Order, AdditionalWork, VeItem, CategorySummary, Alert, Project, SalesItem,
} from './types'
import { daysUntil, formatYen } from './format'

const ORDERED_STATUSES = new Set(['発注済', '完了', '請求書待ち', '支払待ち', '支払済'])
const PLANNED_STATUSES = new Set(['見積依頼中', '見積受領', '発注待ち'])
const APPROVED_ADDITIONAL_STATUSES = new Set(['承認済', '発注済', '完了'])
const PENDING_ADDITIONAL_STATUSES = new Set(['検討中', '見積待ち', '承認待ち'])

// 着地見込 = 発注済 + 未発注予定 + 追加工事(承認済以降) − 確定VE
export function summarizeCategory(
  category: BudgetCategory,
  orders: Order[],
  additionalWorks: AdditionalWork[],
  veItems: VeItem[],
): CategorySummary {
  const catOrders = orders.filter(o => o.category_id === category.id)
  const catWorks = additionalWorks.filter(w => w.category_id === category.id)
  const catVe = veItems.filter(v => v.category_id === category.id)

  const orderedAmount = catOrders
    .filter(o => ORDERED_STATUSES.has(o.status))
    .reduce((s, o) => s + (o.order_amount || 0), 0)

  const pipelineAmount = catOrders
    .filter(o => PLANNED_STATUSES.has(o.status))
    .reduce((s, o) => s + (o.order_amount || o.estimate_amount || 0), 0)

  // まだ発注として登録されていない予算枠（＝最新予算のうち、発注・見積のどちらにも
  // 紐づいていない残り）。発注の内訳を登録するほど、この「みなし残額」は実額に置き換わっていく。
  // 逆に見積の合計が最新予算をすでに超えている場合は、その実額をそのまま反映する。
  const trackedTotal = catOrders.reduce((s, o) => s + (o.order_amount || o.estimate_amount || 0), 0)
  const untracked = Math.max(category.latest_budget - trackedTotal, 0)
  const unorderedPlanned = pipelineAmount + untracked

  const additionalCost = catWorks
    .filter(w => APPROVED_ADDITIONAL_STATUSES.has(w.status) && w.budget_impact !== '影響なし')
    .reduce((s, w) => s + (w.budget_impact === '減額' ? -w.amount : w.amount), 0)

  // 採用済VEは、最新予算（内訳の合計）を書き換えずに、表示・計算のときに差し引く。
  // 採用・取り消し・削除を何度しても金額がずれず、最新予算が0円でも減額が切り捨てられない。
  const confirmedVe = catVe
    .filter(v => v.status === '採用')
    .reduce((s, v) => s + (v.confirmed_reduction || v.planned_reduction || 0), 0)

  const plannedVe = catVe
    .filter(v => v.status === '検討中' || v.status === '提案中')
    .reduce((s, v) => s + (v.planned_reduction || 0), 0)

  const effectiveBudget = category.latest_budget - confirmedVe
  const landingForecast = orderedAmount + unorderedPlanned + additionalCost - confirmedVe
  const variance = effectiveBudget - landingForecast
  const consumptionRate = effectiveBudget > 0 ? landingForecast / effectiveBudget : 0

  let state: CategorySummary['state'] = 'normal'
  if (effectiveBudget > 0 && landingForecast > effectiveBudget) state = 'danger'
  else if (consumptionRate >= 0.9) state = 'warning'

  return {
    category,
    orderedAmount,
    unorderedPlanned,
    additionalCost,
    confirmedVe,
    plannedVe,
    effectiveBudget,
    landingForecast,
    variance,
    consumptionRate,
    state,
    pendingAdditionalWorkCount: catWorks.filter(w => PENDING_ADDITIONAL_STATUSES.has(w.status)).length,
    undecidedVeCount: catVe.filter(v => v.status === '検討中' || v.status === '提案中').length,
  }
}

// BNS予算の項目の「売上」。売上の内訳（pjb_sales_items）の合計。
// 内訳のテーブルがまだない（パッチ014の前）ときは、従来どおり項目に直接入れた金額を使う
export function categorySales(category: BudgetCategory, salesItems: SalesItem[] | null): number {
  if (salesItems === null) return category.original_budget || 0
  return salesItems.filter(s => s.category_id === category.id).reduce((t, s) => t + (s.amount || 0), 0)
}

// 予実管理のKPI：PJ総予算（手入力）と実行費用（自動）の差が、総予算の±1%以内
export const BUDGET_KPI_RATE = 0.01
export type BudgetGapStatus = 'unset' | 'ok' | 'over' | 'under'
export function budgetGapStatus(totalBudget: number, gap: number): BudgetGapStatus {
  if (!(totalBudget > 0)) return 'unset'
  if (Math.abs(gap / totalBudget) <= BUDGET_KPI_RATE) return 'ok'
  return gap < 0 ? 'over' : 'under'
}

export type ProjectTotals = {
  totalBudget: number        // PJ総予算（手入力・最初に決まった予算）
  executionBudget: number    // 実行費用（自動）
  budgetGap: number          // 総予算 − 実行費用（プラス＝実行費用が総予算より少ない）
  budgetGapRate: number | null
  orderedAmount: number
  unorderedPlanned: number
  landingForecast: number
  remaining: number
  consumptionRate: number
  bnsSell: number
  bnsCost: number
  bnsGrossProfit: number
  grossMargin: number
  targetProfit: number
  profitGap: number
}

export function summarizeProject(
  project: Project,
  categories: BudgetCategory[],
  summaries: CategorySummary[],
  salesItems: SalesItem[] | null = null,
  cashOutTotal = 0,
): ProjectTotals {
  const orderedAmount = summaries.reduce((s, c) => s + c.orderedAmount, 0)
  const unorderedPlanned = summaries.reduce((s, c) => s + c.unorderedPlanned, 0)
  const landingForecast = summaries.reduce((s, c) => s + c.landingForecast, 0)

  const bnsCategories = categories.filter(c => c.group_name === 'BNS予算')
  // BNS原価には、BNS利益・PJ予備費・設計デザイン費用(社内)は含めない
  // （外部への支払いコストではなく、利益や未使用の予備枠のため）
  const bnsCostSummaries = summaries.filter(s => s.category.group_name === 'BNS予算' && s.category.counts_as_cost)
  // BNS売上 = BNS予算グループの「売上」（項目ごとに入力した売上の合計）。
  // 原価は項目の内訳（発注）から積み上がる。実際の請求が一括か複数投資家への分割かはInvestor画面側の按分で決まる
  const bnsSell = bnsCategories.reduce((s, c) => s + categorySales(c, salesItems), 0)
  const bnsCost = bnsCostSummaries.reduce((s, c) => s + c.landingForecast, 0)
  const bnsGrossProfit = bnsSell - bnsCost
  const grossMargin = bnsSell > 0 ? bnsGrossProfit / bnsSell : 0

  // 実行費用（自動）= BNS外予算の実行費用の合計 + BNS予算の原価の合計 + BNS利益 + 設計デザイン費用(社内) + BNSキャッシュ持ち出し
  //   BNS利益・設計デザイン費用(社内)は、原価に含めない項目なので、その項目の売上（＝そのまま利益になる額）を使う
  const externalExecution = summaries.filter(c => c.category.group_name === 'BNS外予算').reduce((s, c) => s + c.effectiveBudget, 0)
  const bnsSalesOf = (name: string) => bnsCategories.filter(c => c.name === name).reduce((s, c) => s + categorySales(c, salesItems), 0)
  const bnsProfitItem = bnsSalesOf('BNS利益')
  const inHouseDesign = bnsSalesOf('設計デザイン費用(社内)')
  const executionBudget = externalExecution + bnsCost + bnsProfitItem + inHouseDesign + cashOutTotal
  // PJ総予算は手入力（最初に決まった予算）。実行費用との差が±1%以内かを予実管理で見る
  const totalBudget = project.total_budget || 0
  const budgetGap = totalBudget - executionBudget
  const budgetGapRate = totalBudget > 0 ? budgetGap / totalBudget : null
  const remaining = executionBudget - landingForecast
  const consumptionRate = executionBudget > 0 ? landingForecast / executionBudget : 0

  return {
    totalBudget,
    executionBudget,
    budgetGap,
    budgetGapRate,
    orderedAmount,
    unorderedPlanned,
    landingForecast,
    remaining,
    consumptionRate,
    bnsSell,
    bnsCost,
    bnsGrossProfit,
    grossMargin,
    targetProfit: project.target_profit,
    profitGap: bnsGrossProfit - project.target_profit,
  }
}

export function buildAlerts(
  categories: BudgetCategory[],
  summaries: CategorySummary[],
  orders: Order[],
  additionalWorks: AdditionalWork[],
  veItems: VeItem[],
  projectHref: string,
): Alert[] {
  const alerts: Alert[] = []

  for (const s of summaries) {
    // BNS予算は項目ごとの予算を持たず、売上・原価・利益で見るため、予算超過・消化率のアラートは出さない
    if (s.category.group_name === 'BNS予算') continue
    if (s.state === 'danger') {
      alerts.push({
        id: `danger-${s.category.id}`,
        severity: 'danger',
        kind: 'DANGER',
        message: `${s.category.name}：${formatYen(Math.abs(s.variance))}予算超過`,
        href: `${projectHref}/budget`,
      })
    } else if (s.state === 'warning') {
      alerts.push({
        id: `warning-${s.category.id}`,
        severity: 'warning',
        kind: 'WARNING',
        message: `${s.category.name}：予算消化率${Math.round(s.consumptionRate * 100)}%`,
        href: `${projectHref}/budget`,
      })
    }
  }

  const unreceived = orders.filter(o => !o.invoice_received && ORDERED_STATUSES.has(o.status))
  const vendorGroups = new Map<string, number>()
  for (const o of unreceived) {
    const key = o.vendor_id || o.title
    vendorGroups.set(key, (vendorGroups.get(key) || 0) + 1)
  }
  if (unreceived.length > 0) {
    alerts.push({
      id: 'invoice-missing',
      severity: 'info',
      kind: 'INVOICE',
      message: `請求書未受領：${unreceived.length}件`,
      href: `${projectHref}/payments`,
    })
  }

  const overduePayments = orders.filter(o => !o.paid && o.payment_scheduled_at && (daysUntil(o.payment_scheduled_at) ?? 0) < 0)
  if (overduePayments.length > 0) {
    alerts.push({
      id: 'payment-overdue',
      severity: 'danger',
      kind: 'PAYMENT',
      message: `支払期限超過：${overduePayments.length}件`,
      href: `${projectHref}/payments`,
    })
  }

  const dueSoon = orders.filter(o => !o.paid && o.payment_scheduled_at && (daysUntil(o.payment_scheduled_at) ?? 99) >= 0 && (daysUntil(o.payment_scheduled_at) ?? 99) <= 7)
  if (dueSoon.length > 0) {
    alerts.push({
      id: 'payment-due-soon',
      severity: 'warning',
      kind: 'PAYMENT',
      message: `支払期限7日以内：${dueSoon.length}件`,
      href: `${projectHref}/payments`,
    })
  }

  const unordered = orders.filter(o => PLANNED_STATUSES.has(o.status))
  if (unordered.length > 0) {
    alerts.push({
      id: 'unordered',
      severity: 'info',
      kind: 'ORDER',
      message: `未発注：${unordered.length}件（${formatYen(unordered.reduce((s, o) => s + (o.order_amount || o.estimate_amount || 0), 0))}）`,
      href: `${projectHref}/orders`,
    })
  }

  const pendingApproval = additionalWorks.filter(w => w.status === '承認待ち')
  if (pendingApproval.length > 0) {
    alerts.push({
      id: 've-additional-pending',
      severity: 'warning',
      kind: 'COST',
      message: `追加工事 承認待ち：${pendingApproval.length}件`,
      href: `${projectHref}/cost-ve`,
    })
  }

  const undecidedVe = veItems.filter(v => v.status === '検討中' || v.status === '提案中')
  if (undecidedVe.length > 0) {
    alerts.push({
      id: 've-undecided',
      severity: 'info',
      kind: 'VE',
      message: `VE未確定：${undecidedVe.length}件`,
      href: `${projectHref}/cost-ve`,
    })
  }

  const order = { danger: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}
