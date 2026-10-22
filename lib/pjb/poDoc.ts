import { supabase } from '@/lib/supabase'
import { logActivity } from './activity'
import { updateOrderAmount } from './orders'
import type { Order, PoLineItem, PurchaseOrderDoc } from './types'

export async function fetchPurchaseOrderDoc(orderId: string): Promise<PurchaseOrderDoc | null> {
  const { data } = await supabase.from('pjb_purchase_order_docs').select('*').eq('order_id', orderId).maybeSingle()
  return (data as PurchaseOrderDoc | null) || null
}

export async function savePurchaseOrderDoc(params: {
  order: Order
  projectId: string
  categoryName?: string
  quoteNumber: string
  issueDate: string
  vendorZip: string
  vendorAddress: string
  issuerName: string
  issuerZip: string
  issuerAddress: string
  issuerTel: string
  issuerEmail: string
  issuerContact: string
  deliveryDate: string
  deliveryPlace: string
  notes: string
  items: PoLineItem[]
  subtotal: number
  taxAmount: number
  totalAmount: number
}): Promise<{ error?: string }> {
  const { order, projectId, categoryName, ...f } = params

  const { error: docErr } = await supabase.from('pjb_purchase_order_docs').upsert({
    order_id: order.id, project_id: projectId,
    quote_number: f.quoteNumber || null, issue_date: f.issueDate || null,
    vendor_zip: f.vendorZip || null, vendor_address: f.vendorAddress || null,
    issuer_name: f.issuerName || null, issuer_zip: f.issuerZip || null, issuer_address: f.issuerAddress || null,
    issuer_tel: f.issuerTel || null, issuer_email: f.issuerEmail || null, issuer_contact: f.issuerContact || null,
    delivery_date: f.deliveryDate || null, delivery_place: f.deliveryPlace || null, notes: f.notes || null,
    line_items: f.items, subtotal: f.subtotal, tax_amount: f.taxAmount, total_amount: f.totalAmount,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'order_id' })
  if (docErr) return { error: docErr.message }

  // 発注データ・最新予算には税抜金額（小計）を反映する（税込合計は発注書表示のみで使用）
  await updateOrderAmount(order, f.subtotal, projectId, categoryName)
  await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${order.title} 発注書を保存` })

  return {}
}
