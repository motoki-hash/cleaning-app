'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Shell from '../../components/Shell'
import { SectionTitle, EmptyState, InlineAmount, InlineText, KpiCard } from '../../components/ui'
import { useProjectData, findOrCreateVendor } from '@/lib/pjb/useProjectData'
import { formatDate } from '@/lib/pjb/format'
import { updateOrderStatus, markOrderPlaced, updateOrderAmount, updateOrderTitle, updateOrderVendor, updateOrderPaymentSchedule, markOrderPaid, deleteOrder as deleteOrderFn } from '@/lib/pjb/orders'
import { ORDER_STATUSES, type Order } from '@/lib/pjb/types'

const STATUS_TONE: Record<string, string> = {
  '見積依頼中': 'bg-slate-100 text-slate-500',
  '見積受領': 'bg-sky-50 text-sky-600',
  '発注待ち': 'bg-amber-50 text-amber-700',
  '発注済': 'bg-blue-50 text-blue-700',
  '完了': 'bg-slate-100 text-slate-500',
  '請求書待ち': 'bg-amber-50 text-amber-700',
  '支払待ち': 'bg-amber-50 text-amber-700',
  '支払済': 'bg-emerald-50 text-emerald-700',
}

type StatusFilter = '全て' | typeof ORDER_STATUSES[number]
const PRE_ORDER_STATUSES = new Set(['見積依頼中', '見積受領', '発注待ち'])
const ORDERED_STATUSES = new Set(['発注済', '完了', '請求書待ち', '支払待ち', '支払済'])

export default function OrdersPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, orders, vendors, loading, notFound, reload } = useProjectData(id)
  const [filter, setFilter] = useState<StatusFilter>('全て')

  const filtered = useMemo(() => orders.filter(o => filter === '全て' || o.status === filter), [orders, filter])

  const orderedCount = orders.filter(o => ORDERED_STATUSES.has(o.status)).length
  const notOrderedCount = orders.filter(o => PRE_ORDER_STATUSES.has(o.status)).length
  const paidCount = orders.filter(o => o.paid).length

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) {
    return <Shell projectId={id} active="orders"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const catName = (cid: string) => categories.find(c => c.id === cid)?.name || '—'
  const vendorName = (vid: string | null) => vendors.find(v => v.id === vid)?.name || ''

  const handleStatus = async (o: Order, status: string) => { await updateOrderStatus(o, status, id); reload() }
  const handleMarkPlaced = async (o: Order) => { await markOrderPlaced(o, id); reload() }
  const handlePaymentSchedule = async (o: Order, date: string) => { await updateOrderPaymentSchedule(o, date || null, id); reload() }
  const handleMarkPaid = async (o: Order) => { await markOrderPaid(o, id); reload() }
  const handleAmount = async (o: Order, amount: number) => { await updateOrderAmount(o, amount, id, catName(o.category_id)); reload() }
  const handleTitle = async (o: Order, title: string) => { await updateOrderTitle(o, title, id); reload() }
  const handleVendor = async (o: Order, name: string) => {
    const vendorId = await findOrCreateVendor(name)
    await updateOrderVendor(o, vendorId, name, id)
    reload()
  }
  const handleDelete = async (o: Order) => {
    if (!confirm(`「${o.title}」を削除しますか？\nこの内訳で最新予算に加算した金額は、カテゴリーの最新予算から差し引かれます。`)) return
    await deleteOrderFn(o, id, catName(o.category_id))
    reload()
  }

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="orders" onQuickAdded={reload}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KpiCard label="総件数" value={`${orders.length}件`} />
        <KpiCard label="発注済" value={`${orderedCount}件`} />
        <KpiCard label="未発注" value={`${notOrderedCount}件`} tone={notOrderedCount > 0 ? 'warning' : 'good'} />
        <KpiCard label="支払完了" value={`${paidCount}/${orders.length}件`} tone={paidCount === orders.length && orders.length > 0 ? 'good' : 'default'} />
      </div>

      <SectionTitle>発注一覧 ({orders.length}) <span className="text-[12px] font-normal text-slate-400 ml-1">金額は税別</span></SectionTitle>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
        {(['全て', ...ORDER_STATUSES] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[12.5px] px-2.5 py-1 rounded-full whitespace-nowrap border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? <EmptyState>該当する発注はありません</EmptyState> : (
        <div className="grid gap-2">
          {filtered.map(o => (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 grid gap-0.5">
                  <InlineText value={o.title} onCommit={v => handleTitle(o, v)} className="text-[14px] font-semibold text-slate-900" />
                  <div className="text-[12px] text-slate-400 flex items-center gap-1">
                    <span>{catName(o.category_id)} ・</span>
                    <InlineText value={vendorName(o.vendor_id)} emptyLabel="業者未設定" placeholder="業者名" onCommit={v => handleVendor(o, v)} className="text-[12px] text-slate-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <InlineAmount value={o.order_amount || o.estimate_amount} formulaKey={`order:${o.id}`} onCommit={v => handleAmount(o, v)} emphasize />
                  <button onClick={() => handleDelete(o)} className="text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除">✕</button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <select
                  value={o.status}
                  onChange={e => handleStatus(o, e.target.value)}
                  className={`text-[12.5px] px-2 py-1 rounded-md border-0 font-medium ${STATUS_TONE[o.status]}`}
                >
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className={`text-[12px] px-2 py-0.5 rounded-full border ${o.invoice_received ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {o.invoice_received ? '請求書受領済' : '請求書未受領'}
                </span>
                <span className={`text-[12px] px-2 py-0.5 rounded-full border ${o.paid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {o.paid ? `支払済${o.paid_at ? `（${formatDate(o.paid_at)}）` : ''}` : '未払い'}
                </span>
                {PRE_ORDER_STATUSES.has(o.status) && (
                  <button
                    onClick={() => handleMarkPlaced(o)}
                    className="text-[12px] px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium"
                  >
                    発注済みにする
                  </button>
                )}
                {!o.paid && (
                  <button
                    onClick={() => handleMarkPaid(o)}
                    className="text-[12px] px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium"
                  >
                    支払済みにする
                  </button>
                )}
                <Link
                  href={`/pjb/${id}/orders/${o.id}/po`}
                  target="_blank"
                  className="text-[12px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-500"
                >
                  📄 発注書
                </Link>
              </div>
              <div className="text-[12px] text-slate-400 flex items-center gap-3 flex-wrap">
                {o.ordered_at && <span>発注日 {formatDate(o.ordered_at)}</span>}
                <label className="flex items-center gap-1.5">
                  <span>支払予定日</span>
                  <input
                    type="date"
                    defaultValue={o.payment_scheduled_at || ''}
                    onBlur={e => { if (e.target.value !== (o.payment_scheduled_at || '')) handlePaymentSchedule(o, e.target.value) }}
                    className="border border-slate-200 rounded-md px-1.5 py-0.5 text-[12px]"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
