'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { findOrCreateVendor } from '@/lib/pjb/useProjectData'
import { logActivity } from '@/lib/pjb/activity'
import { createOrder } from '@/lib/pjb/orders'
import { MoneyInput } from './ui'
import type { BudgetCategory, Order } from '@/lib/pjb/types'

type Mode = 'menu' | 'work' | 've' | 'order' | 'payment' | 'invoice'

const today = () => new Date().toISOString().slice(0, 10)

const MENU: { mode: Mode; label: string; desc: string }[] = [
  { mode: 'work', label: '追加工事', desc: '追加で発生した工事を登録する' },
  { mode: 've', label: 'VE', desc: 'コスト削減候補を登録する' },
  { mode: 'order', label: '発注', desc: '見積・発注を登録する' },
  { mode: 'payment', label: '支払', desc: '既存の発注を支払済にする' },
  { mode: 'invoice', label: '請求書', desc: '請求書の受領を記録する' },
]

export default function QuickAddSheet({
  projectId, onClose, onSaved, initialMode, initialCategoryId,
}: { projectId: string; onClose: () => void; onSaved: () => void; initialMode?: Mode; initialCategoryId?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode || 'menu')
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [pendingInvoiceOrders, setPendingInvoiceOrders] = useState<Order[]>([])
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('pjb_budget_categories').select('*').eq('project_id', projectId).order('sort_order')
      .then(({ data }) => setCategories((data || []) as BudgetCategory[]))
    supabase.from('pjb_orders').select('*').eq('project_id', projectId).eq('invoice_received', false)
      .then(({ data }) => setPendingInvoiceOrders((data || []) as Order[]))
    supabase.from('pjb_orders').select('*').eq('project_id', projectId).eq('paid', false)
      .then(({ data }) => setUnpaidOrders((data || []) as Order[]))
  }, [projectId])

  // --- form field state (shared across modes, unused fields simply ignored) ---
  const [categoryId, setCategoryId] = useState(initialCategoryId || '')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [amount, setAmount] = useState('')
  const [veAdopt, setVeAdopt] = useState(false)
  const [dateVal, setDateVal] = useState(today())
  const [reason, setReason] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState('')

  const resetFields = () => {
    setCategoryId(''); setTitle(''); setContent(''); setVendorName('')
    setAmount(''); setDateVal(today()); setReason(''); setSelectedOrderId('')
    setError('')
  }

  const goto = (m: Mode) => { resetFields(); setMode(m) }

  const submitWork = async () => {
    if (!categoryId || !title || !amount) { setError('カテゴリー・工事項目・金額は必須です'); return }
    setSaving(true)
    const vendorId = vendorName ? await findOrCreateVendor(vendorName) : null
    await supabase.from('pjb_additional_works').insert({
      project_id: projectId, category_id: categoryId, vendor_id: vendorId, title, content: content || null,
      amount: Number(amount), occurred_on: dateVal || null, status: '検討中', budget_impact: '増額',
    })
    await logActivity({ projectId, action: 'create', entityType: 'additional_work', entityLabel: title, after: amount })
    setSaving(false)
    onSaved()
  }

  const submitVe = async () => {
    if (!categoryId || !title || !amount) { setError('対象カテゴリー・VE内容・削減予定額は必須です'); return }
    setSaving(true)
    // この時点では「検討中」なので予算にはまだ反映しない。採用に確定した時点で
    // 対象カテゴリーの最新予算を直接減額する（Cost・VE画面のステータス変更時）。
    const reduction = Number(amount)
    const { error: err } = await supabase.from('pjb_ve_items').insert({
      project_id: projectId, category_id: categoryId, content: title, target_item: content || null,
      planned_reduction: reduction, status: veAdopt ? '採用' : '検討中', confirmed_reduction: veAdopt ? reduction : 0,
    })
    if (err) { setError(`登録に失敗しました：${err.message}`); setSaving(false); return }
    await logActivity({ projectId, action: 'create', entityType: 've_item', entityLabel: title, after: amount })
    setSaving(false)
    onSaved()
  }

  const submitOrder = async () => {
    if (!categoryId || !title || !amount) { setError('カテゴリー・工事項目・金額は必須です'); return }
    setSaving(true)
    const vendorId = vendorName ? await findOrCreateVendor(vendorName) : null
    const cat = categories.find(c => c.id === categoryId)
    const { error: err } = await createOrder({
      projectId, categoryId, categoryName: cat?.name, title, amount: Number(amount), vendorId, date: dateVal || null,
    })
    setSaving(false)
    if (err) { setError(`登録に失敗しました：${err}`); return }
    onSaved()
  }

  const submitPayment = async () => {
    if (!selectedOrderId) { setError('発注を選択してください'); return }
    setSaving(true)
    await supabase.from('pjb_orders').update({ paid: true, paid_at: dateVal, status: '支払済', updated_at: new Date().toISOString() }).eq('id', selectedOrderId)
    const o = unpaidOrders.find(x => x.id === selectedOrderId)
    await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${o?.title || ''} 支払`, after: dateVal })
    setSaving(false)
    onSaved()
  }

  const submitInvoice = async () => {
    if (!selectedOrderId) { setError('発注を選択してください'); return }
    setSaving(true)
    await supabase.from('pjb_orders').update({
      invoice_received: true, invoice_received_at: dateVal, invoice_due_date: reason || null, updated_at: new Date().toISOString(),
    }).eq('id', selectedOrderId)
    const o = pendingInvoiceOrders.find(x => x.id === selectedOrderId)
    await logActivity({ projectId, action: 'update', entityType: 'order', entityLabel: `${o?.title || ''} 請求書受領`, after: dateVal })
    setSaving(false)
    onSaved()
  }

  const submit = () => {
    if (mode === 'work') return submitWork()
    if (mode === 've') return submitVe()
    if (mode === 'order') return submitOrder()
    if (mode === 'payment') return submitPayment()
    if (mode === 'invoice') return submitInvoice()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-2">
          {mode !== 'menu' && (
            <button onClick={() => goto('menu')} className="text-slate-400 text-lg px-1">‹</button>
          )}
          <div className="flex-1 text-[15px] font-semibold text-slate-900">
            {mode === 'menu' ? 'クイック入力' : MENU.find(m => m.mode === mode)?.label}
          </div>
          <button onClick={onClose} className="text-slate-400 text-lg px-1">×</button>
        </div>

        <div className="p-4">
          {mode === 'menu' && (
            <div className="grid gap-2">
              {MENU.map(m => (
                <button
                  key={m.mode}
                  onClick={() => goto(m.mode)}
                  className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="text-[15px] font-medium text-slate-900">{m.label}</div>
                  <div className="text-[13px] text-slate-400">{m.desc}</div>
                </button>
              ))}
            </div>
          )}

          {(mode === 'work' || mode === 've' || mode === 'order') && (
            <div className="grid gap-3">
              <Field label={mode === 've' ? '対象カテゴリー（採用時にここの最新予算が減額されます）' : '予算カテゴリー'}>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input">
                  <option value="">選択してください</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.group_name} / {c.name}</option>)}
                </select>
              </Field>
              {(mode === 'work' || mode === 'order') && (
                <Field label="工事項目・品目"><input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="例）電気配線追加" /></Field>
              )}
              {mode === 've' && (
                <Field label="VE内容"><input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="例）床材のグレードダウン" /></Field>
              )}
              {(mode === 'work' || mode === 'order') && (
                <Field label="業者名（任意）"><input value={vendorName} onChange={e => setVendorName(e.target.value)} className="input" placeholder="例）〇〇工務店" /></Field>
              )}
              {mode === 'work' && (
                <Field label="内容（任意）"><input value={content} onChange={e => setContent(e.target.value)} className="input" /></Field>
              )}
              {mode === 've' && (
                <Field label="対象項目の詳細（任意）"><input value={content} onChange={e => setContent(e.target.value)} className="input" placeholder="例）床材" /></Field>
              )}

              <Field label={mode === 've' ? '削減予定額（税別）' : '金額（税別）'}>
                <MoneyInput value={amount} onChange={setAmount} className="input" placeholder="0" />
              </Field>
              {mode === 'order' && (
                <p className="text-[12.5px] text-slate-400 -mt-1">
                  「見積依頼中」として登録され、この金額はカテゴリーの最新予算に自動で加算されます。実際に発注したら発注管理から「発注済みにする」を押してください。
                </p>
              )}
              {mode === 've' && (
                <div className="grid gap-1.5">
                  <label className="flex items-start gap-2 text-[13.5px] text-slate-700">
                    <input type="checkbox" checked={veAdopt} onChange={e => setVeAdopt(e.target.checked)} className="mt-1" />
                    <span>追加と同時に「採用」にして、すぐ予算に反映する</span>
                  </label>
                  <p className="text-[12.5px] text-slate-400">
                    {veAdopt
                      ? '登録すると同時に、対象カテゴリーの予算から、削減額が引かれます。'
                      : 'チェックしないと「検討中」として登録され、予算にはまだ反映されません。あとで「Cost・VE」画面の「採用して予算に反映」を押すと、反映されます。'}
                  </p>
                </div>
              )}

              {(mode === 'work' || mode === 'order') && (
                <Field label={mode === 'work' ? '発生日' : '見積予定日（任意）'}>
                  <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="input" />
                </Field>
              )}
            </div>
          )}

          {(mode === 'payment' || mode === 'invoice') && (
            <div className="grid gap-3">
              <Field label="対象の発注">
                <select value={selectedOrderId} onChange={e => setSelectedOrderId(e.target.value)} className="input">
                  <option value="">選択してください</option>
                  {(mode === 'payment' ? unpaidOrders : pendingInvoiceOrders).map(o => (
                    <option key={o.id} value={o.id}>{o.title}（{o.order_amount.toLocaleString()}円）</option>
                  ))}
                </select>
              </Field>
              <Field label={mode === 'payment' ? '支払日' : '請求書受領日'}>
                <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="input" />
              </Field>
              {mode === 'invoice' && (
                <Field label="支払期日（任意）"><input type="date" value={reason} onChange={e => setReason(e.target.value)} className="input" /></Field>
              )}
              {(mode === 'payment' ? unpaidOrders : pendingInvoiceOrders).length === 0 && (
                <p className="text-[13.5px] text-slate-400">対象になる発注がありません。先に「発注」から登録してください。</p>
              )}
            </div>
          )}

          {mode !== 'menu' && (
            <div className="mt-5 flex flex-col gap-2">
              {error && <p className="text-[13.5px] text-rose-600">{error}</p>}
              <button
                onClick={submit}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-[15px] font-medium disabled:opacity-50"
              >
                {saving ? '保存中…' : '登録する'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        .input {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 14px;
          width: 100%;
          background: white;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[13px] text-slate-500">{label}</span>
      {children}
    </label>
  )
}
