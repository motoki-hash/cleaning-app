import type { BudgetGroup } from './types'

// 新規PJ作成時のひな形カテゴリー（Excelの費目構成を踏襲）
// counts_as_cost: false の3項目（設計デザイン費用(社内)・BNS利益・PJ予備費）は
// 「BNS原価」の集計から除外する（旧Excelでも同様に除外されていた＝利益や未使用の予備費であり、
// 外部への支払いコストではないため）
export const DEFAULT_CATEGORIES: { group_name: BudgetGroup; name: string; sort_order: number; counts_as_cost: boolean }[] = [
  { group_name: 'BNS外予算', name: '内装工事', sort_order: 0, counts_as_cost: true },
  { group_name: 'BNS外予算', name: '解体工事', sort_order: 1, counts_as_cost: true },
  { group_name: 'BNS外予算', name: '追加工事', sort_order: 2, counts_as_cost: true },
  { group_name: 'BNS外予算', name: '設計デザイン費用(社外)', sort_order: 3, counts_as_cost: true },
  { group_name: 'BNS外予算', name: 'PJ予備費', sort_order: 4, counts_as_cost: true },
  { group_name: 'BNS予算', name: 'FFE・OSE費用', sort_order: 5, counts_as_cost: true },
  { group_name: 'BNS予算', name: '追加工事', sort_order: 6, counts_as_cost: true },
  { group_name: 'BNS予算', name: '設計デザイン費用(社外)', sort_order: 7, counts_as_cost: true },
  { group_name: 'BNS予算', name: '設計デザイン費用(社内)', sort_order: 8, counts_as_cost: false },
  { group_name: 'BNS予算', name: 'BNS利益', sort_order: 9, counts_as_cost: false },
  { group_name: 'BNS予算', name: 'PJ予備費', sort_order: 10, counts_as_cost: false },
  { group_name: 'BNS予算', name: '分離発注', sort_order: 11, counts_as_cost: true },
  { group_name: 'BNS予算', name: 'その他費用', sort_order: 12, counts_as_cost: true },
]

export const STATUS_COLORS: Record<string, string> = {
  normal: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  danger: 'text-rose-700 bg-rose-50 border-rose-200',
}

// 始動している事業（案件登録のときに選ぶ）。増やすときは、ここに足す
export const BUSINESSES = ['illi Stays & Hotels', 'Kyo Residence', 'Setup Office'] as const
export const UNCLASSIFIED = '未分類'

// 以前は illi Stays と illi Hotels を分けていた。DBの値が古いままでも、ひとつの事業として扱う
export const normalizeBusiness = (b: string | null | undefined): string =>
  !b ? UNCLASSIFIED : b === 'illi Stays' || b === 'illi Hotels' ? 'illi Stays & Hotels' : b

// 案件の担当者の欄（ラベルと、保存する項目名）
export const STAFF_FIELDS = [
  { key: 'pm_name', label: '進行管理', kind: 'person' },
  { key: 'qa_name', label: '品質管理', kind: 'person' },
  { key: 'design_company', label: '設計会社', kind: 'company' },
  { key: 'contractor_company', label: '施工会社', kind: 'company' },
  { key: 'client_name', label: 'クライアント', kind: 'company' },
] as const
export type StaffKey = typeof STAFF_FIELDS[number]['key']
