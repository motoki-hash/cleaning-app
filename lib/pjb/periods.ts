import { supabase } from '@/lib/supabase'
import { DEFAULT_CATEGORIES } from './constants'

// 1つの案件の中の「期」（1期・2期…）。期ごとに、予算・発注・売上計上月・スケジュール・担当を別々に持つ。
// 同じ案件の期は group_id でひとまとめにする（期なしの案件は group_id が空）
export type PeriodInfo = {
  id: string
  name: string
  status: string
  group_id: string | null
  period_no: number | null
  period_label: string | null
  sales_month: string | null
}

// 画面に出す名前（期があるときは「案件名 2期」）
export const periodName = (name: string, label?: string | null) => (label ? `${name} ${label}` : name)
export const periodLabelOf = (p: { period_no?: number | null; period_label?: string | null }) => p.period_label || (p.period_no ? `${p.period_no}期` : '')

const COLUMNS = 'id, name, status, group_id, period_no, period_label, sales_month'

// その案件が属する期の一覧。ready=false は、パッチ022がまだ（列がない）
export async function loadPeriods(projectId: string): Promise<{ list: PeriodInfo[]; ready: boolean }> {
  const { data: self, error } = await supabase.from('pjb_projects').select(COLUMNS).eq('id', projectId).maybeSingle()
  if (error) return { list: [], ready: false }
  if (!self) return { list: [], ready: true }
  const me = self as PeriodInfo
  if (!me.group_id) return { list: [me], ready: true }
  const { data } = await supabase.from('pjb_projects').select(COLUMNS).eq('group_id', me.group_id)
  const list = ((data || []) as PeriodInfo[]).sort((a, b) => (a.period_no ?? 99) - (b.period_no ?? 99))
  return { list: list.length ? list : [me], ready: true }
}

// 案件名の変更は、同じ案件の全ての期にそろえる
export async function renameGroup(projectId: string, next: string): Promise<string | null> {
  const stamp = new Date().toISOString()
  const { error } = await supabase.from('pjb_projects').update({ name: next, updated_at: stamp }).eq('id', projectId)
  if (error) return error.message
  const { data } = await supabase.from('pjb_projects').select('group_id').eq('id', projectId).maybeSingle()
  const gid = (data as { group_id?: string | null } | null)?.group_id
  if (gid) await supabase.from('pjb_projects').update({ name: next, updated_at: stamp }).eq('group_id', gid)
  return null
}

const CARRY_OVER = ['business', 'client_name', 'operator_name', 'address', 'design_company', 'contractor_company', 'pm_name', 'qa_name'] as const

// 今の案件に新しい期を足す。事業・会社・担当者は引き継ぎ、予算は新しく作る（売上計上月は期ごと）。成功したら新しい期のIDを返す
export async function addPeriod(sourceId: string, opts: { label: string; salesMonth: string | null }): Promise<{ id?: string; error?: string }> {
  const { data: src, error: srcErr } = await supabase.from('pjb_projects').select('*').eq('id', sourceId).single()
  if (srcErr || !src) return { error: `元の案件を読み込めませんでした：${srcErr?.message ?? ''}` }
  const source = src as Record<string, unknown> & { id: string; name: string; group_id?: string | null; period_no?: number | null; period_label?: string | null }
  if (!('group_id' in source)) return { error: 'SQLパッチ022を実行してから、もう一度お試しください' }

  const groupId = source.group_id || crypto.randomUUID()
  let nextNo = 2
  if (source.group_id) {
    const { data: sibs } = await supabase.from('pjb_projects').select('period_no').eq('group_id', source.group_id)
    nextNo = Math.max(1, ...((sibs || []) as Array<{ period_no: number | null }>).map(s => s.period_no ?? 1)) + 1
  } else {
    // これまで期なしだった案件は、いまの内容を「1期」にする
    const { error } = await supabase.from('pjb_projects').update({
      group_id: groupId, period_no: 1, period_label: source.period_label || '1期', updated_at: new Date().toISOString(),
    }).eq('id', sourceId)
    if (error) return { error: `1期の設定に失敗しました：${error.message}` }
  }

  const carry = Object.fromEntries(CARRY_OVER.filter(k => source[k] != null && String(source[k]).trim() !== '').map(k => [k, source[k]]))
  const { data: created, error } = await supabase.from('pjb_projects').insert({
    ...carry,
    name: source.name,
    total_budget: 0,
    group_id: groupId,
    period_no: nextNo,
    period_label: opts.label.trim() || `${nextNo}期`,
    ...(opts.salesMonth ? { sales_month: opts.salesMonth } : {}),
  }).select('id').single()
  if (error || !created) return { error: `期を追加できませんでした：${error?.message ?? ''}` }

  const { error: catErr } = await supabase.from('pjb_budget_categories').insert(DEFAULT_CATEGORIES.map(c => ({ project_id: created.id, ...c })))
  if (catErr) return { error: `予算項目を作れませんでした：${catErr.message}` }

  // 社内の担当（リソース管理）も、元の期と同じ人を引き継ぐ（テーブルがない・失敗したときは何もしない）
  const { data: as } = await supabase.from('pjb_assignments').select('staff_id, role, share').eq('project_id', sourceId)
  if (as && as.length) await supabase.from('pjb_assignments').insert((as as Array<{ staff_id: string; role: string; share: number | null }>).map(a => ({ ...a, project_id: created.id })))
  return { id: created.id }
}
