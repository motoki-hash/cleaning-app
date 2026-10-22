'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import { SectionTitle, EmptyState } from '../../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { formatDateTime, formatYen } from '@/lib/pjb/format'
import type { ActivityLog } from '@/lib/pjb/types'

function isNumeric(v: string | null) {
  return v !== null && v !== '' && !isNaN(Number(v))
}

export default function HistoryPage() {
  const { id } = useParams<{ id: string }>()
  const { project, loading: projectLoading, notFound } = useProjectData(id)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pjb_activity_log').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setLogs((data || []) as ActivityLog[]); setLoading(false) })
  }, [id])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (projectLoading || !project) {
    return <Shell projectId={id} active="history"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="history">
      <SectionTitle>操作履歴</SectionTitle>
      {loading ? (
        <p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p>
      ) : logs.length === 0 ? (
        <EmptyState>まだ操作履歴がありません</EmptyState>
      ) : (
        <div className="grid gap-2">
          {logs.map(log => (
            <div key={log.id} className="rounded-lg border border-slate-100 bg-white px-3.5 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-slate-400">{formatDateTime(log.created_at)}</span>
                <span className="text-[12px] text-slate-400">{log.user_email || '不明なユーザー'}</span>
              </div>
              <div className="text-[14px] text-slate-800 font-medium">{log.entity_label || log.entity_type}</div>
              {(log.before_value !== null || log.after_value !== null) && (
                <div className="text-[13.5px] text-slate-500 tabular-nums">
                  {isNumeric(log.before_value) ? formatYen(Number(log.before_value)) : (log.before_value || '—')}
                  {' → '}
                  {isNumeric(log.after_value) ? formatYen(Number(log.after_value)) : (log.after_value || '—')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
