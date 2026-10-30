import { parseYmd, addDays, roughWeekStart } from './schedule'

// ---- 役割・フェーズ・係数 ----
export const RESOURCE_ROLES = ['進行管理', '品質管理', 'デザイン'] as const
export type ResourceRole = typeof RESOURCE_ROLES[number]

// 案件の月ごとの段階。係数は「役割×フェーズ」の表で持つ
export const PHASES = ['plan', 'stay', 'construction', 'closing', 'openMonth', 'done'] as const
export type Phase = typeof PHASES[number]
export const PHASE_LABEL: Record<Phase, string> = {
  plan: '計画・デザイン・見積調整・契約',
  stay: 'ステイ期間',
  construction: '工事期間',
  closing: '竣工検査・是正・開業準備',
  openMonth: 'オープン月',
  done: '案件完了後',
}
export const PHASE_SHORT: Record<Phase, string> = { plan: '計画', stay: 'ステイ', construction: '工事', closing: '竣工・開業準備', openMonth: 'オープン月', done: '完了後' }
export const PHASE_COLOR: Record<Phase, string> = {
  plan: 'bg-sky-300', stay: 'bg-violet-300', construction: 'bg-emerald-400', closing: 'bg-rose-300', openMonth: 'bg-amber-400', done: 'bg-slate-200',
}
// デザイン担当だけ、竣工以降の呼び名が違う（係数の置き場所は同じ）
export const phaseLabelFor = (role: ResourceRole, p: Phase) => (role === 'デザイン' && p === 'closing' ? '工事終了後' : PHASE_LABEL[p])

export type CoefTable = Record<ResourceRole, Record<Phase, number>>
export const DEFAULT_COEFS: CoefTable = {
  進行管理: { plan: 1, stay: 0.3, construction: 0.5, closing: 1, openMonth: 1, done: 0 },
  品質管理: { plan: 1, stay: 0.3, construction: 0.5, closing: 1, openMonth: 1, done: 0 },
  デザイン: { plan: 1, stay: 0, construction: 1, closing: 0.5, openMonth: 0.3, done: 0 },
}

export type ResourceSettings = {
  phase_coefs: Partial<Record<ResourceRole, Partial<Record<Phase, number>>>>
  th_spare: number
  th_warn: number
  th_danger: number
  hire_lead_months: number
  structural_months: number
  new_hire_fte: number
}
export const DEFAULT_SETTINGS: ResourceSettings = {
  phase_coefs: {}, th_spare: 0.8, th_warn: 1.0, th_danger: 1.2, hire_lead_months: 3, structural_months: 3, new_hire_fte: 3,
}
export function resolveCoefs(s: ResourceSettings): CoefTable {
  const out = {} as CoefTable
  for (const r of RESOURCE_ROLES) {
    out[r] = {} as Record<Phase, number>
    for (const p of PHASES) {
      const v = s.phase_coefs?.[r]?.[p]
      out[r][p] = typeof v === 'number' && isFinite(v) ? v : DEFAULT_COEFS[r][p]
    }
  }
  return out
}

// ---- 入力データの型（画面側で読み込んだ行）----
export type StaffRow = { id: string; name: string; capacity_fte: number; joined_on: string | null; left_on: string | null; active: boolean; sort_order: number }
export type AssignmentRow = { id: string; project_id: string; staff_id: string; role: ResourceRole; share: number | null; start_on: string | null; end_on: string | null }
export type ProjectRow = {
  id: string; name: string; status: string
  schedule_base_date?: string | null; schedule_open_week?: number | null; open_date?: string | null
  load_factor?: number | null; stay_start?: string | null; stay_end?: string | null
}
export type RoughBar = { project_id: string; category: string; color: string; start_week: number | null; length_weeks: number | null }

// ---- 案件の日程（概算スケジュールから自動で取る）----
export type Timeline = {
  projectId: string
  ok: boolean
  reasons: string[]            // 使えない理由（未設定の項目）
  planStart: Date | null
  constStart: Date | null
  constEnd: Date | null
  openDate: Date | null
  stayStart: Date | null
  stayEnd: Date | null         // この日の前日まで
}

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const nextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1)

