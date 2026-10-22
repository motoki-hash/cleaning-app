'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import RoughPrintSheet from './RoughPrintSheet'
import PreopenPrintSheet from './PreopenPrintSheet'
import Gantt, { type GanttBar, type GanttCol } from '../../components/Gantt'
import { useProjectData } from '@/lib/pjb/useProjectData'
import {
  BAR_COLORS, CATEGORY_OPTIONS, colorForCategory, DEFAULT_MONTHS, MONTH_OPTIONS, roughCols, zeroCols, ROUGH_TEMPLATE, PREOPEN_TEMPLATE, DEFAULT_OPEN_WEEK,
  roughWeekRange, roughGroups, roughWeekNumbers, fmtMd, fmtYmdJp, parseYmd, toYmd, addDays, diffDays, kindLabel, zeroWeekLabel, WEEKS_PER_MONTH, barText, stripDuration, WEEKS_PER_MONTH_ZERO, WEEKS_PER_MONTH_CALENDAR, roughBarWeeksExcludingBreaks, daysExcludingBreaks,
} from '@/lib/pjb/schedule'
import { breakInRange, weekBreakInfo } from '@/lib/pjb/holidays'
import type { Project, ScheduleBar, ScheduleKind, ScheduleTask } from '@/lib/pjb/types'

const ZOOM = { s: 0.7, m: 1, l: 1.3 } as const
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

