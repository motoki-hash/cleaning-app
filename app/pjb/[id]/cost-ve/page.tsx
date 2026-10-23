'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import QuickAddSheet from '../../components/QuickAddSheet'
import { SectionTitle, EmptyState, KpiCard, MoneyBlurInput } from '../../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { formatYen, formatSignedYen, formatDate } from '@/lib/pjb/format'
import { logActivity } from '@/lib/pjb/activity'
import { applyBudgetDelta } from '@/lib/pjb/budget'
import { ADDITIONAL_WORK_STATUSES, VE_STATUSES, type AdditionalWork, type VeItem } from '@/lib/pjb/types'

// 「採用」中に予算からすでに減額されている金額（未採用なら0）
const appliedAmount = (v: Pick<VeItem, 'status' | 'confirmed_reduction' | 'planned_reduction'>) =>
  v.status === '採用' ? (v.confirmed_reduction || v.planned_reduction || 0) : 0

const WORK_STATUS_TONE: Record<string, string> = {
  '検討中': 'bg-slate-100 text-slate-500',
  '見積待ち': 'bg-sky-50 text-sky-600',
  '承認待ち': 'bg-amber-50 text-amber-700',
  '承認済': 'bg-emerald-50 text-emerald-700',
  '発注済': 'bg-emerald-50 text-emerald-700',
  '完了': 'bg-slate-100 text-slate-500',
  '却下': 'bg-rose-50 text-rose-600',
}
const VE_STATUS_TONE: Record<string, string> = {
  '検討中': 'bg-slate-100 text-slate-500',
  '提案中': 'bg-sky-50 text-sky-600',
  '採用': 'bg-emerald-50 text-emerald-700',
  '不採用': 'bg-rose-50 text-rose-600',
}

