// PJ予算管理アプリ Phase 1 — 型定義

export type ProjectStatus = '進行中' | '完了' | '保留'

export type Project = {
  id: string
  name: string
  total_budget: number
  target_profit: number
  room_count: number
  unit_price: number
  status: ProjectStatus
  started_at: string | null
  completed_at: string | null
  notes: string | null
  client_name?: string | null
  operator_name?: string | null
  address?: string | null
  schedule_base_date?: string | null
  schedule_open_week?: number | null
  open_date?: string | null
  preopen_start_date?: string | null
  schedule_notes?: string | null
  zero_open_week?: number | null
  bns_budget_sales?: number | null
  bns_budget_cost?: number | null
  bns_budget_profit?: number | null
  schedule_months?: number | null
  zero_notes?: string | null
  created_at: string
  updated_at: string
}

export type ScheduleKind = 'zero' | 'rough' | 'preopen'

export type ScheduleTask = {
  id: string
  project_id: string
  kind: ScheduleKind
  sort_order: number
  category: string
  name: string
  assignee: string
}

export type ScheduleBar = {
  id: string
  task_id: string
  project_id: string
  kind: ScheduleKind
  start_week: number | null
  length_weeks: number | null
  start_date: string | null
  end_date: string | null
  label: string
  color: string
}

export type BudgetGroup = 'BNS外予算' | 'BNS予算'

export type BudgetCategory = {
  id: string
  project_id: string
  group_name: BudgetGroup
  name: string
  original_budget: number
  latest_budget: number
  sell_amount: number
  counts_as_cost: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type Vendor = {
  id: string
  name: string
  contact: string | null
  notes: string | null
  created_at: string
}

export const ORDER_STATUSES = [
  '見積依頼中', '見積受領', '発注待ち', '発注済',
  '完了', '請求書待ち', '支払待ち', '支払済',
] as const
export type OrderStatus = typeof ORDER_STATUSES[number]

export type Order = {
  id: string
  project_id: string
  category_id: string
  vendor_id: string | null
  title: string
  estimate_amount: number
  order_amount: number
  status: OrderStatus
  estimated_at: string | null
  ordered_at: string | null
  delivered_at: string | null
  invoice_received: boolean
  invoice_received_at: string | null
  invoice_due_date: string | null
  payment_scheduled_at: string | null
  paid: boolean
  paid_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PoLineItem = {
  content: string
  reducedTax: boolean
  qty: number
  unit: string
  unitPrice: number
  taxRate: 0.1 | 0.08
}

export type PurchaseOrderDoc = {
  id: string
  order_id: string
  project_id: string
  quote_number: string | null
  issue_date: string | null
  vendor_zip: string | null
  vendor_address: string | null
  issuer_name: string | null
  issuer_zip: string | null
  issuer_address: string | null
  issuer_tel: string | null
  issuer_email: string | null
  issuer_contact: string | null
  delivery_date: string | null
  delivery_place: string | null
  notes: string | null
  line_items: PoLineItem[]
  subtotal: number
  tax_amount: number
  total_amount: number
  status: 'draft' | 'issued'
  created_at: string
  updated_at: string
}

export const ADDITIONAL_WORK_STATUSES = [
  '検討中', '見積待ち', '承認待ち', '承認済', '発注済', '完了', '却下',
] as const
export type AdditionalWorkStatus = typeof ADDITIONAL_WORK_STATUSES[number]

export type AdditionalWork = {
  id: string
  project_id: string
  category_id: string
  vendor_id: string | null
  title: string
  content: string | null
  amount: number
  occurred_on: string | null
  status: AdditionalWorkStatus
  budget_impact: '増額' | '減額' | '影響なし'
  estimate_file_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const VE_STATUSES = ['検討中', '提案中', '採用', '不採用'] as const
export type VeStatus = typeof VE_STATUSES[number]

export type VeItem = {
  id: string
  project_id: string
  category_id: string | null
  content: string
  target_item: string | null
  planned_reduction: number
  confirmed_reduction: number
  status: VeStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CostChange = {
  id: string
  category_id: string
  field_name: string
  before_amount: number | null
  after_amount: number | null
  reason: string | null
  changed_by: string | null
  changed_at: string
}

export type Investor = {
  id: string
  project_id: string
  name: string
  room_count: number
  investment_amount: number
  ratio_start: number
  ratio_mid: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type InvestorPhase = '着工' | '中間' | '完了'

export type InvestorBilling = {
  id: string
  investor_id: string
  phase: InvestorPhase
  amount: number
  invoiced: boolean
  invoiced_at: string | null
  paid: boolean
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ActivityLog = {
  id: string
  project_id: string
  user_email: string | null
  action: string
  entity_type: string
  entity_label: string | null
  before_value: string | null
  after_value: string | null
  created_at: string
}

export type CategorySummary = {
  category: BudgetCategory
  orderedAmount: number
  unorderedPlanned: number
  additionalCost: number
  confirmedVe: number
  plannedVe: number
  landingForecast: number
  variance: number
  consumptionRate: number
  state: 'normal' | 'warning' | 'danger'
  pendingAdditionalWorkCount: number
  undecidedVeCount: number
}

export type Alert = {
  id: string
  severity: 'warning' | 'danger' | 'info'
  kind: string
  message: string
  href?: string
}
