import { supabase } from '@/lib/supabase'
import { findOrCreateVendor } from './useProjectData'
import { logActivity } from './activity'
import { applyBudgetDelta } from './budget'
import { counted, exclOf, groupOf, lineIncl, summarize, type FfeItem } from './ffe'

// FFEの一覧 → 予実管理（BNS予算「FFE・OSE費用」）へ反映する。
//   売上：BNS手配FFEの区分ごとの税別合計（キャンセルを除く）
//   原価：BNS手配のうち「発注済」「納品済」の品目を、購入先ごとに税別で合計（発注として入る）
// FFEから入れた行は、名前の先頭を「FFE｜」にして見分ける（押すたびに、この行だけを作り直す）
export const FFE_TITLE_PREFIX = 'FFE｜'
export const FFE_BUDGET_CATEGORY = { group: 'BNS予算', name: 'FFE・OSE費用' } as const
const ADVANCED = new Set(['請求書待ち', '支払待ち', '支払済'])   // 支払いの手続きが進んだ発注は、ステータスを戻さない

export type PlanSales = { title: string; amount: number; count: number }
export type PlanOrder = { vendor: string; title: string; amount: number; status: '発注済' | '完了'; count: number; orderedAt: string | null }

export function planFfeBudget(items: FfeItem[]): { sales: PlanSales[]; orders: PlanOrder[]; salesTotal: number; ordersTotal: number } {
  const sales = summarize(items).categories
    .filter(c => c.excl !== 0)
    .map(c => ({ title: `${FFE_TITLE_PREFIX}${c.category}`, amount: c.excl, count: c.count }))

  const byVendor = new Map<string, { amount: number; count: number; delivered: number; orderedAt: string | null }>()
  for (const it of items) {
    if (groupOf(it) !== 'bns' || !counted(it)) continue
    if (it.status !== '発注済' && it.status !== '納品済') continue
    const key = it.vendor.trim()
    const cur = byVendor.get(key) ?? { amount: 0, count: 0, delivered: 0, orderedAt: null }
    cur.amount += exclOf(lineIncl(it))
    cur.count += 1
    if (it.status === '納品済') cur.delivered += 1
    if (it.ordered_at && (!cur.orderedAt || it.ordered_at < cur.orderedAt)) cur.orderedAt = it.ordered_at
    byVendor.set(key, cur)
  }
  const orders: PlanOrder[] = Array.from(byVendor.entries())
    .filter(([, v]) => v.amount !== 0)
    .map(([vendor, v]) => ({
      vendor, title: `${FFE_TITLE_PREFIX}${vendor || '購入先未設定'}`, amount: v.amount, count: v.count,
      status: v.delivered === v.count ? '完了' as const : '発注済' as const, orderedAt: v.orderedAt,
    }))
    .sort((a, b) => b.amount - a.amount)
  return { sales, orders, salesTotal: sales.reduce((t, s) => t + s.amount, 0), ordersTotal: orders.reduce((t, o) => t + o.amount, 0) }
}

type SalesRow = { id: string; title: string; amount: number }
type OrderRow = { id: string; title: string; order_amount: number; status: string }
export type BudgetState = { categoryId: string | null; sales: SalesRow[]; orders: OrderRow[]; salesTable: boolean }

export async function loadFfeBudgetState(projectId: string): Promise<BudgetState> {
  const { data: cat } = await supabase.from('pjb_budget_categories').select('id')
    .eq('project_id', projectId).eq('group_name', FFE_BUDGET_CATEGORY.group).eq('name', FFE_BUDGET_CATEGORY.name).maybeSingle()
  if (!cat) return { categoryId: null, sales: [], orders: [], salesTable: true }
  const [s, o] = await Promise.all([
    supabase.from('pjb_sales_items').select('id,title,amount').eq('category_id', cat.id).order('created_at'),
    supabase.from('pjb_orders').select('id,title,order_amount,status').eq('category_id', cat.id).order('created_at'),
  ])
  return {
    categoryId: cat.id as string,
    sales: s.error ? [] : ((s.data || []) as SalesRow[]).map(r => ({ ...r, amount: Number(r.amount) })),
    orders: ((o.data || []) as OrderRow[]).map(r => ({ ...r, order_amount: Number(r.order_amount) })),
    salesTable: !s.error,
  }
}

const isFfe = (title: string) => title.startsWith(FFE_TITLE_PREFIX)