type BarEdit =
  | { mode: 'edit'; bar: ScheduleBar }
  | { mode: 'new'; taskId: string; start: number; len: number }

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>()
  const { project, loading, notFound, reload } = useProjectData(id)
  const [kind, setKindState] = useState<ScheduleKind>('rough')
  useEffect(() => {
    try { const k = localStorage.getItem('pjb_schedule_kind'); if (k === 'zero' || k === 'rough' || k === 'preopen') setKindState(k) } catch {}
  }, [])
  const setKind = (k: ScheduleKind) => {
    setKindState(k)
    try { localStorage.setItem('pjb_schedule_kind', k) } catch {}
  }
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [bars, setBars] = useState<ScheduleBar[]>([])
  const [ready, setReady] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [barEdit, setBarEdit] = useState<BarEdit | null>(null)
  const [taskEdit, setTaskEdit] = useState<ScheduleTask | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  // ---- 元に戻す／やり直す（⌘Z / ⌘⇧Z）----
  // 変更の直前のスケジュール全体（行とバー）を保存しておき、戻すときは差分をデータベースに反映する
  type Snap = { tasks: ScheduleTask[]; bars: ScheduleBar[] }
  const stateRef = useRef<Snap>({ tasks: [], bars: [] })
  stateRef.current = { tasks, bars }
  const [undoStack, setUndoStack] = useState<Snap[]>([])
  const [redoStack, setRedoStack] = useState<Snap[]>([])
  const pushHistory = () => {
    const snap = { tasks: stateRef.current.tasks, bars: stateRef.current.bars }
    setUndoStack(p => [...p.slice(-49), snap])
    setRedoStack([])
  }
  const [zoom, setZoom] = useState<keyof typeof ZOOM>('m')
  useEffect(() => {
    try { const z = localStorage.getItem('pjb_schedule_zoom'); if (z === 's' || z === 'm' || z === 'l') setZoom(z) } catch {}
  }, [])
  const changeZoom = (z: keyof typeof ZOOM) => {
    setZoom(z)
    try { localStorage.setItem('pjb_schedule_zoom', z) } catch {}
  }

  const loadSchedule = useCallback(async () => {
    const [t, b] = await Promise.all([
      supabase.from('pjb_schedule_tasks').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('pjb_schedule_bars').select('*').eq('project_id', id),
    ])
    const err = t.error || b.error
    if (err) { setSetupError(err.message); setReady(true); return }
    setSetupError('')
    setTasks((t.data || []) as ScheduleTask[])
    setBars((b.data || []) as ScheduleBar[])
    setReady(true)
  }, [id])

  useEffect(() => { loadSchedule() }, [loadSchedule])

  const restoreSnapshot = async (target: Snap) => {
    setBusy(true)
    const cur = stateRef.current
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    const curTasks = new Map(cur.tasks.map(t => [t.id, t]))
    const curBars = new Map(cur.bars.map(b => [b.id, b]))
    const taskUp = target.tasks.filter(t => !same(curTasks.get(t.id), t))
    const barUp = target.bars.filter(b => !same(curBars.get(b.id), b))
    const keepTasks = new Set(target.tasks.map(t => t.id))
    const keepBars = new Set(target.bars.map(b => b.id))
    const errors: string[] = []
    if (taskUp.length) { const r = await supabase.from('pjb_schedule_tasks').upsert(taskUp); if (r.error) errors.push(r.error.message) }
    if (barUp.length) { const r = await supabase.from('pjb_schedule_bars').upsert(barUp); if (r.error) errors.push(r.error.message) }
    const delBars = cur.bars.filter(b => !keepBars.has(b.id)).map(b => b.id)
    if (delBars.length) { const r = await supabase.from('pjb_schedule_bars').delete().in('id', delBars); if (r.error) errors.push(r.error.message) }
    const delTasks = cur.tasks.filter(t => !keepTasks.has(t.id)).map(t => t.id)
    if (delTasks.length) { const r = await supabase.from('pjb_schedule_tasks').delete().in('id', delTasks); if (r.error) errors.push(r.error.message) }
    setBusy(false)
    if (errors.length) alert(`元に戻せませんでした：${errors[0]}`)
    await loadSchedule()
  }

  const undo = async () => {
    if (busy || undoStack.length === 0) return
    const target = undoStack[undoStack.length - 1]
    const current = { tasks: stateRef.current.tasks, bars: stateRef.current.bars }
    setUndoStack(p => p.slice(0, -1))
    setRedoStack(p => [...p, current])
    await restoreSnapshot(target)
  }
  const redo = async () => {
    if (busy || redoStack.length === 0) return
    const target = redoStack[redoStack.length - 1]
    const current = { tasks: stateRef.current.tasks, bars: stateRef.current.bars }
    setRedoStack(p => p.slice(0, -1))
    setUndoStack(p => [...p, current])
    await restoreSnapshot(target)
  }
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  undoRef.current = undo
  redoRef.current = redo
  const dialogOpenRef = useRef(false)
  dialogOpenRef.current = !!barEdit || !!taskEdit

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      const t = e.target as HTMLElement | null
      // 入力欄の中では、ブラウザ標準の「文字の取り消し」を優先する
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (dialogOpenRef.current) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) redoRef.current()
      else undoRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const kindTasks = useMemo(() => tasks.filter(t => t.kind === kind).sort((a, b) => a.sort_order - b.sort_order), [tasks, kind])
  const kindBars = useMemo(() => bars.filter(b => b.kind === kind), [bars, kind])

  const updateProject = async (patch: Partial<Project>) => {
    const { error } = await supabase.from('pjb_projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    reload()
  }

  // ---- 雛形の読み込み ----
  const seedTemplate = async () => {
    pushHistory()
    setBusy(true)
    try {
      if (kind !== 'preopen') {
        const { data, error } = await supabase.from('pjb_schedule_tasks').insert(
          ROUGH_TEMPLATE.map((t, i) => ({ project_id: id, kind, sort_order: i + 1, category: t.category, name: t.name, assignee: '' }))
        ).select('id, sort_order')
        if (error || !data) throw new Error(error?.message || '作成に失敗しました')
        const byOrder = new Map(data.map((r: { id: string; sort_order: number }) => [r.sort_order, r.id]))
        const rows = ROUGH_TEMPLATE.flatMap((t, i) => t.bars.map(b => ({
          task_id: byOrder.get(i + 1), project_id: id, kind, start_week: b.start, length_weeks: b.len, label: b.label, color: b.color,
        })))
        const { error: e2 } = await supabase.from('pjb_schedule_bars').insert(rows)
        if (e2) throw new Error(e2.message)
        if (project && kind === 'rough' && project.schedule_open_week == null) await updateProject({ schedule_open_week: DEFAULT_OPEN_WEEK })
        if (project && kind === 'zero' && project.zero_open_week == null) await updateProject({ zero_open_week: DEFAULT_OPEN_WEEK })
      } else {
        const { error } = await supabase.from('pjb_schedule_tasks').insert(
          PREOPEN_TEMPLATE.map((t, i) => ({ project_id: id, kind: 'preopen', sort_order: i + 1, category: t.category, name: t.name, assignee: t.assignee }))
        )
        if (error) throw new Error(error.message)
      }
      await loadSchedule()
    } catch (e) {
      alert(e instanceof Error ? e.message : '雛形の読み込みに失敗しました')
    }
    setBusy(false)
  }

  // ---- バー操作 ----
  const barToPatch = (start: number, len: number): Partial<ScheduleBar> => {
    if (kind !== 'preopen') return { start_week: start, length_weeks: len }
    const base = previewStart
    return { start_date: toYmd(addDays(base, start)), end_date: toYmd(addDays(base, start + len - 1)) }
  }

  const changeBar = async (barId: string, start: number, len: number) => {
    pushHistory()
    const patch = barToPatch(start, len)
    setBars(prev => prev.map(b => b.id === barId ? { ...b, ...patch } : b))
    const { error } = await supabase.from('pjb_schedule_bars').update(patch).eq('id', barId)
    if (error) { alert(`保存に失敗しました：${error.message}`); loadSchedule() }
  }

  const saveBar = async (edit: BarEdit, v: { label: string; color: string; start: number; len: number; startDate: string; endDate: string }) => {
    pushHistory()
    const patch: Partial<ScheduleBar> = kind !== 'preopen'
      ? { start_week: v.start, length_weeks: v.len }
      : { start_date: v.startDate, end_date: v.endDate < v.startDate ? v.startDate : v.endDate }
    setBusy(true)
    const { error } = edit.mode === 'edit'
      ? await supabase.from('pjb_schedule_bars').update({ ...patch, label: v.label, color: v.color }).eq('id', edit.bar.id)
      : await supabase.from('pjb_schedule_bars').insert({ ...patch, label: v.label, color: v.color, task_id: edit.taskId, project_id: id, kind })
    setBusy(false)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    setBarEdit(null)
    loadSchedule()
  }

  const deleteBar = async (barId: string) => {
    pushHistory()
    setBusy(true)
    await supabase.from('pjb_schedule_bars').delete().eq('id', barId)
    setBusy(false)
    setBarEdit(null)
    loadSchedule()
  }

  // ---- 行（工程）操作 ----
  const saveTask = async (existing: ScheduleTask | 'new', v: { category: string; name: string; assignee: string }) => {
    pushHistory()
    setBusy(true)
    const { error } = existing === 'new'
      ? await supabase.from('pjb_schedule_tasks').insert({
          project_id: id, kind, sort_order: (kindTasks[kindTasks.length - 1]?.sort_order || 0) + 1, ...v,
        })
      : await supabase.from('pjb_schedule_tasks').update(v).eq('id', existing.id)
    setBusy(false)
    if (error) { alert(`保存に失敗しました：${error.message}`); return }
    setTaskEdit(null)
    loadSchedule()
  }

  const deleteTask = async (taskId: string) => {
    pushHistory()
    setBusy(true)
    await supabase.from('pjb_schedule_tasks').delete().eq('id', taskId)
    setBusy(false)
    setTaskEdit(null)
    loadSchedule()
  }

  // ---- 複製 ----
  const duplicateBar = async (barId: string, start?: number, len?: number) => {
    const bar = bars.find(b => b.id === barId)
    if (!bar) return
    pushHistory()
    const colCount = kind === 'zero' ? zeroColCount : roughColCount
    let patch: Partial<ScheduleBar>
    if (start != null && len != null) patch = barToPatch(start, len)
    else if (kind !== 'preopen') {
      // 同じ長さのバーを、すぐ右隣（入りきらなければ右端）に置く
      const l = bar.length_weeks || 1
      patch = { start_week: Math.min((bar.start_week || 0) + l, Math.max(0, colCount - l)), length_weeks: l }
    } else {
      const sd = parseYmd(bar.start_date!), ed = parseYmd(bar.end_date!)
      const n = diffDays(sd, ed) + 1
      patch = { start_date: toYmd(addDays(sd, n)), end_date: toYmd(addDays(ed, n)) }
    }
    setBusy(true)
    const { error } = await supabase.from('pjb_schedule_bars').insert({
      task_id: bar.task_id, project_id: id, kind, label: bar.label, color: bar.color, ...patch,
    })
    setBusy(false)
    if (error) { alert(`複製に失敗しました：${error.message}`); return }
    loadSchedule()
  }

  const duplicateTask = async (task: ScheduleTask) => {
    pushHistory()
    setBusy(true)
    const { data: created, error } = await supabase.from('pjb_schedule_tasks').insert({
      project_id: id, kind, sort_order: 9999, category: task.category, name: `${task.name}（コピー）`, assignee: task.assignee,
    }).select('id').single()
    if (error || !created) { setBusy(false); alert(`複製に失敗しました：${error?.message}`); return }
    const copies = bars.filter(b => b.task_id === task.id).map(b => ({
      task_id: created.id, project_id: id, kind, start_week: b.start_week, length_weeks: b.length_weeks,
      start_date: b.start_date, end_date: b.end_date, label: b.label, color: b.color,
    }))
    if (copies.length) await supabase.from('pjb_schedule_bars').insert(copies)
    // 元の行のすぐ下に並べる
    const order = kindTasks.map(t => t.id)
    order.splice(order.indexOf(task.id) + 1, 0, created.id)
    await Promise.all(order.map((tid, i) => supabase.from('pjb_schedule_tasks').update({ sort_order: i + 1 }).eq('id', tid)))
    setBusy(false)
    setTaskEdit(null)
    loadSchedule()
  }

  // ドラッグで行を移動（toIndex は移動後の位置）
  const reorderTask = async (taskId: string, toIndex: number) => {
    const from = kindTasks.findIndex(t => t.id === taskId)
    if (from < 0 || from === toIndex) return
    pushHistory()
    const order = [...kindTasks]
    const [moved] = order.splice(from, 1)
    order.splice(toIndex, 0, moved)
    const orderMap = new Map(order.map((t, i) => [t.id, i + 1]))
    setTasks(prev => prev.map(t => orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id)! } : t))
    const results = await Promise.all(order.map((t, i) => supabase.from('pjb_schedule_tasks').update({ sort_order: i + 1 }).eq('id', t.id)))
    if (results.some(r => r.error)) { alert('並べ替えの保存に失敗しました'); loadSchedule() }
  }

  const moveTask = async (taskId: string, dir: -1 | 1) => {
    const idx = kindTasks.findIndex(t => t.id === taskId)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= kindTasks.length) return
    pushHistory()
    const order = [...kindTasks]
    ;[order[idx], order[j]] = [order[j], order[idx]]
    setBusy(true)
    await Promise.all(order.map((t, i) => supabase.from('pjb_schedule_tasks').update({ sort_order: i + 1 }).eq('id', t.id)))
    setBusy(false)
    loadSchedule()
  }

  // ---- 表示範囲 ----
  // 概算スケジュールの基準日。未設定のときは今月を1ヶ月目として仮表示する
  const roughBase = useMemo(() => {
    if (project?.schedule_base_date) return parseYmd(project.schedule_base_date)
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  }, [project?.schedule_base_date])
  const months = project?.schedule_months ?? DEFAULT_MONTHS
  const roughColCount = useMemo(() => roughCols(roughBase, months), [roughBase, months])
  const zeroColCount = zeroCols(months)
  const weekLabel = useCallback((i: number) => {
    const [s, e] = roughWeekRange(roughBase, i)
    return `${fmtYmdJp(s)}〜${fmtMd(e)}`
  }, [roughBase])

  const openDate = project?.open_date ? parseYmd(project.open_date) : null
  const previewStart = useMemo(() => {
    if (project?.preopen_start_date) return parseYmd(project.preopen_start_date)
    if (openDate) return addDays(openDate, -48)
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.preopen_start_date, project?.open_date])

  const preopenCols = useMemo(() => {
    let end = openDate ? openDate : addDays(previewStart, 48)
    for (const b of bars) if (b.kind === 'preopen' && b.end_date) { const e = parseYmd(b.end_date); if (e > end) end = e }
    return Math.max(14, diffDays(previewStart, end) + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, previewStart, project?.open_date])

  const gantt = useMemo(() => {
    if (kind === 'zero') {
      // ゼロ工程表: 日付・祝日は考慮しない（1ヶ月＝4週×12ヶ月）
      const openWeek = project?.zero_open_week ?? null
      const cols: GanttCol[] = Array.from({ length: zeroColCount }, (_, i) => ({
        top: `第${(i % WEEKS_PER_MONTH) + 1}週`,
        shade: openWeek === i ? 'open' : undefined,
      }))
      const groups = Array.from({ length: months }, (_, m) => ({ label: `${m + 1}ヶ月目`, span: WEEKS_PER_MONTH }))
      const ganttBars: GanttBar[] = kindBars
        .filter(b => b.start_week != null && b.length_weeks != null)
        .map(b => ({ id: b.id, rowId: b.task_id, start: b.start_week!, len: b.length_weeks!, label: barText(b.label, b.color, b.length_weeks!, 'week', WEEKS_PER_MONTH_ZERO), color: b.color }))
      return { cols, groups, ganttBars, baseCw: 40 }
    }
    if (kind === 'rough') {
      const openWeek = project?.schedule_open_week ?? null
      const weekNos = roughWeekNumbers(roughBase, months)
      const cols: GanttCol[] = Array.from({ length: roughColCount }, (_, i) => {
        const [ws, we] = roughWeekRange(roughBase, i)
        const info = weekBreakInfo(ws)
        return {
          top: `${weekNos[i]}週`,
          sub: `(${fmtMd(ws)})`,
          tag: info && openWeek !== i ? info.brk.short : undefined,
          note: `${fmtYmdJp(ws)}〜${fmtMd(we)}${info ? `｜${info.brk.name}` : ''}`,
          shade: openWeek === i ? 'open' : info ? 'break' : undefined,
          partial: info ? [info.from, info.to] : undefined,
        }
      })
      const groups = roughGroups(roughBase, months).map(g => ({ label: `${g.year}年${g.month + 1}月`, sub: `${g.n}ヶ月目`, span: g.span }))
      const ganttBars: GanttBar[] = kindBars
        .filter(b => b.start_week != null && b.length_weeks != null)
        .map(b => ({ id: b.id, rowId: b.task_id, start: b.start_week!, len: b.length_weeks!, label: barText(b.label, b.color, roughBarWeeksExcludingBreaks(roughBase, b.start_week!, b.length_weeks!), 'week', WEEKS_PER_MONTH_CALENDAR), color: b.color }))
      return { cols, groups, ganttBars, baseCw: 40 }
    }
    const cols: GanttCol[] = Array.from({ length: preopenCols }, (_, i) => {
      const d = addDays(previewStart, i)
      const wd = d.getDay()
      const isOpen = openDate ? diffDays(d, openDate) === 0 : false
      const brk = breakInRange(d, d)
      return {
        top: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
        sub: WEEKDAYS[wd],
        note: brk?.name,
        shade: isOpen ? 'open' : brk ? 'break' : wd === 6 ? 'sat' : wd === 0 ? 'sun' : undefined,
      }
    })
    const groups: { label: string; span: number }[] = []
    for (let i = 0; i < preopenCols; i++) {
      const d = addDays(previewStart, i)
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
      if (groups.length && groups[groups.length - 1].label === label) groups[groups.length - 1].span++
      else groups.push({ label, span: 1 })
    }
    const ganttBars: GanttBar[] = kindBars
      .filter(b => b.start_date && b.end_date)
      .flatMap(b => {
        const s = diffDays(previewStart, parseYmd(b.start_date!))
        const e = diffDays(previewStart, parseYmd(b.end_date!))
        if (e < 0 || s >= preopenCols) return []
        const cs = Math.max(0, s), ce = Math.min(preopenCols - 1, e)
        return [{ id: b.id, rowId: b.task_id, start: cs, len: ce - cs + 1, label: barText(b.label, b.color, daysExcludingBreaks(parseYmd(b.start_date!), parseYmd(b.end_date!)), 'day'), color: b.color }]
      })
    return { cols, groups, ganttBars, baseCw: 40 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, kindBars, preopenCols, previewStart, project?.schedule_open_week, project?.zero_open_week, roughBase, project?.open_date, months, roughColCount, zeroColCount])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project || !ready) {
    return <Shell projectId={id} active="schedule"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const rawNeedsPatch = setupError && /pjb_schedule|schema cache|does not exist/i.test(setupError)

  const leftCols = kind !== 'preopen'
    ? [{ label: 'No.', width: 44 }, { label: '区分', width: 84 }, { label: '工程', width: 190 }]
    : [{ label: 'No.', width: 44 }, { label: '区分', width: 84 }, { label: 'タスク', width: 230 }, { label: '担当', width: 100 }]
  const rows = kindTasks.map((t, i) => ({
    id: t.id,
    left: kind !== 'preopen' ? [i + 1, t.category, t.name] : [i + 1, t.category, t.name, t.assignee],
  }))

  const openBarEditById = (barId: string) => {
    const bar = bars.find(b => b.id === barId)
    if (bar) setBarEdit({ mode: 'edit', bar })
  }

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="schedule" wide onQuickAdded={reload}>
      <style>{`@media print { @page { size: A3 landscape; margin: 10mm; } body { background: #fff !important; } }`}</style>

      <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
        <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
          {(['zero', 'rough', 'preopen'] as ScheduleKind[]).map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-4 py-1.5 rounded-md text-[14px] font-medium whitespace-nowrap ${kind === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>
              {kindLabel[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto mr-3">
          <button onClick={undo} disabled={busy || undoStack.length === 0} title="元に戻す（⌘Z / Ctrl+Z）"
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-35">↶ 元に戻す</button>
          <button onClick={redo} disabled={busy || redoStack.length === 0} title="やり直す（⌘⇧Z / Ctrl+Y）"
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-35">↷ やり直す</button>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 mr-2 text-[13px] text-slate-500">
          表示サイズ
          <div className="flex gap-0.5 rounded-lg bg-slate-200 p-0.5">
            {([['s', '小'], ['m', '標準'], ['l', '大']] as const).map(([k, label]) => (
              <button key={k} onClick={() => changeZoom(k)}
                className={`px-2.5 py-1 rounded-md text-[13px] ${zoom === k ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => window.print()} className="hidden sm:block text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">印刷／PDF</button>
      </div>

      {kind !== 'preopen'
        ? <RoughPrintSheet mode={kind} project={project} tasks={kindTasks} bars={bars} />
        : <PreopenPrintSheet project={project} tasks={kindTasks} bars={bars} start={previewStart} cols={preopenCols} />}
      <div className="print:hidden">

      {rawNeedsPatch && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-800 mb-4">
          スケジュール用のテーブルがまだありません。Supabase の SQL Editor で <b>supabase-pj-budget-patch-004.sql</b>（ゼロ工程表を使う場合は <b>patch-005</b> も）を実行してから、このページを再読み込みしてください。
        </div>
      )}
      {setupError && !rawNeedsPatch && <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[14px] text-rose-700 mb-4">{setupError}</div>}

      {kind === 'rough' && !project.schedule_base_date && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13.5px] text-amber-800 mb-3 print:hidden">
          「1ヶ月目の開始日（基準日）」が未設定のため、今月を1ヶ月目として仮に表示しています。基準日を入れると、その月が1ヶ月目になります。
        </div>
      )}

      {/* 物件情報 */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 mb-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-[13.5px]">
        <Field label="物件名" value={project.name} onSave={v => v.trim() && updateProject({ name: v.trim() })} />
        <Field label="クライアント" value={project.client_name || ''} onSave={v => updateProject({ client_name: v || null })} />
        <Field label="運営会社" value={project.operator_name || ''} onSave={v => updateProject({ operator_name: v || null })} />
        <Field label="住所" value={project.address || ''} onSave={v => updateProject({ address: v || null })} />
        <Field label="室数" value={project.room_count ? String(project.room_count) : ''} type="number" suffix="室"
          onSave={v => updateProject({ room_count: Number(v) || 0 })} />
        {kind !== 'preopen' && (
          <label className="grid gap-1">
            <span className="text-[12px] text-slate-500">表示する期間（1ヶ月目から）</span>
            <select
              value={months}
              onChange={e => updateProject({ schedule_months: Number(e.target.value) })}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] bg-white"
            >
              {(MONTH_OPTIONS.includes(months) ? MONTH_OPTIONS : [...MONTH_OPTIONS, months].sort((a, b) => a - b)).map(m => <option key={m} value={m}>{m}ヶ月（{Math.floor(m / 12) ? `${Math.floor(m / 12)}年` : ''}{m % 12 ? `${m % 12}ヶ月` : ''}）</option>)}
            </select>
          </label>
        )}
        {kind === 'zero' ? (
          <div className="grid gap-1">
            <span className="text-[12px] text-slate-500">OPEN予定（ゼロ工程）</span>
            <select
              value={project.zero_open_week == null ? '' : String(project.zero_open_week)}
              onChange={e => updateProject({ zero_open_week: e.target.value === '' ? null : Number(e.target.value) })}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] bg-white"
            >
              <option value="">未設定</option>
              {Array.from({ length: zeroColCount }, (_, i) => <option key={i} value={i}>{zeroWeekLabel(i)}</option>)}
            </select>
          </div>
        ) : kind === 'rough' ? (
          <>
            <Field label="1ヶ月目の開始日（基準日）" value={project.schedule_base_date || ''} type="date" onSave={v => updateProject({ schedule_base_date: v || null })} />
            <div className="grid gap-1">
              <span className="text-[12px] text-slate-500">OPEN予定（概算）</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={project.schedule_open_week == null ? '' : String(project.schedule_open_week)}
                  onChange={e => updateProject({ schedule_open_week: e.target.value === '' ? null : Number(e.target.value) })}
                  className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] bg-white"
                >
                  <option value="">未設定</option>
                  {Array.from({ length: roughColCount }, (_, i) => (
                    <option key={i} value={i}>{weekLabel(i)} の週</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="基準OPEN日" value={project.open_date || ''} type="date" onSave={v => updateProject({ open_date: v || null })} />
            <Field label="表示開始日" value={toYmd(previewStart)} type="date" onSave={v => updateProject({ preopen_start_date: v || null })} />
          </>
        )}
      </div>

      <p className="text-[12.5px] text-slate-500 mb-2 print:hidden">
        空いているマスをドラッグすると新しいバーを作成、バーはドラッグで移動・両端でリサイズ、クリックで内容を編集、Alt(Option)キーを押しながらドラッグで複製できます。左の工程名をクリックすると行を編集、左端の「⋮⋮」を掴んで上下にドラッグすると行を並べ替えできます。
        {kind === 'zero'
          ? 'ゼロ工程表は日付・祝日を考慮しません（1ヶ月＝4週）。設定した期間（初期値12ヶ月）の工期の目安を、週単位で組みます。'
          : kind === 'rough'
          ? '1列＝カレンダーの1週間（日曜始まり。「1週 (9/27)」は、その月の1週目で、日曜の開始日が9/27という意味）です。黄色はGW・お盆・シルバーウィーク・年末年始の日付どおりの範囲で、列にマウスを乗せると日付が出ます。'
          : '黄色い列はGW・お盆・シルバーウィーク・年末年始です。'}
      </p>

      {kindTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="text-[14px] text-slate-500 mb-4">
            {kind === 'preopen' ? 'OPEN前スケジュールがまだありません。準備タスクの雛形（14項目）から始められます。' : `${kindLabel[kind]}がまだありません。ゼロ工程表の雛形（14工程）から始められます。`}
          </p>
          <div className="flex justify-center gap-2">
            <button onClick={seedTemplate} disabled={busy || !!setupError} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">雛形を読み込む</button>
            <button onClick={() => setTaskEdit('new')} disabled={!!setupError} className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-[14px] text-slate-700 disabled:opacity-50">空から作る</button>
          </div>
        </div>
      ) : (
        <>
          <Gantt
            leftCols={leftCols}
            rows={rows}
            cols={gantt.cols}
            groups={gantt.groups}
            bars={gantt.ganttBars}
            minCw={Math.round(gantt.baseCw * ZOOM[zoom])}
            onBarChange={changeBar}
            onBarClick={openBarEditById}
            onBarCopy={duplicateBar}
            onCreate={(taskId, start, len) => setBarEdit({ mode: 'new', taskId, start, len })}
            onRowClick={taskId => setTaskEdit(kindTasks.find(t => t.id === taskId) || null)}
            onReorder={reorderTask}
            onRowDelete={taskId => {
              const t = kindTasks.find(x => x.id === taskId)
              if (t && confirm(`「${t.name}」の行とバーをすべて削除します。よろしいですか？（⌘Zで元に戻せます）`)) deleteTask(taskId)
            }}
          />
          <div className="mt-3 flex items-center justify-between print:hidden">
            <button onClick={() => setTaskEdit('new')} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">＋ 工程を追加</button>
            <div className="hidden sm:flex items-center gap-3 text-[12px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-200" />大型連休</span>
              {Object.entries(BAR_COLORS).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${c.swatch}`} />{c.label}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {kind !== 'preopen' && (
        <div className="mt-6">
          <div className="text-[13px] font-semibold text-slate-600 mb-1.5">備考欄</div>
          <NotesField
            value={(kind === 'zero' ? project.zero_notes : project.schedule_notes) || ''}
            onSave={v => updateProject(kind === 'zero' ? { zero_notes: v } : { schedule_notes: v })}
          />
        </div>
      )}

      </div>

      {barEdit && (
        <BarDialog
          key={barEdit.mode === 'edit' ? barEdit.bar.id : `new-${barEdit.taskId}-${barEdit.start}`}
          kind={kind}
          weekLabel={kind === 'zero' ? zeroWeekLabel : weekLabel}
          weekCount={kind === 'zero' ? zeroColCount : roughColCount}
          edit={barEdit}
          task={kindTasks.find(t => t.id === (barEdit.mode === 'edit' ? barEdit.bar.task_id : barEdit.taskId))}
          previewStart={previewStart}
          busy={busy}
          onClose={() => setBarEdit(null)}
          onSave={v => saveBar(barEdit, v)}
          onDelete={barEdit.mode === 'edit' ? () => deleteBar(barEdit.bar.id) : undefined}
          onDuplicate={barEdit.mode === 'edit' ? () => { const b = barEdit.bar; setBarEdit(null); duplicateBar(b.id) } : undefined}
        />
      )}
      {taskEdit && (
        <TaskDialog
          key={taskEdit === 'new' ? 'new' : taskEdit.id}
          kind={kind}
          task={taskEdit}
          index={taskEdit === 'new' ? -1 : kindTasks.findIndex(t => t.id === taskEdit.id)}
          total={kindTasks.length}
          busy={busy}
          onClose={() => setTaskEdit(null)}
          onSave={v => saveTask(taskEdit, v)}
          onDelete={taskEdit === 'new' ? undefined : () => { if (confirm(`「${taskEdit.name}」の行とバーをすべて削除します。よろしいですか？`)) deleteTask(taskEdit.id) }}
          onMove={taskEdit === 'new' ? undefined : dir => moveTask(taskEdit.id, dir)}
          onDuplicate={taskEdit === 'new' ? undefined : () => duplicateTask(taskEdit)}
          onAddBar={taskEdit === 'new' ? undefined : () => {
            setTaskEdit(null)
            setBarEdit({ mode: 'new', taskId: taskEdit.id, start: 0, len: kind !== 'preopen' ? 4 : 1 })
          }}
        />
      )}
    </Shell>
  )
}

function Field({
  label, value, onSave, type = 'text', suffix,
}: { label: string; value: string; onSave: (v: string) => void; type?: string; suffix?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <label className="grid gap-1">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft !== value) onSave(draft) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="未設定"
          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] bg-white"
        />
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </span>
    </label>
  )
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      rows={3}
      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13.5px] bg-white leading-relaxed"
    />
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center print:hidden">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="text-[16px] font-semibold text-slate-900 mb-4">{title}</div>
        {children}
      </div>
    </div>
  )
}

function BarDialog({
  kind, weekLabel, weekCount, edit, task, previewStart, busy, onClose, onSave, onDelete, onDuplicate,
}: {
  kind: ScheduleKind; weekLabel: (i: number) => string; weekCount: number; edit: BarEdit; task: ScheduleTask | undefined; previewStart: Date; busy: boolean
  onClose: () => void
  onSave: (v: { label: string; color: string; start: number; len: number; startDate: string; endDate: string }) => void
  onDelete?: () => void
  onDuplicate?: () => void
}) {
  const initial = (() => {
    if (edit.mode === 'edit') {
      const b = edit.bar
      return { label: b.label, color: b.color, start: b.start_week ?? 0, len: b.length_weeks ?? 1, startDate: b.start_date || toYmd(previewStart), endDate: b.end_date || toYmd(previewStart) }
    }
    return {
      label: '', color: colorForCategory(task?.category || ''), start: edit.start, len: edit.len,
      startDate: toYmd(addDays(previewStart, edit.start)), endDate: toYmd(addDays(previewStart, edit.start + edit.len - 1)),
    }
  })()
  const [label, setLabel] = useState(stripDuration(initial.label))
  const [color, setColor] = useState(initial.color)
  const [startWeek, setStartWeek] = useState(initial.start)
  const [len, setLen] = useState(String(initial.len))
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)

  const submit = () => {
    const l = Math.max(1, Number(len) || 1)
    onSave({
      label: stripDuration(label.trim()), color, start: startWeek, len: l, startDate, endDate,
    })
  }

  return (
    <Modal title={`${task?.name || ''}｜バー${edit.mode === 'new' ? 'を追加' : 'の編集'}`} onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-[13px] text-slate-500">表示する内容（期間は自動で後ろに付きます）</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="例）解体工事（→ 解体工事：1ヶ月 と表示）" className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" />
        </label>

        {kind !== 'preopen' ? (
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <label className="grid gap-1">
              <span className="text-[13px] text-slate-500">{kind === 'zero' ? '開始（月・週）' : '開始（週の開始日〜終了日）'}</span>
              <select value={startWeek} onChange={e => setStartWeek(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-2 text-[15px] bg-white">
                {Array.from({ length: weekCount }, (_, i) => <option key={i} value={i}>{weekLabel(i)}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] text-slate-500">期間（週）</span>
              <input type="number" min={1} value={len} onChange={e => setLen(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[13px] text-slate-500">開始日</span>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" />
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] text-slate-500">終了日</span>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" />
            </label>
          </div>
        )}
        {kind !== 'preopen' && <p className="text-[12px] text-slate-400 -mt-1">{kind === 'zero' ? '期間は週数で入力します（1ヶ月＝4週。例：1.5ヶ月＝6週、5ヶ月＝20週）' : '期間は週数で入力します（目安：1ヶ月＝4〜5週、1.5ヶ月＝6〜7週）'}</p>}

        <div className="grid gap-1">
          <span className="text-[13px] text-slate-500">色</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BAR_COLORS).map(([k, c]) => (
              <button key={k} type="button" onClick={() => setColor(k)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] ${color === k ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'}`}>
                <span className={`w-3.5 h-3.5 rounded-sm ${c.swatch}`} />{c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        {onDelete && <button onClick={onDelete} disabled={busy} className="px-3 py-2.5 rounded-lg border border-rose-200 text-rose-600 text-[14px]">削除</button>}
        {onDuplicate && <button onClick={onDuplicate} disabled={busy} className="px-3 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-[14px]">複製</button>}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
        <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">保存</button>
      </div>
    </Modal>
  )
}

function TaskDialog({
  kind, task, index, total, busy, onClose, onSave, onDelete, onMove, onAddBar, onDuplicate,
}: {
  kind: ScheduleKind; task: ScheduleTask | 'new'; index: number; total: number; busy: boolean
  onClose: () => void
  onSave: (v: { category: string; name: string; assignee: string }) => void
  onDelete?: () => void
  onMove?: (dir: -1 | 1) => void
  onAddBar?: () => void
  onDuplicate?: () => void
}) {
  const t = task === 'new' ? null : task
  const [category, setCategory] = useState(t?.category || '')
  const [name, setName] = useState(t?.name || '')
  const [assignee, setAssignee] = useState(t?.assignee || '')

  return (
    <Modal title={t ? '工程の編集' : '工程を追加'} onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-[13px] text-slate-500">{kind !== 'preopen' ? '工程' : 'タスク'}</span>
          <input value={name} onChange={e => setName(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="例）解体工事" />
        </label>
        <label className="grid gap-1">
          <span className="text-[13px] text-slate-500">区分</span>
          <input list="pjb-sched-cats" value={category} onChange={e => setCategory(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="選択または入力" />
          <datalist id="pjb-sched-cats">{CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
        </label>
        {kind === 'preopen' && (
          <label className="grid gap-1">
            <span className="text-[13px] text-slate-500">担当</span>
            <input value={assignee} onChange={e => setAssignee(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]" placeholder="例）BNS / HSP / 施工店" />
          </label>
        )}
        {t && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onMove?.(-1)} disabled={busy || index <= 0} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] disabled:opacity-40">↑ 上へ</button>
            <button onClick={() => onMove?.(1)} disabled={busy || index >= total - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] disabled:opacity-40">↓ 下へ</button>
            <button onClick={onAddBar} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 text-[13px]">＋ この行にバーを追加</button>
            <button onClick={onDuplicate} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] disabled:opacity-40">この行を複製</button>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-5">
        {onDelete && <button onClick={onDelete} disabled={busy} className="px-3 py-2.5 rounded-lg border border-rose-200 text-rose-600 text-[14px]">削除</button>}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
        <button onClick={() => name.trim() && onSave({ category: category.trim(), name: name.trim(), assignee: assignee.trim() })} disabled={busy || !name.trim()}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-[14px] font-medium disabled:opacity-50">保存</button>
      </div>
    </Modal>
  )
}
