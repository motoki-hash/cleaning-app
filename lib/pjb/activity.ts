import { supabase } from '@/lib/supabase'

export async function logActivity(params: {
  projectId: string
  action: string
  entityType: string
  entityLabel?: string
  before?: string | number | null
  after?: string | number | null
}) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('pjb_activity_log').insert({
    project_id: params.projectId,
    user_email: user?.email || null,
    action: params.action,
    entity_type: params.entityType,
    entity_label: params.entityLabel || null,
    before_value: params.before === undefined || params.before === null ? null : String(params.before),
    after_value: params.after === undefined || params.after === null ? null : String(params.after),
  })
}
