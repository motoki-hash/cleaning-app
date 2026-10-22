import { supabase } from '@/lib/supabase'
import { logActivity } from './activity'

// 最新予算を「増減額」で安全に更新するヘルパー。
// 呼び出し側が古い latest_budget を握ったまま計算すると、その間に別の変更が
// 入った場合に上書きしてしまう（例: クイック入力を閉じずに連続で内訳を追加すると
// 2件目以降が1件目の加算前の金額を基準に計算されてしまう）。これを防ぐため、
// 更新の直前に必ずDBから最新の値を取り直してから加減算する。
export async function applyBudgetDelta(params: {
  categoryId: string
  projectId: string
  delta: number
  reason?: string | null
  entityLabel: string
}): Promise<{ error?: string; before?: number; after?: number }> {
  const { categoryId, projectId, delta, reason, entityLabel } = params

  const { data: current, error: fetchErr } = await supabase
    .from('pjb_budget_categories')
    .select('latest_budget')
    .eq('id', categoryId)
    .single()
  if (fetchErr || !current) return { error: fetchErr?.message || 'カテゴリーが見つかりません' }

  const before = current.latest_budget as number
  const after = Math.max(before + delta, 0)

  const { error: updateErr } = await supabase
    .from('pjb_budget_categories')
    .update({ latest_budget: after, updated_at: new Date().toISOString() })
    .eq('id', categoryId)
  if (updateErr) return { error: updateErr.message }

  await supabase.from('pjb_cost_changes').insert({
    category_id: categoryId, field_name: '最新予算', before_amount: before, after_amount: after, reason: reason || null,
  })
  await logActivity({ projectId, action: 'update', entityType: 'budget_category', entityLabel, before, after })

  return { before, after }
}