export function buildTimeline(project: ProjectRow, bars: RoughBar[]): Timeline {
  const reasons: string[] = []
  const base = project.schedule_base_date ? parseYmd(project.schedule_base_date) : null
  const valid = bars.filter(b => b.start_week != null && b.length_weeks != null)
  if (!base) reasons.push('スケジュールの基準日が未設定')
  else if (valid.length === 0) reasons.push('概算スケジュールに工程が未入力')

  let planStart: Date | null = null, constStart: Date | null = null, constEnd: Date | null = null
  if (base && valid.length) {
    planStart = roughWeekStart(base, Math.min(...valid.map(b => b.start_week!)))
    const work = valid.filter(b => b.category === '工事' && b.color !== 'darkgreen')   // 是正（濃い緑）は工事に含めない
    if (work.length === 0) reasons.push('「工事」の工程が未入力')
    else {
      constStart = roughWeekStart(base, Math.min(...work.map(b => b.start_week!)))
      constEnd = roughWeekStart(base, Math.max(...work.map(b => b.start_week! + b.length_weeks!)))
    }
  }
  let openDate: Date | null = null
  // 概算スケジュールのOPEN週を優先する（工程のバーと同じ基準なので、工事期間とずれない）。なければ「基準OPEN日」を使う
  if (base && project.schedule_open_week != null) openDate = roughWeekStart(base, project.schedule_open_week)
  else if (project.open_date) openDate = parseYmd(project.open_date)
  if (!openDate) reasons.push('OPEN日が未設定')

  const stayStart = project.stay_start ? monthStart(parseYmd(project.stay_start)) : null
  const stayEnd = project.stay_end ? nextMonth(parseYmd(project.stay_end)) : null
  return { projectId: project.id, ok: reasons.length === 0, reasons, planStart, constStart, constEnd, openDate, stayStart, stayEnd }
}

// その日の案件のフェーズ。まだ始まっていなければ null
export function phaseAt(tl: Timeline, d: Date): Phase | null {
  if (!tl.ok || !tl.planStart || !tl.constStart || !tl.constEnd || !tl.openDate) return null
  const oms = monthStart(tl.openDate), ome = nextMonth(tl.openDate)
  if (d >= ome) return 'done'
  if (d >= oms) return 'openMonth'
  if (d < tl.planStart) return null
  if (tl.stayStart && tl.stayEnd && d >= tl.stayStart && d < tl.stayEnd && d < tl.constStart) return 'stay'
  if (d < tl.constStart) return 'plan'
  if (d < tl.constEnd) return 'construction'
  return 'closing'
}

// ---- 月別の負荷 ----
export type LoadItem = {
  projectId: string; projectName: string; role: ResourceRole; staffId: string
  phases: Array<{ phase: Phase; frac: number }>   // その月のうち、各フェーズが占める割合
  share: number; factor: number; load: number
}
export type Level = 'none' | 'spare' | 'normal' | 'warn' | 'danger'

export function levelOf(load: number, cap: number, s: ResourceSettings): Level {
  if (cap <= 0) return load > 0.0001 ? 'danger' : 'none'
  const r = load / cap
  if (r > s.th_danger + 1e-9) return 'danger'
  if (r > s.th_warn + 1e-9) return 'warn'
  if (r < s.th_spare - 1e-9) return 'spare'
  return 'normal'
}

export type Computed = {
  months: Date[]
  cells: Map<string, Array<{ load: number; items: LoadItem[] }>>      // staffId → 月ごと
  capacity: Map<string, number[]>                                     // staffId → 月ごとの適正FTE（在籍反映）
  team: Array<{ load: number; cap: number; byRole: Record<ResourceRole, number> }>
  timelines: Map<string, Timeline>
  unscheduled: ProjectRow[]                                           // 進行中だが日程が使えない案件
  unassigned: Array<{ project: ProjectRow; roles: ResourceRole[] }>   // 日程はあるが、担当が未設定の役割がある案件
  counted: ProjectRow[]                                               // 集計に入っている案件
}

