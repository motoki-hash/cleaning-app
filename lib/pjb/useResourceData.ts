'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SETTINGS, type AssignmentRow, type ProjectRow, type ResourceSettings, type RoughBar, type StaffRow } from './resource'

// リソース管理に必要なデータをまとめて読む。ページを切り替えても空の「読み込み中」を挟まないよう、前回の結果を覚えておく
type Data = {
  projects: ProjectRow[]
  staff: StaffRow[]
  assignments: AssignmentRow[]
  settings: ResourceSettings
  bars: RoughBar[]
  tablesReady: boolean      // パッチ021が適用済みか
}
let cache: Data | null = null

export function useResourceData() {
  const [data, setData] = useState<Data | null>(cache)
  const [loading, setLoading] = useState(cache === null)

  const load = useCallback(async () => {
    const [pRes, sRes, aRes, setRes, schRes, tRes, bRes] = await Promise.all([
      supabase.from('pjb_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('pjb_staff').select('*').order('sort_order').order('created_at'),
      supabase.from('pjb_assignments').select('*'),
      supabase.from('pjb_resource_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('pjb_schedules').select('id, project_id, sort_order').eq('kind', 'rough'),
      supabase.from('pjb_schedule_tasks').select('id, project_id, schedule_id, category').eq('kind', 'rough'),
      supabase.from('pjb_schedule_bars').select('task_id, project_id, color, start_week, length_weeks').eq('kind', 'rough'),
    ])
    const tablesReady = !sRes.error && !aRes.error
    const projects = (pRes.data || []) as ProjectRow[]

    // 版（社内用・投資家用など）が複数あるときは、スケジュール画面と同じく、先頭の版を使う
    const firstSchedule = new Map<string, string>()
    if (!schRes.error) {
      const list = ((schRes.data || []) as Array<{ id: string; project_id: string; sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order)
      for (const s of list) if (!firstSchedule.has(s.project_id)) firstSchedule.set(s.project_id, s.id)
    }
    const tasks = ((tRes.data || []) as Array<{ id: string; project_id: string; schedule_id: string | null; category: string }>)
      .filter(t => !firstSchedule.has(t.project_id) || (t.schedule_id ?? firstSchedule.get(t.project_id)) === firstSchedule.get(t.project_id))
    const taskMap = new Map(tasks.map(t => [t.id, t]))
    const bars: RoughBar[] = []
    for (const b of (bRes.data || []) as Array<{ task_id: string; project_id: string; color: string; start_week: number | null; length_weeks: number | null }>) {
      const t = taskMap.get(b.task_id)
      if (t) bars.push({ project_id: b.project_id, category: t.category, color: b.color, start_week: b.start_week, length_weeks: b.length_weeks })
    }

    const st = (setRes.data || null) as (Partial<ResourceSettings> & Record<string, unknown>) | null
    const settings: ResourceSettings = st ? {
      phase_coefs: (st.phase_coefs as ResourceSettings['phase_coefs']) || {},
      th_spare: Number(st.th_spare ?? DEFAULT_SETTINGS.th_spare),
      th_warn: Number(st.th_warn ?? DEFAULT_SETTINGS.th_warn),
      th_danger: Number(st.th_danger ?? DEFAULT_SETTINGS.th_danger),
      hire_lead_months: Number(st.hire_lead_months ?? DEFAULT_SETTINGS.hire_lead_months),
      structural_months: Number(st.structural_months ?? DEFAULT_SETTINGS.structural_months),
      new_hire_fte: Number(st.new_hire_fte ?? DEFAULT_SETTINGS.new_hire_fte),
    } : DEFAULT_SETTINGS

    const next: Data = {
      projects, bars, settings, tablesReady,
      staff: (sRes.error ? [] : (sRes.data || [])).map(s => ({ ...s, capacity_fte: Number(s.capacity_fte) })) as StaffRow[],
      assignments: (aRes.error ? [] : (aRes.data || [])).map(a => ({ ...a, share: a.share == null ? null : Number(a.share) })) as AssignmentRow[],
    }
    cache = next
    setData(next)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}
