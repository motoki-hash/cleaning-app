'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/pjb/activity'
import { RESOURCE_ROLES, type AssignmentRow, type ResourceRole, type StaffRow } from '@/lib/pjb/resource'
import { isCommitEnter } from './ui'

// 案件の担当者（役割別・複数名OK）。負荷割合は空欄＝同じ役割の人で均等割り
export function AssigneeEditor({
  project, staff, assignments, onChanged,
}: {
  project: { id: string; name: string }
  staff: StaffRow[]
  assignments: AssignmentRow[]
  onChanged: () => void
}) {
  const mine = assignments.filter(a => a.project_id === project.id)
  const nameOf = (id: string) => staff.find(s => s.id === id)?.name ?? '（不明）'

  // これまでの画面（案件カード・一覧）で使っている進行管理・品質管理の名前も、先頭の担当者に合わせて更新する
  const syncNames = async (list: AssignmentRow[]) => {
    const first = (role: ResourceRole) => {
      const a = list.find(x => x.project_id === project.id && x.role === role)
      return a ? nameOf(a.staff_id) : null
    }
    await supabase.from('pjb_projects').update({ pm_name: first('進行管理'), qa_name: first('品質管理'), updated_at: new Date().toISOString() }).eq('id', project.id)
  }

  const add = async (role: ResourceRole, staffId: string) => {
    let id = staffId
    if (staffId === '__new__') {
      const name = (window.prompt('新しい担当者の名前') || '').trim()
      if (!name) return
      const exist = staff.find(s => s.name === name)
      if (exist) id = exist.id
      else {
        const { data, error } = await supabase.from('pjb_staff').insert({ name, sort_order: staff.length }).select('id').single()
        if (error || !data) { alert(`担当者を追加できませんでした：${error?.message}`); return }
        id = data.id
      }
    }
    if (mine.some(a => a.role === role && a.staff_id === id)) return
    const { data, error } = await supabase.from('pjb_assignments').insert({ project_id: project.id, staff_id: id, role }).select('*').single()
    if (error || !data) { alert(`追加できませんでした：${error?.message}`); return }
    const label = staff.find(s => s.id === id)?.name ?? ''
    await logActivity({ projectId: project.id, action: 'create', entityType: 'project', entityLabel: `担当（${role}）`, before: '', after: label })
    await syncNames([...mine, data as AssignmentRow])
    onChanged()
  }

  const remove = async (a: AssignmentRow) => {
    const { error } = await supabase.from('pjb_assignments').delete().eq('id', a.id)
    if (error) { alert(`外せませんでした：${error.message}`); return }
    await logActivity({ projectId: project.id, action: 'delete', entityType: 'project', entityLabel: `担当（${a.role}）`, before: nameOf(a.staff_id), after: '' })
    await syncNames(mine.filter(x => x.id !== a.id))
    onChanged()
  }

  const setShare = async (a: AssignmentRow, pct: string) => {
    const t = pct.trim()
    const value = t === '' ? null : Math.min(100, Math.max(0, Number(t))) / 100
    if (t !== '' && isNaN(Number(t))) return
    if (value === a.share) return
    const { error } = await supabase.from('pjb_assignments').update({ share: value }).eq('id', a.id)
    if (error) { alert(`保存できませんでした：${error.message}`); return }
    onChanged()
  }

  return (
    <div className="grid gap-2">
      {RESOURCE_ROLES.map(role => {
        const list = mine.filter(a => a.role === role)
        const candidates = staff.filter(s => s.active && !list.some(a => a.staff_id === s.id))
        return (
          <div key={role} className="grid grid-cols-[5.5rem_1fr] gap-2 items-start">
            <span className="text-[12px] text-slate-500 pt-1.5">{role}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {list.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-2.5 pr-1 py-0.5 text-[13px]">
                  {nameOf(a.staff_id)}
                  {list.length > 1 && (
                    <ShareInput value={a.share} onCommit={v => setShare(a, v)} />
                  )}
                  <button onClick={() => remove(a)} aria-label={`${nameOf(a.staff_id)}を外す`} className="w-5 h-5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 leading-none">×</button>
                </span>
              ))}
              <select
                value="" onChange={e => { if (e.target.value) add(role, e.target.value) }}
                className="border border-dashed border-slate-300 rounded-full px-2.5 py-1 text-[13px] bg-white text-slate-500"
                aria-label={`${role}の担当者を追加`}
              >
                <option value="">＋ 追加</option>
                {candidates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__new__">新しい人を登録…</option>
              </select>
              {list.length === 0 && <span className="text-[12px] text-slate-400">未設定</span>}
              {list.length > 1 && <span className="text-[11.5px] text-slate-400">％は空欄で均等割り</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ShareInput({ value, onCommit }: { value: number | null; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value == null ? '' : String(Math.round(value * 100)))
  useEffect(() => { setV(value == null ? '' : String(Math.round(value * 100))) }, [value])
  return (
    <span className="inline-flex items-center text-[12px] text-slate-500">
      <input
        value={v} placeholder="均等" inputMode="numeric"
        onChange={e => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
        className="w-11 text-right border border-slate-200 rounded px-1 py-0.5 text-[12px]"
      />%
    </span>
  )
}

// 案件ページ用：担当者と割り当てを自分で読み込む。パッチ021の前は、元の入力欄（fallback）を出す
export function ProjectAssignees({ project, onChanged, fallback }: { project: { id: string; name: string }; onChanged: () => void; fallback: React.ReactNode }) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.from('pjb_staff').select('*').order('sort_order').order('created_at'),
      supabase.from('pjb_assignments').select('*').eq('project_id', project.id),
    ])
    if (s.error || a.error) { setState('missing'); return }
    setStaff((s.data || []).map(x => ({ ...x, capacity_fte: Number(x.capacity_fte) })) as StaffRow[])
    setAssignments((a.data || []).map(x => ({ ...x, share: x.share == null ? null : Number(x.share) })) as AssignmentRow[])
    setState('ready')
  }, [project.id])
  useEffect(() => { load() }, [load])

  if (state === 'missing') return <>{fallback}</>
  if (state === 'loading') return <div className="text-[12px] text-slate-400">読み込み中…</div>
  return <AssigneeEditor project={project} staff={staff} assignments={assignments} onChanged={() => { load(); onChanged() }} />
}
