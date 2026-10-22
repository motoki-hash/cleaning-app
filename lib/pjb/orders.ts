import { supabase } from '@/lib/supabase'
import { logActivity } from './activity'
import { applyBudgetDelta } from './budget'
import type { Order } from './types'

// 発注（内訳）関連の操作を1箇所に集約。
// Budget画面のカテゴリー内訳・Orders画面・クイック入力のどこから呼んでも
// 同じロジックで最新予算への反映・履歴記録を行う。

export async function createOrder(params: {
  projectId: string
  categoryId: string
  categoryName?: string
  title: string
  amount: number
  vendorId?: string | null
  date?: string | null
}): Promise<{ error?: string }> {
  const { error: insertErr } = await supabase.from('pjb_orders').insert({
    project_id: params.projectId, category_id: params.categoryId, vendor_id: params.vendorId || null,
    title: params.title, estimate_amount: params.amount, order_amount: params.amount,
    status: '見積依頼中', estimated_at: params.date || null,
  })
  if (insertErr) return { error: insertErr.message }

  const { error: budgetErr } = await applyBudgetDelta({
    categoryId: params.categoryId, projectId: params.projectId, delta: params.amount,
    reason: `内訳追加：${params.title}`, entityLabel: `${params.categoryName || ''} 最新予算`,
  })
  await logActivity({ projectId: params.projectId, action: 'create', entityType: 'order', entityLabel: params.title, after: params.amount })
  return budgetErr ? { error: budgetErr } : {}
}

export async function updateOrderAmount(order: Order, newAmount: number, projectId: string, categoryName?: string) {
  const oldAmount = order.order_amount || order.estimate_amount || 0
  const delta = newAmount - oldAmount
  await supabase.from('pjb_orders').update({
    order_amount: newAmount, estimate_amount: newAmount, updated_at: new Date().toISOString(),
  }).eq('id', order.id)
  await applyBudgetDelta({
    categoryId: order.category_id, projectId, delta, reason: `内訳金額の修正：${order.title}`,
    entityLabel: `${categoryName || ''} 最新予算`,
  })
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} 金額`, before: oldAmount, after: newAmount })
}

export async function updateOrderTitle(order: Order, newTitle: string, projectId: string) {
  await supabase.from('pjb_orders').update({ title: newTitle, updated_at: new Date().toISOString() }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: '工事項目名の変更', before: order.title, after: newTitle })
}

export async function updateOrderVendor(order: Order, vendorId: string | null, vendorLabel: string, projectId: string) {
  await supabase.from('pjb_orders').update({ vendor_id: vendorId, updated_at: new Date().toISOString() }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} 業者`, after: vendorLabel })
}

export async function updateOrderStatus(order: Order, status: string, projectId: string) {
  const today = new Date().toISOString().slice(0, 10)
  // プルダウンで直接「支払済」「発注済」を選んだ場合も、専用ボタン（支払済みにする／発注済みにする）
  // と同じように付随するフラグ・日付を必ず一緒に更新する（片方だけ更新されて状態が食い違うのを防ぐ）
  const extra: Partial<Order> =
    status === '支払済' ? { paid: true, paid_at: order.paid_at || today }
    : status === '発注済' ? { ordered_at: order.ordered_at || today }
    : {}
  await supabase.from('pjb_orders').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} ステータス`, before: order.status, after: status })
}

export async function markOrderPlaced(order: Order, projectId: string) {
  await supabase.from('pjb_orders').update({
    status: '発注済', ordered_at: order.ordered_at || new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
  }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} ステータス`, before: order.status, after: '発注済' })
}

export async function updateOrderPaymentSchedule(order: Order, date: string | null, projectId: string) {
  await supabase.from('pjb_orders').update({ payment_scheduled_at: date, updated_at: new Date().toISOString() }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} 支払予定日`, before: order.payment_scheduled_at, after: date })
}

export async function markOrderPaid(order: Order, projectId: string) {
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('pjb_orders').update({
    paid: true, paid_at: order.paid_at || today, status: '支払済', updated_at: new Date().toISOString(),
  }).eq('id', order.id)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} 支払`, after: order.paid_at || today })
}

export async function deleteOrder(order: Order, projectId: string, categoryName?: string) {
  await supabase.from('pjb_orders').delete().eq('id', order.id)
  const amt = order.order_amount || order.estimate_amount || 0
  await applyBudgetDelta({
    categoryId: order.category_id, projectId, delta: -amt, reason: `内訳削除：${order.title}`,
    entityLabel: `${categoryName || ''} 最新予算`,
  })
  await logActivity({ projectId, action: 'delete', entityType: 'order', entityLabel: order.title, before: amt })
}
