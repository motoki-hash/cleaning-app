'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { formatYen } from '@/lib/pjb/format'
import { fetchPurchaseOrderDoc, savePurchaseOrderDoc } from '@/lib/pjb/poDoc'
import type { PoLineItem as LineItem } from '@/lib/pjb/types'

const round1 = (n: number) => Math.round(n)

export default function PurchaseOrderPage() {
  const { id, orderId } = useParams<{ id: string; orderId: string }>()
  const { project, categories, orders, vendors, loading, notFound } = useProjectData(id, { registerUndo: false })

  const order = useMemo(() => orders.find(o => o.id === orderId), [orders, orderId])
  const category = useMemo(() => categories.find(c => c.id === order?.category_id), [categories, order])
  const vendor = useMemo(() => vendors.find(v => v.id === order?.vendor_id), [vendors, order])

  const today = new Date().toISOString().slice(0, 10)

  // 発注日・見積番号
  const [issueDate, setIssueDate] = useState(today)
  const [quoteNumber, setQuoteNumber] = useState('')

  // 発注先（宛先）
  const [vendorZip, setVendorZip] = useState('')
  const [vendorAddress, setVendorAddress] = useState('')

  // 発注元（自社）
  const [issuerName, setIssuerName] = useState('株式会社BARE NOTE STUDIO')
  const [issuerZip, setIssuerZip] = useState('150-0043')
  const [issuerAddress, setIssuerAddress] = useState('東京都渋谷区道玄坂1丁目22−9 AD-O渋谷道玄坂 5F')
  const [issuerTel, setIssuerTel] = useState('03-6555-0919')
  const [issuerEmail, setIssuerEmail] = useState('')
  const [issuerContact, setIssuerContact] = useState('')

  // 納期・納品場所
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryPlace, setDeliveryPlace] = useState('')
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<LineItem[]>([])
  const [initialized, setInitialized] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  // orderが読み込まれた時点で、保存済みの発注書があればそれを、なければ発注データから初期値を組み立てる（1回だけ）
  useEffect(() => {
    if (!order || initialized) return
    setInitialized(true)
    fetchPurchaseOrderDoc(order.id).then(doc => {
      if (doc) {
        setQuoteNumber(doc.quote_number || '')
        setIssueDate(doc.issue_date || today)
        setVendorZip(doc.vendor_zip || '')
        setVendorAddress(doc.vendor_address || '')
        setIssuerName(doc.issuer_name || '株式会社BARE NOTE STUDIO')
        setIssuerZip(doc.issuer_zip || '150-0043')
        setIssuerAddress(doc.issuer_address || '東京都渋谷区道玄坂1丁目22−9 AD-O渋谷道玄坂 5F')
        setIssuerTel(doc.issuer_tel || '03-6555-0919')
        setIssuerEmail(doc.issuer_email || '')
        setIssuerContact(doc.issuer_contact || '')
        setDeliveryDate(doc.delivery_date || '')
        setDeliveryPlace(doc.delivery_place || '')
        setNotes(doc.notes || '')
        setItems(doc.line_items?.length ? doc.line_items : [{
          content: order.title, reducedTax: false, qty: 1, unit: '式',
          unitPrice: order.order_amount || order.estimate_amount || 0, taxRate: 0.1,
        }])
      } else {
        setItems([{
          content: order.title, reducedTax: false, qty: 1, unit: '式',
          unitPrice: order.order_amount || order.estimate_amount || 0, taxRate: 0.1,
        }])
        setQuoteNumber(order.id.slice(0, 8).toUpperCase())
        setIssueDate(order.ordered_at || today)
        setDeliveryDate(order.payment_scheduled_at || '')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, initialized])

  const updateItem = (i: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  const addItem = () => setItems(prev => [...prev, { content: '', reducedTax: false, qty: 1, unit: '式', unitPrice: 0, taxRate: 0.1 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const amounts = items.map(it => it.qty * it.unitPrice)
  const subtotal = amounts.reduce((s, a) => s + a, 0)
  const amount10 = items.reduce((s, it, i) => s + (it.taxRate === 0.1 ? amounts[i] : 0), 0)
  const amount8 = items.reduce((s, it, i) => s + (it.taxRate === 0.08 ? amounts[i] : 0), 0)
  const tax10 = round1(amount10 * 0.1)
  const tax8 = round1(amount8 * 0.08)
  const total = subtotal + tax10 + tax8
  const hasReduced = items.some(it => it.reducedTax)

  const handleSave = async () => {
    if (!order) return
    setSaveState('saving')
    const { error } = await savePurchaseOrderDoc({
      order, projectId: id, categoryName: category?.name,
      quoteNumber, issueDate, vendorZip, vendorAddress,
      issuerName, issuerZip, issuerAddress, issuerTel, issuerEmail, issuerContact,
      deliveryDate, deliveryPlace, notes, items,
      subtotal, taxAmount: tax10 + tax8, totalAmount: total,
    })
    if (error) { setSaveState('error'); setSaveError(error); return }
    setSaveState('saved')
  }

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[13px]">プロジェクトが見つかりません</div>
  if (loading || !project) return <p className="text-center text-[13px] text-slate-400 py-10">読み込み中…</p>
  if (!order) return <div className="p-8 text-center text-slate-400 text-[13px]">発注が見つかりません</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .po-sheet { box-shadow: none !important; margin: 0 !important; }
          .po-input { border-color: transparent !important; }
        }
        .po-input {
          border: none; border-bottom: 1px dashed #cbd5e1; background: transparent;
          font: inherit; color: inherit; padding: 1px 2px;
        }
        .po-input:focus { outline: none; border-bottom-color: #64748b; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <Link href={`/pjb/${id}/orders`} className="text-[13px] text-slate-500">‹ 発注管理に戻る</Link>
        <div className="flex items-center gap-3">
          {saveState === 'saved' && <span className="text-[12px] text-emerald-600">保存しました（税抜金額を発注金額・最新予算に反映済み）</span>}
          {saveState === 'error' && <span className="text-[12px] text-rose-600">保存に失敗しました：{saveError}</span>}
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-[13.5px] font-medium disabled:opacity-50"
          >
            {saveState === 'saving' ? '保存中…' : '保存'}
          </button>
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-[#1F4E5F] text-white text-[13.5px] font-medium">
            印刷 / PDFとして保存
          </button>
        </div>
      </div>

      <div className="po-sheet max-w-[820px] mx-auto my-8 bg-white shadow-sm px-10 py-10 text-[12.5px] text-slate-800 leading-relaxed">
        <h1 className="text-center text-[24px] font-bold tracking-[0.5em] mb-8">発注書</h1>

        {/* 発注日・見積番号 */}
        <div className="flex justify-end gap-6 text-[11.5px] mb-4">
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">発注日</span>
            <input type="date" className="po-input" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">見積番号</span>
            <input className="po-input w-24" value={quoteNumber} onChange={e => setQuoteNumber(e.target.value)} />
          </label>
        </div>

        {/* 宛先・自社情報 */}
        <div className="flex justify-between items-start mb-6 gap-8">
          <div className="w-[55%]">
            <div className="text-[16px] font-semibold border-b border-slate-800 pb-1 mb-2">{vendor?.name || '（発注先未設定）'} 御中</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">〒<input className="po-input w-24" placeholder="000-0000" value={vendorZip} onChange={e => setVendorZip(e.target.value)} /></div>
            <input className="po-input w-full mt-1" placeholder="発注先住所" value={vendorAddress} onChange={e => setVendorAddress(e.target.value)} />

            <p className="mt-6 mb-3 text-[12.5px]">下記の通り、発注いたします。</p>
            <div className="text-[11px] text-slate-500 mb-1">合計金額（税込）</div>
            <div className="text-[22px] font-bold border-b-2 border-slate-800 pb-1 inline-block tabular-nums">{formatYen(total)}</div>
          </div>

          <div className="w-[40%] text-[11px]">
            <input className="po-input w-full text-right text-[14px] font-semibold mb-1.5" value={issuerName} onChange={e => setIssuerName(e.target.value)} />
            <div className="flex justify-end items-center gap-1 text-slate-500">〒<input className="po-input w-24 text-right" placeholder="000-0000" value={issuerZip} onChange={e => setIssuerZip(e.target.value)} /></div>
            <input className="po-input w-full text-right mt-1" placeholder="住所" value={issuerAddress} onChange={e => setIssuerAddress(e.target.value)} />
            <div className="flex justify-end gap-1.5 mt-1"><span className="text-slate-500">電話：</span><input className="po-input w-32 text-right" placeholder="00-0000-0000" value={issuerTel} onChange={e => setIssuerTel(e.target.value)} /></div>
            <div className="flex justify-end gap-1.5 mt-1"><span className="text-slate-500">メール：</span><input className="po-input w-36 text-right" placeholder="xxx@example.com" value={issuerEmail} onChange={e => setIssuerEmail(e.target.value)} /></div>
            <div className="flex justify-end gap-1.5 mt-1"><span className="text-slate-500">担当者：</span><input className="po-input w-28 text-right" placeholder="氏名" value={issuerContact} onChange={e => setIssuerContact(e.target.value)} /></div>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 mb-6">件名：{project.name}｜{category?.name || '—'}</div>

        {/* 納期・納品場所 */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-[11.5px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-14">納期</span>
            <input type="date" className="po-input flex-1" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-16">納品場所</span>
            <input className="po-input flex-1" value={deliveryPlace} onChange={e => setDeliveryPlace(e.target.value)} placeholder="現場住所など" />
          </div>
        </div>

        {/* 明細 */}
        <table className="w-full border-collapse mb-1 text-[11.5px]">
          <thead>
            <tr className="border-y-2 border-slate-800 text-[10.5px] text-slate-500">
              <th className="text-left py-1.5 font-medium">内容</th>
              <th className="py-1.5 font-medium w-10">軽減</th>
              <th className="py-1.5 font-medium w-14 text-right">数量</th>
              <th className="py-1.5 font-medium w-14">単位</th>
              <th className="py-1.5 font-medium w-24 text-right">単価（税抜）</th>
              <th className="py-1.5 font-medium w-16 text-right">税率</th>
              <th className="py-1.5 font-medium w-28 text-right">金額（税抜）</th>
              <th className="py-1.5 w-6 no-print"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 pr-2"><input className="po-input w-full" value={it.content} onChange={e => updateItem(i, { content: e.target.value })} /></td>
                <td className="py-1.5 text-center">
                  <input type="checkbox" checked={it.reducedTax} onChange={e => updateItem(i, { reducedTax: e.target.checked, taxRate: e.target.checked ? 0.08 : 0.1 })} />
                </td>
                <td className="py-1.5"><input type="number" className="po-input w-full text-right" value={it.qty} onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })} /></td>
                <td className="py-1.5"><input className="po-input w-full" value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })} /></td>
                <td className="py-1.5"><input type="number" className="po-input w-full text-right" value={it.unitPrice} onChange={e => updateItem(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                <td className="py-1.5 text-right">{Math.round(it.taxRate * 100)}%</td>
                <td className="py-1.5 text-right tabular-nums">{formatYen(it.qty * it.unitPrice)}</td>
                <td className="py-1.5 text-center no-print">
                  <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-rose-500 text-[11px]">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} className="no-print text-[11px] text-slate-400 hover:text-slate-700 mb-4">＋ 明細行を追加</button>
        {hasReduced && <p className="text-[10px] text-slate-400 mb-4">※は軽減税率対象です。</p>}

        {/* 税区分・合計 */}
        <div className="flex justify-end">
          <table className="text-[11.5px] w-72 border-collapse">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1 text-slate-500">小計</td>
                <td className="py-1 text-right tabular-nums">{formatYen(subtotal)}</td>
              </tr>
              {amount10 > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-1 text-slate-500">10%対象（税抜 {formatYen(amount10)}）消費税</td>
                  <td className="py-1 text-right tabular-nums">{formatYen(tax10)}</td>
                </tr>
              )}
              {amount8 > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-1 text-slate-500">8%対象（税抜 {formatYen(amount8)}）消費税</td>
                  <td className="py-1 text-right tabular-nums">{formatYen(tax8)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-800">
                <td className="py-2 font-semibold">合計</td>
                <td className="py-2 text-right font-bold text-[15px] tabular-nums">{formatYen(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 備考 */}
        <div className="mt-8">
          <div className="text-slate-500 text-[11px] mb-1">備考</div>
          <textarea
            className="po-input w-full resize-none"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="特記事項があればご記入ください"
          />
        </div>

        {/* 注意事項 */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-[10px] text-slate-400">
          <div className="font-medium mb-1">▼注意事項</div>
          <div>四捨五入について：10％対象・8％対象の消費税は、算出時に小数点第一位を四捨五入しています。</div>
        </div>
      </div>
    </div>
  )
}
