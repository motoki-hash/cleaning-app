import { supabase } from '@/lib/supabase'

// 案件を作ったときに入れた進行管理・品質管理の名前を、担当者と割り当てにも反映する（リソース管理の二重入力を防ぐ）。
// リソース管理用のテーブルがまだないとき（パッチ021の前）は、何もしない
export async function syncAssignmentsFromNames(projectId: string, names: { 進行管理?: string; 品質管理?: string }) {
  const probe = await supabase.from('pjb_staff').select('id, name')
  if (probe.error) return
  const staff = (probe.data || []) as Array<{ id: string; name: string }>
  for (const [role, raw] of Object.entries(names)) {
    const name = (raw || '').trim()
    if (!name) continue
    let id = staff.find(s => s.name === name)?.id
    if (!id) {
      const { data } = await supabase.from('pjb_staff').insert({ name, sort_order: staff.length }).select('id').single()
      if (!data) continue
      id = data.id as string
      staff.push({ id, name })
    }
    await supabase.from('pjb_assignments').insert({ project_id: projectId, staff_id: id, role })
  }
}