export default function CostVePage() {
  const { id } = useParams<{ id: string }>()
  const { project, categories, additionalWorks, veItems, loading, notFound, reload } = useProjectData(id)
  const [addMode, setAddMode] = useState<'work' | 've' | null>(null)

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) {
    return <Shell projectId={id} active="cost-ve"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const catName = (id: string | null) => categories.find(c => c.id === id)?.name || '—'

  const updateWorkStatus = async (w: AdditionalWork, status: string) => {
    await supabase.from('pjb_additional_works').update({ status, updated_at: new Date().toISOString() }).eq('id', w.id)
    await logActivity({ projectId: id, action: 'update', entityType: 'additional_work', entityLabel: `${w.title} ステータス`, before: w.status, after: status })
    reload()
  }

  const updateVe = async (v: VeItem, patch: Partial<VeItem>) => {
    const before = appliedAmount(v)
    const after = appliedAmount({ ...v, ...patch })
    const budgetDelta = before - after // 減額が増えるほどマイナスになる

    if (budgetDelta !== 0 && !v.category_id) {
      alert('対象カテゴリーが未設定のため、予算に反映できません。先に「対象カテゴリー」を選んでください。')
      return
    }

    const { error } = await supabase.from('pjb_ve_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', v.id)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }

    if (budgetDelta !== 0 && v.category_id) {
      const cat = categories.find(c => c.id === v.category_id)
      const r = await applyBudgetDelta({
        categoryId: v.category_id, projectId: id, delta: budgetDelta, reason: `VE確定：${v.content}`,
        entityLabel: `${cat?.name || ''} 最新予算`,
      })
      if (r.error) alert(`予算への反映に失敗しました：${r.error}`)
    }
    if (patch.status) {
      await logActivity({ projectId: id, action: 'update', entityType: 've_item', entityLabel: `${v.content} ステータス`, before: v.status, after: patch.status })
    }
    reload()
  }

  // 対象カテゴリーを選び直す（採用済みなら、減額も新しいカテゴリーに付け替える）
  const changeVeCategory = async (v: VeItem, newCategoryId: string) => {
    if (!newCategoryId || newCategoryId === v.category_id) return
    const applied = appliedAmount(v)
    const { error } = await supabase.from('pjb_ve_items').update({ category_id: newCategoryId, updated_at: new Date().toISOString() }).eq('id', v.id)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    if (applied > 0) {
      if (v.category_id) {
        await applyBudgetDelta({ categoryId: v.category_id, projectId: id, delta: applied, reason: `VE対象変更：${v.content}`, entityLabel: `${catName(v.category_id)} 最新予算` })
      }
      await applyBudgetDelta({ categoryId: newCategoryId, projectId: id, delta: -applied, reason: `VE対象変更：${v.content}`, entityLabel: `${catName(newCategoryId)} 最新予算` })
    }
    reload()
  }

  const deleteWork = async (w: AdditionalWork) => {
    if (!confirm(`「${w.title}」を削除しますか？`)) return
    await supabase.from('pjb_additional_works').delete().eq('id', w.id)
    await logActivity({ projectId: id, action: 'delete', entityType: 'additional_work', entityLabel: w.title, before: w.amount })
    reload()
  }

  const deleteVe = async (v: VeItem) => {
    const applied = appliedAmount(v)
    const msg = applied > 0
      ? `「${v.content}」を削除しますか？\n採用済みのため、減額していた最新予算は元に戻ります。`
      : `「${v.content}」を削除しますか？`
    if (!confirm(msg)) return
    // 先に削除して、成功したときだけ予算を元に戻す（削除に失敗したのに予算だけ動くのを防ぐ）
    const { error } = await supabase.from('pjb_ve_items').delete().eq('id', v.id)
    if (error) { alert(`削除に失敗しました：${error.message}`); return }

    if (applied > 0 && v.category_id) {
      const cat = categories.find(c => c.id === v.category_id)
      const r = await applyBudgetDelta({
        categoryId: v.category_id, projectId: id, delta: applied, reason: `VE削除：${v.content}`,
        entityLabel: `${cat?.name || ''} 最新予算`,
      })
      if (r.error) alert(`予算を元に戻せませんでした：${r.error}`)
    }
    await logActivity({ projectId: id, action: 'delete', entityType: 've_item', entityLabel: v.content, before: v.planned_reduction })
    reload()
  }

  const targetTotal = categories.reduce((s, c) => s + c.original_budget, 0)
  const confirmedTotal = veItems.filter(v => v.status === '採用').reduce((s, v) => s + (v.confirmed_reduction || v.planned_reduction || 0), 0)
  const APPROVED_WORK_STATUSES = new Set(['承認済', '発注済', '完了'])
  const approvedWorkTotal = additionalWorks
    .filter(w => APPROVED_WORK_STATUSES.has(w.status) && w.budget_impact !== '影響なし')
    .reduce((s, w) => s + (w.budget_impact === '減額' ? -w.amount : w.amount), 0)
  const pendingWorkTotal = additionalWorks
    .filter(w => !APPROVED_WORK_STATUSES.has(w.status) && w.status !== '却下')
    .reduce((s, w) => s + w.amount, 0)
  const pendingVeTotal = veItems
    .filter(v => v.status === '検討中' || v.status === '提案中')
    .reduce((s, v) => s + v.planned_reduction, 0)

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="cost-ve" onQuickAdded={reload}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KpiCard label="目標工事金額（当初予算合計）" value={formatYen(targetTotal)} />
        <KpiCard
          label="追加工事"
          value={formatSignedYen(approvedWorkTotal)}
          sub={pendingWorkTotal > 0 ? `未承認 ${formatYen(pendingWorkTotal)}` : undefined}
          tone={approvedWorkTotal > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="減額案（VE）"
          value={`−${formatYen(confirmedTotal)}`}
          sub={pendingVeTotal > 0 ? `未確定 −${formatYen(pendingVeTotal)}` : undefined}
          tone={confirmedTotal > 0 ? 'good' : 'default'}
        />
        <KpiCard
          label="着地見込（目標＋追加−VE）"
          value={formatYen(targetTotal + approvedWorkTotal - confirmedTotal)}
          tone={targetTotal + approvedWorkTotal - confirmedTotal > targetTotal ? 'danger' : 'good'}
        />
      </div>

      <SectionTitle action={<button onClick={() => setAddMode('work')} className="text-[13px] px-3 py-1 rounded-full bg-blue-600 text-white">＋ 追加工事</button>}>
        追加工事 ({additionalWorks.length})
      </SectionTitle>
      {additionalWorks.length === 0 ? <EmptyState>追加工事の登録はまだありません</EmptyState> : (
        <div className="grid gap-2">
          {additionalWorks.map(w => (
            <div key={w.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">{w.title}</div>
                  <div className="text-[12px] text-slate-400">{catName(w.category_id)} ・ {formatDate(w.occurred_on)}発生 ・ {w.budget_impact}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[14px] font-semibold tabular-nums text-slate-900 whitespace-nowrap">{formatYen(w.amount)}</span>
                  <button onClick={() => deleteWork(w)} className="text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除">✕</button>
                </div>
              </div>
              {w.content && <p className="text-[13px] text-slate-500 mb-2">{w.content}</p>}
              <select
                value={w.status}
                onChange={e => updateWorkStatus(w, e.target.value)}
                className={`text-[12.5px] px-2 py-1 rounded-md border-0 font-medium ${WORK_STATUS_TONE[w.status]}`}
              >
                {ADDITIONAL_WORK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5 text-[14px]">
            <div className="flex justify-between font-semibold text-amber-700">
              <span>追加工事合計（承認済以降・着地見込に反映済み）</span>
              <span className="tabular-nums">+{formatYen(approvedWorkTotal)}</span>
            </div>
            {pendingWorkTotal > 0 && (
              <div className="flex justify-between text-[12.5px] text-slate-400 mt-1">
                <span>うち未承認（検討中・見積待ち・承認待ち、まだ反映されていない）</span>
                <span className="tabular-nums">{formatYen(pendingWorkTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <SectionTitle action={<button onClick={() => setAddMode('ve')} className="text-[13px] px-3 py-1 rounded-full bg-blue-600 text-white">＋ VE候補</button>}>
        VE / CD候補 ({veItems.length})
      </SectionTitle>
      {veItems.length === 0 ? <EmptyState>VE候補の登録はまだありません</EmptyState> : (
        <div className="grid gap-2">
          {veItems.map(v => (
            <div key={v.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">{v.content}</div>
                  <div className="text-[12px] text-slate-400">{v.target_item || catName(v.category_id)}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-[14px] font-semibold tabular-nums text-emerald-600">
                    −{formatYen(v.status === '採用' ? (v.confirmed_reduction || v.planned_reduction) : v.planned_reduction)}
                  </div>
                  <div className="text-[11.5px] text-slate-400">{v.status === '採用' ? '確定削減額' : '削減予定額'}</div>
                </div>
                <button onClick={() => deleteVe(v)} className="text-slate-300 hover:text-rose-500 text-[13px] shrink-0" aria-label="削除">✕</button>
              </div>
              {/* 予算に反映されているかを、はっきり表示する */}
              <div className={`text-[12.5px] mb-2 ${v.status === '採用' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {v.status === '採用'
                  ? `✓ 予算に反映済み（${catName(v.category_id)} −${formatYen(v.confirmed_reduction || v.planned_reduction)}）`
                  : `まだ予算に反映されていません（「採用」にすると、${catName(v.category_id)} が −${formatYen(v.planned_reduction)} されます）`}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!v.category_id && (
                  <select
                    value="" onChange={e => changeVeCategory(v, e.target.value)}
                    className="text-[12.5px] px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800"
                  >
                    <option value="">対象カテゴリーを選ぶ</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {v.status !== '採用' && v.status !== '不採用' && (
                  <button onClick={() => updateVe(v, { status: '採用' })}
                    className="text-[12.5px] px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium">採用して予算に反映</button>
                )}
                <select
                  value={v.status}
                  onChange={e => updateVe(v, { status: e.target.value as VeItem['status'] })}
                  className={`text-[12.5px] px-2 py-1 rounded-md border-0 font-medium ${VE_STATUS_TONE[v.status]}`}
                >
                  {VE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {v.status === '採用' && (
                  <MoneyBlurInput
                    defaultValue={v.confirmed_reduction || v.planned_reduction}
                    onCommit={n => updateVe(v, { confirmed_reduction: n })}
                    className="text-[12.5px] w-32 border border-slate-200 rounded-md px-2 py-1"
                    placeholder="確定削減額"
                  />
                )}
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-[14px] font-semibold text-emerald-700 flex justify-between">
            <span>VE合計（採用分）</span>
            <span className="tabular-nums">−{formatYen(confirmedTotal)}</span>
          </div>
        </div>
      )}

      {addMode && (
        <QuickAddSheet
          projectId={id}
          initialMode={addMode}
          onClose={() => setAddMode(null)}
          onSaved={() => { setAddMode(null); reload() }}
        />
      )}
    </Shell>
  )
}
