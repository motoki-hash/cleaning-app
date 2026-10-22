'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import Shell from '../../components/Shell'
import { SectionTitle, EmptyState } from '../../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { formatYen, formatDate, daysUntil } from '@/lib/pjb/format'
import type { Order } from '@/lib/pjb/types'

export default function PaymentsPage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, orders, vendors, loading, notFound, reload } = useProjectData(id)

  const catName = (cid: string) => categories.find(c => c.id === cid)?.name || '—'
  const vendorName = (vid: string | null) => vendors.find(v => v.id === vid)?.name || '未設定'

  const groups = useMemo(() => {
    const unpaid = orders.filter(o => !o.paid)
    const now = new Date()
    const overdue = unpaid.filter(o => o.payment_scheduled_at && (daysUntil(o.payment_scheduled_at) ?? 0) < 0)
    const dueSoon = unpaid.filter(o => o.payment_scheduled_at && (daysUntil(o.payment_scheduled_at) ?? 99) >= 0 && (daysUntil(o.payment_scheduled_at) ?? 99) <= 7)
    const thisMonth = unpaid.filter(o => {
      if (!o.payment_scheduled_at) return false
      const d = new Date(o.payment_scheduled_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    const invoiceMissing = orders.filter(o => !o.invoice_received && o.status !== '見積依頼中' && o.status !== '見積受領')
    return { overdue, dueSoon, thisMonth, invoiceMissing }
  }, [orders])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) {
    return <Shell projectId={id} active="payments"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const Row = (o: Order) => (
    <div key={o.id} className="rounded-lg border border-slate-100 bg-white px-3.5 py-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-slate-900 truncate">{o.title}</div>
        <div className="text-[12px] text-slate-400">{catName(o.category_id)} ・ {vendorName(o.vendor_id)}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center justify-end gap-1.5">
          {o.paid && <span className="text-[11.5px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">支払済</span>}
          <span className="text-[14px] font-semibold tabular-nums text-slate-900">{formatYen(o.order_amount)}</span>
        </div>
        <div className="text-[12px] text-slate-400">
          {o.paid && o.paid_at ? `支払日 ${formatDate(o.paid_at)}` : o.payment_scheduled_at ? `支払予定 ${formatDate(o.payment_scheduled_at)}` : '支払予定日未設定'}
        </div>
      </div>
    </div>
  )

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="payments" onQuickAdded={reload}>
      <SectionTitle>支払期限超過 ({groups.overdue.length})</SectionTitle>
      {groups.overdue.length === 0 ? <EmptyState>ありません</EmptyState> : <div className="grid gap-1.5">{groups.overdue.map(Row)}</div>}

      <SectionTitle>支払期限7日以内 ({groups.dueSoon.length})</SectionTitle>
      {groups.dueSoon.length === 0 ? <EmptyState>ありません</EmptyState> : <div className="grid gap-1.5">{groups.dueSoon.map(Row)}</div>}

      <SectionTitle>今月支払予定 ({groups.thisMonth.length})</SectionTitle>
      {groups.thisMonth.length === 0 ? <EmptyState>ありません</EmptyState> : <div className="grid gap-1.5">{groups.thisMonth.map(Row)}</div>}

      <SectionTitle>請求書未受領 ({groups.invoiceMissing.length})</SectionTitle>
      {groups.invoiceMissing.length === 0 ? <EmptyState>ありません</EmptyState> : <div className="grid gap-1.5">{groups.invoiceMissing.map(Row)}</div>}

      <SectionTitle>すべての発注・支払</SectionTitle>
      {orders.length === 0 ? <EmptyState>登録がありません</EmptyState> : <div className="grid gap-1.5">{orders.map(Row)}</div>}
    </Shell>
  )
}