// 予実管理へ反映する。うまくいったら null、だめなら理由を返す
export async function applyFfeBudget(projectId: string, items: FfeItem[]): Promise<string | null> {
  const state = await loadFfeBudgetState(projectId)
  if (!state.categoryId) return '予実管理に、「BNS予算」の「FFE・OSE費用」の項目が見つかりません。'
  if (!state.salesTable) return '売上の内訳のテーブルがまだありません（パッチ014）。'
  const categoryId = state.categoryId
  const plan = planFfeBudget(items)
  const now = new Date().toISOString()

  // ---- 売上 ----
  const salesByTitle = new Map(state.sales.filter(r => isFfe(r.title)).map(r => [r.title, r]))
  const wanted = new Set(plan.sales.map(s => s.title))
  // 手入力の売上（「FFE発注費用」など）と、もう要らないFFEの行は消す
  const removeSales = state.sales.filter(r => !isFfe(r.title) || !wanted.has(r.title)).map(r => r.id)
  if (removeSales.length) {
    const r = await supabase.from('pjb_sales_items').delete().in('id', removeSales)
    if (r.error) return `売上の入れ替えに失敗しました：${r.error.message}`
  }
  for (const s of plan.sales) {
    const cur = salesByTitle.get(s.title)
    if (cur) {
      if (cur.amount !== s.amount) {
        const r = await supabase.from('pjb_sales_items').update({ amount: s.amount, updated_at: now }).eq('id', cur.id)
        if (r.error) return `売上の更新に失敗しました：${r.error.message}`
      }
    } else {
      const r = await supabase.from('pjb_sales_items').insert({ project_id: projectId, category_id: categoryId, title: s.title, amount: s.amount })
      if (r.error) return `売上の追加に失敗しました：${r.error.message}`
    }
  }

  // ---- 原価（発注）----
  const ordersByTitle = new Map(state.orders.filter(r => isFfe(r.title)).map(r => [r.title, r]))
  const planTitles = new Set(plan.orders.map(o => o.title))
  const oldTotal = state.orders.filter(r => isFfe(r.title)).reduce((t, r) => t + r.order_amount, 0)
  let newTotal = 0
  for (const o of plan.orders) {
    const vendorId = o.vendor ? await findOrCreateVendor(o.vendor) : null
    const cur = ordersByTitle.get(o.title)
    if (cur) {
      const r = await supabase.from('pjb_orders').update({
        order_amount: o.amount, estimate_amount: o.amount, vendor_id: vendorId, ordered_at: o.orderedAt,
        ...(ADVANCED.has(cur.status) ? {} : { status: o.status }), updated_at: now,
      }).eq('id', cur.id)
      if (r.error) return `発注の更新に失敗しました（${o.title}）：${r.error.message}`
    } else {
      const r = await supabase.from('pjb_orders').insert({
        project_id: projectId, category_id: categoryId, vendor_id: vendorId, title: o.title,
        estimate_amount: o.amount, order_amount: o.amount, status: o.status, ordered_at: o.orderedAt,
      })
      if (r.error) return `発注の追加に失敗しました（${o.title}）：${r.error.message}`
    }
    newTotal += o.amount
  }
  // もうFFEにない購入先の発注は消す。ただし、請求・支払いが進んだものは、消さずに残す
  for (const cur of state.orders.filter(r => isFfe(r.title) && !planTitles.has(r.title))) {
    if (ADVANCED.has(cur.status)) { newTotal += cur.order_amount; continue }
    const r = await supabase.from('pjb_orders').delete().eq('id', cur.id)
    if (r.error) return `発注の削除に失敗しました（${cur.title}）：${r.error.message}`
  }

  // 最新予算は、発注の内訳の合計に合わせる（ほかの画面の発注と同じ扱い）
  if (newTotal !== oldTotal) {
    const r = await applyBudgetDelta({
      categoryId, projectId, delta: newTotal - oldTotal, reason: 'FFEから予実管理へ反映', entityLabel: `${FFE_BUDGET_CATEGORY.name} 最新予算`,
    })
    if (r.error) return `最新予算の更新に失敗しました：${r.error}`
  }
  await logActivity({
    projectId, action: 'update', entityType: 'sales_item', entityLabel: 'FFE → 予実管理へ反映（売上・原価）',
    before: state.sales.reduce((t, r) => t + r.amount, 0), after: plan.salesTotal,
  })
  return null
}