export function monthRange(from: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(from.getFullYear(), from.getMonth() + i, 1))
}

export function compute(
  projects: ProjectRow[], assignments: AssignmentRow[], staff: StaffRow[], bars: RoughBar[], settings: ResourceSettings, months: Date[],
): Computed {
  const coefs = resolveCoefs(settings)
  const active = projects.filter(p => p.status === '進行中')
  const timelines = new Map<string, Timeline>()
  for (const p of projects) timelines.set(p.id, buildTimeline(p, bars.filter(b => b.project_id === p.id)))

  // 同じ案件・同じ役割の割り当ては、手で入れた割合を先に引いて、残りを均等に割る
  const shareOf = new Map<string, number>()
  const groups = new Map<string, AssignmentRow[]>()
  for (const a of assignments) groups.set(`${a.project_id}|${a.role}`, [...(groups.get(`${a.project_id}|${a.role}`) || []), a])
  for (const list of groups.values()) {
    const manual = list.filter(a => a.share != null)
    const auto = list.filter(a => a.share == null)
    const rest = Math.max(0, 1 - manual.reduce((s, a) => s + Number(a.share), 0))
    manual.forEach(a => shareOf.set(a.id, Number(a.share)))
    auto.forEach(a => shareOf.set(a.id, rest / auto.length))
  }

  const staffById = new Map(staff.map(s => [s.id, s]))
  const projById = new Map(projects.map(p => [p.id, p]))
  const cells = new Map<string, Array<{ load: number; items: LoadItem[] }>>()
  const capacity = new Map<string, number[]>()
  for (const s of staff) {
    cells.set(s.id, months.map(() => ({ load: 0, items: [] })))
    capacity.set(s.id, months.map(m => {
      if (!s.active) return 0
      const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
      let n = 0
      for (let i = 0; i < dim; i++) {
        const d = new Date(m.getFullYear(), m.getMonth(), 1 + i)
        if ((!s.joined_on || d >= parseYmd(s.joined_on)) && (!s.left_on || d <= parseYmd(s.left_on))) n++
      }
      return Number(s.capacity_fte) * n / dim
    }))
  }

  const activeIds = new Set(active.map(p => p.id))
  for (const a of assignments) {
    const p = projById.get(a.project_id)
    const tl = timelines.get(a.project_id)
    if (!p || !tl || !tl.ok || !activeIds.has(p.id) || !staffById.has(a.staff_id)) continue
    const share = shareOf.get(a.id) ?? 1
    const factor = p.load_factor != null ? Number(p.load_factor) : 1
    const from = a.start_on ? parseYmd(a.start_on) : null
    const to = a.end_on ? parseYmd(a.end_on) : null
    months.forEach((m, mi) => {
      const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
      const counts: Partial<Record<Phase, number>> = {}
      for (let i = 0; i < dim; i++) {
        const d = new Date(m.getFullYear(), m.getMonth(), 1 + i)
        if ((from && d < from) || (to && d > to)) continue
        const ph = phaseAt(tl, d)
        if (ph) counts[ph] = (counts[ph] || 0) + 1
      }
      const phases = (Object.keys(counts) as Phase[]).map(ph => ({ phase: ph, frac: counts[ph]! / dim }))
      if (phases.length === 0) return
      const load = phases.reduce((s, x) => s + coefs[a.role][x.phase] * x.frac, 0) * share * factor
      if (load <= 0) return
      const cell = cells.get(a.staff_id)![mi]
      cell.load += load
      cell.items.push({ projectId: p.id, projectName: p.name, role: a.role, staffId: a.staff_id, phases, share, factor, load })
    })
  }

  const team = months.map((_, mi) => {
    const byRole: Record<ResourceRole, number> = { 進行管理: 0, 品質管理: 0, デザイン: 0 }
    let load = 0, cap = 0
    for (const s of staff) {
      const c = cells.get(s.id)![mi]
      load += c.load
      cap += capacity.get(s.id)![mi]
      for (const it of c.items) byRole[it.role] += it.load
    }
    return { load, cap, byRole }
  })

  const unscheduled = active.filter(p => !timelines.get(p.id)!.ok)
  const unassigned: Computed['unassigned'] = []
  for (const p of active) {
    if (!timelines.get(p.id)!.ok) continue
    const roles = RESOURCE_ROLES.filter(r => !assignments.some(a => a.project_id === p.id && a.role === r))
    // デザイン担当は任意（社外の設計会社だけの案件もある）。進行管理・品質管理が未設定のものだけ要確認にする
    const need = roles.filter(r => r !== 'デザイン')
    if (need.length) unassigned.push({ project: p, roles: need })
  }
  const counted = active.filter(p => timelines.get(p.id)!.ok)
  return { months, cells, capacity, team, timelines, unscheduled, unassigned, counted }
}

