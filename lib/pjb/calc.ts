import type {
  BudgetCategory, Order, AdditionalWork, VeItem, CategorySummary, Alert, Project,
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

  // 採用済VEは、確定した時点でカテゴリーの最新予算そのものを直接減額する運用にしたため
  // （内訳・追加工事と同じ「最新予算を直接動かす」方式）、着地見込の計算には二重計上を避けるため含めない。
  // confirmedVe/plannedVeはCost・VE画面での表示・アラート判定用に算出だけしておく。
  const confirmedVe = catVe
    .filter(v => v.status === '採用')
    .reduce((s, v) => s + (v.confirmed_reduction || v.planned_reduction || 0), 0)

  const plannedVe = catVe
    .filter(v => v.status === '検討中' || v.status === '提案中')
    .reduce((s, v) => s + (v.planned_reduction || 0), 0)

  const landingForecast = orderedAmount + unorderedPlanned + additionalCost
  const variance = category.latest_budget - landingForecast
  const consumptionRate = category.latest_budget > 0 ? landingForecast / category.latest_budget : 0

  let state: CategorySummary['state'] = 'normal'
  if (category.latest_budget > 0 && landingForecast > category.latest_budget) state = 'danger'
  else if (consumptionRate >= 0.9) state = 'warning'

  return {
    category,
    orderedAmount,
    unorderedPlanned,
    additionalCost,
    confirmedVe,
    plannedVe,
    landingForecast,
    variance,
    consumptionRate,
    state,
    pendingAdditionalWorkCount: catWorks.filter(w => PENDING_ADDITIONAL_STATUSES.has(w.status)).length,
    undecidedVeCount: catVe.filter(v => v.status === '検討中' || v.status === '提案中').length,
  }
}

export type ProjectTotals = {
  totalBudget: number
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
): ProjectTotals {
  const orderedAmount = summaries.reduce((s, c) => s + c.orderedAmount, 0)
  const unorderedPlanned = summaries.reduce((s, c) => s + c.unorderedPlanned, 0)
  const landingForecast = summaries.reduce((s, c) => s + c.landingForecast, 0)
  const remaining = project.total_budget - landingForecast
  const consumptionRate = project.total_budget > 0 ? landingForecast / project.total_budget : 0

  const bnsCategories = categories.filter(c => c.group_name === 'BNS予算')
  // BNS原価には、BNS利益・PJ予備費・設計デザイン費用(社内)は含めない
  // （外部への支払いコストではなく、利益や未使用の予備枠のため）
  const bnsCostSummaries = summaries.filter(s => s.category.group_name === 'BNS予算' && s.category.counts_as_cost)
  // BNS売上 = BNS予算グループの「売上」（項目ごとに入力した売上の合計）。
  // 原価は項目の内訳（発注）から積み上がる。実際の請求が一括か複数投資家への分割かはInvestor画面側の按分で決まる
  const bnsSell = bnsCategories.reduce((s, c) => s + (c.original_budget || 0), 0)
  const bnsCost = bnsCostSummaries.reduce((s, c) => s + c.landingForecast, 0)
  const bnsGrossProfit = bnsSell - bnsCost
  const grossMargin = bnsSell > 0 ? bnsGrossProfit / bnsSell : 0

  return {
    totalBudget: project.total_budget,
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