// ---- 将来の不足予測 ----
export type Run = { start: number; end: number; months: number; peak: number; structural: boolean }   // 月の添字
export type Forecast = {
  runs: Run[]
  first: Run | null
  hireBy: Date | null
  hireNow: boolean
  hires: number
  roleShortage: Record<ResourceRole, number>      // 最初の不足期間のピーク月の、役割ごとの不足の按分
  reassign: Array<{ month: number; over: string[]; spare: string[] }>   // 個人は超過だが、チームには余力がある月
}

export function forecast(c: Computed, staff: StaffRow[], s: ResourceSettings, todayMonth: Date): Forecast {
  const n = c.months.length
  const over = c.team.map(t => t.load > t.cap * s.th_warn + 1e-9)
  const shortage = c.team.map(t => Math.max(0, t.load - t.cap * s.th_warn))
  const runs: Run[] = []
  for (let i = 0; i < n; i++) {
    if (!over[i]) continue
    let j = i
    while (j + 1 < n && over[j + 1]) j++
    const len = j - i + 1
    runs.push({ start: i, end: j, months: len, peak: Math.max(...shortage.slice(i, j + 1)), structural: len >= s.structural_months })
    i = j
  }
  const first = runs[0] ?? null
  let hireBy: Date | null = null, hireNow = false, hires = 0
  const roleShortage: Record<ResourceRole, number> = { 進行管理: 0, 品質管理: 0, デザイン: 0 }
  const target = runs.find(r => r.structural) ?? first
  if (target) {
    const sm = c.months[target.start]
    hireBy = new Date(sm.getFullYear(), sm.getMonth() - s.hire_lead_months, 1)
    hireNow = hireBy <= todayMonth
    hires = s.new_hire_fte > 0 ? Math.ceil(target.peak / s.new_hire_fte - 1e-9) : 0
    let peakIdx = target.start
    for (let i = target.start; i <= target.end; i++) if (shortage[i] > shortage[peakIdx]) peakIdx = i
    const t = c.team[peakIdx]
    const tot = t.byRole.進行管理 + t.byRole.品質管理 + t.byRole.デザイン
    if (tot > 0) for (const r of RESOURCE_ROLES) roleShortage[r] = shortage[peakIdx] * t.byRole[r] / tot
  }
  const reassign: Forecast['reassign'] = []
  for (let i = 0; i < n; i++) {
    if (over[i]) continue
    const overP: string[] = [], spareP: string[] = []
    for (const st of staff) {
      const cap = c.capacity.get(st.id)![i], load = c.cells.get(st.id)![i].load
      if (cap > 0 && load > cap * s.th_warn + 1e-9) overP.push(st.name)
      else if (cap > 0 && load < cap * s.th_spare - 1e-9) spareP.push(st.name)
    }
    if (overP.length) reassign.push({ month: i, over: overP, spare: spareP })
  }
  return { runs, first, hireBy, hireNow, hires, roleShortage, reassign }
}

export const fmtFte = (v: number) => (Math.round(v * 10) / 10).toFixed(1)
export const fmtMonth = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月`
