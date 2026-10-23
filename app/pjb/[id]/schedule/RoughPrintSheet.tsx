import { BAR_COLORS, DEFAULT_MONTHS, zeroCols, WEEKS_PER_MONTH, roughWeekRange, roughGroups, roughWeekNumbers, fmtMd, barText, WEEKS_PER_MONTH_ZERO, WEEKS_PER_MONTH_CALENDAR, roughBarWeeksExcludingBreaks } from '@/lib/pjb/schedule'
import { weekBreakInfo } from '@/lib/pjb/holidays'
import FitToPage from '../../components/FitToPage'
import type { Project, ScheduleBar, ScheduleKind, ScheduleTask } from '@/lib/pjb/types'

const NAVY = '#1b3350'
const SLATE = '#3d5675'
const LEFT_W = '24.5%'
const ROW_H = 26
const MONTH_H = 34
const WEEK_H = 40

const fmtDate = (d?: string | null) => {
  if (!d) return '未定'
  const [y, m, day] = d.split('-').map(Number)
  return `${y}/${m}/${day}`
}

// ゼロ工程表／概算スケジュールのPDF出力用レイアウト（A3横・1ページ）。前半と後半の2段組み。
//  ゼロ工程表: 1ヶ月＝4週×12ヶ月の固定グリッド（日付・祝日なし）
//  概算スケジュール: 日曜始まりの暦の週×52週（週の開始日・大型連休つき）
export default function RoughPrintSheet({
  mode, project, tasks, bars, scheduleName,
}: { mode: Exclude<ScheduleKind, 'preopen'>; project: Project; tasks: ScheduleTask[]; bars: ScheduleBar[]; scheduleName?: string }) {
  const isZero = mode === 'zero'
  const months = project.schedule_months ?? DEFAULT_MONTHS
  const roughBars = bars.filter(b => b.kind === mode && b.start_week != null && b.length_weeks != null)
  const openWeek = (isZero ? project.zero_open_week : project.schedule_open_week) ?? null
  const base = project.schedule_base_date
    ? new Date(project.schedule_base_date + 'T00:00:00')
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const allGroups = isZero
    ? Array.from({ length: months }, (_, m) => ({ n: m + 1, month: m, year: 0, span: WEEKS_PER_MONTH, start: m * WEEKS_PER_MONTH }))
    : roughGroups(base, months)
  const weekNos = isZero ? Array.from({ length: zeroCols(months) }, (_, i) => (i % WEEKS_PER_MONTH) + 1) : roughWeekNumbers(base, months)

  const weekBreak = (w: number) => (isZero ? null : weekBreakInfo(roughWeekRange(base, w)[0]))

  // 6ヶ月ごとに1段（月の途中では分けない）。12ヶ月なら前半・後半の2段
  const BAND_MONTHS = 6
  const bandCount = Math.ceil(allGroups.length / BAND_MONTHS)
  const half = (idx: number) => {
    const bandGroups = allGroups.slice(idx * BAND_MONTHS, (idx + 1) * BAND_MONTHS)
    const h0 = bandGroups[0].start
    const HALF_WEEKS = bandGroups.reduce((sum, g) => sum + g.span, 0)
    const h1 = h0 + HALF_WEEKS
    const inHalf = (b: ScheduleBar) => b.start_week! < h1 && b.start_week! + b.length_weeks! > h0
    const rows = tasks
      .map((t, i) => ({ t, no: i + 1, bars: roughBars.filter(b => b.task_id === t.id && inHalf(b)) }))
      .filter(r => r.bars.length > 0)
    const groups = bandGroups.map(g => ({ n: g.n, month: g.month, year: g.year, from: g.start - h0, span: g.span }))
    const first = bandGroups[0].n, last = bandGroups[bandGroups.length - 1].n
    return { h0, rows, groups, HALF_WEEKS, first, last }
  }

  const info: Array<[string, string]> = [
    ['基準日', isZero ? '未定' : fmtDate(project.schedule_base_date)],
    ['クライアント', project.client_name || ''],
    ['運営会社', project.operator_name || ''],
    ['住所', project.address || ''],
    ['物件名', project.name],
    ['室数', project.room_count ? `${project.room_count}室` : ''],
  ]

  return (
    <FitToPage>

      <div style={{ background: NAVY, color: '#fff', padding: '14px 12px', fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>
        PROJECT MASTER SCHEDULE |
      </div>
      <div style={{ background: '#e3e9f1', padding: '7px 12px', fontSize: 13, fontWeight: 700 }}>
        {isZero ? 'ゼロ工程表' : '概算スケジュール'}{scheduleName ? `（${scheduleName}）` : ''}｜設計・見積・工事・OPEN準備（全{months}ヶ月）
      </div>

      <div style={{ background: '#e3e9f1', padding: '8px 0 8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', width: '72%', background: '#fff', border: '1px solid #cbd5e1' }}>
          {info.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontSize: 11 }}>
              <div style={{ width: '38%', background: '#eef2f7', fontWeight: 700, padding: '7px 8px', textAlign: 'center' }}>{k}</div>
              <div style={{ flex: 1, padding: '7px 8px' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {Array.from({ length: bandCount }, (_, idx) => {
        const { h0, rows, groups, HALF_WEEKS, first, last } = half(idx)
        const openIn = openWeek != null && openWeek >= h0 && openWeek < h0 + HALF_WEEKS
        return (
          <div key={idx} style={{ marginTop: 6, breakInside: 'avoid' }}>
            <div style={{ background: NAVY, color: '#fff', padding: '7px 12px', fontSize: 13, fontWeight: 700 }}>
              {months === 12 && idx === 0 ? '前半｜企画・設計 → 見積・契約 → 着工' : months === 12 && idx === 1 ? '後半｜工事継続 → OPEN準備 → OPEN・是正' : `${first}〜${last}ヶ月目`}
            </div>

            {/* ヘッダー */}
            <div style={{ display: 'grid', gridTemplateColumns: `${LEFT_W} 1fr`, background: SLATE, color: '#fff', fontSize: 11, fontWeight: 700 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: MONTH_H + WEEK_H }}>
                <div style={{ width: '18%', textAlign: 'center' }}>No.</div>
                <div style={{ width: '28%', textAlign: 'center' }}>区分</div>
                <div style={{ flex: 1, textAlign: 'center' }}>工程</div>
              </div>
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HALF_WEEKS}, 1fr)`, height: MONTH_H }}>
                  {groups.map(g => (
                    <div key={`${g.n}-${g.from}`} style={{ gridColumn: `${g.from + 1} / span ${g.span}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2, borderLeft: '2px solid #cbd5e1', fontSize: g.span >= 3 ? 12 : 10, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {isZero
                        ? <span>{g.n}ヶ月目</span>
                        : <>
                            <span>{g.span >= 3 ? `${g.year}年${g.month + 1}月` : `${g.month + 1}月`}</span>
                            {g.span >= 3 && <span style={{ fontSize: 9, fontWeight: 500, color: '#cbd5e1' }}>{g.n}ヶ月目</span>}
                          </>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HALF_WEEKS}, 1fr)`, height: WEEK_H, background: '#e8edf3', color: '#334155', fontWeight: 600, fontSize: 9.5 }}>
                  {Array.from({ length: HALF_WEEKS }, (_, w) => {
                    const info = weekBreak(h0 + w)
                    const isMonthStart = groups.some(g => g.from === w)
                    return (
                      <div key={w} style={{
                        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15,
                        borderLeft: isMonthStart ? '2px solid #cbd5e1' : '1px solid #fff',
                      }}>
                        {info && <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${info.from * 100}%`, width: `${(info.to - info.from) * 100}%`, background: '#fde68a' }} />}
                        <span style={{ position: 'relative' }}>{isZero ? `第${weekNos[h0 + w]}週目` : `${weekNos[h0 + w]}週`}</span>
                        {!isZero && <span style={{ position: 'relative', fontSize: 8, fontWeight: 500 }}>({fmtMd(roughWeekRange(base, h0 + w)[0])})</span>}
                        {info && <span style={{ position: 'relative', fontSize: 7.5, color: '#92400e' }}>{info.brk.short}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 行 */}
            <div style={{ position: 'relative', border: '1px solid #cbd5e1', borderTop: 0, minHeight: 84 }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: LEFT_W, right: 0, pointerEvents: 'none' }}>
                {Array.from({ length: HALF_WEEKS }, (_, w) => {
                  const info = weekBreak(h0 + w)
                  return info && (
                    <div key={`b${w}`} style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${((w + info.from) * 100) / HALF_WEEKS}%`, width: `${((info.to - info.from) * 100) / HALF_WEEKS}%`, background: '#fef3c7',
                    }} />
                  )
                })}
                {groups.map(g => (
                  <div key={`l${g.n}-${g.from}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(g.from * 100) / HALF_WEEKS}%`, borderLeft: '2px solid #94a3b8' }} />
                ))}
                {openIn && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${((openWeek! - h0) * 100) / HALF_WEEKS}%`, width: `${100 / HALF_WEEKS}%`,
                    background: '#22d3ee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: 1.25, fontWeight: 700, zIndex: 1,
                  }}>
                    {['O', 'P', 'E', 'N'].map(c => <span key={c}>{c}</span>)}
                  </div>
                )}
              </div>

              {rows.map(({ t, no, bars: rb }) => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: `${LEFT_W} 1fr`, height: ROW_H, borderBottom: '1px solid #e2e8f0', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ width: '18%', textAlign: 'center', color: '#475569' }}>{no}</div>
                    <div style={{ width: '28%', fontSize: 9.5, color: '#475569' }}>{t.category}</div>
                    <div style={{ flex: 1, fontWeight: 700 }}>{t.name}</div>
                  </div>
                  <div style={{
                    position: 'relative',
                    backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 0)',
                    backgroundSize: `${100 / HALF_WEEKS}% 100%`,
                  }}>
                    {rb.map(b => {
                      const s = Math.max(b.start_week!, h0)
                      const e = Math.min(b.start_week! + b.length_weeks!, h0 + HALF_WEEKS)
                      const cls = BAR_COLORS[b.color]?.cls || BAR_COLORS.gray.cls
                      return (
                        <div
                          key={b.id}
                          className={cls}
                          style={{
                            position: 'absolute', top: 3, bottom: 3, left: `${((s - h0) * 100) / HALF_WEEKS}%`, width: `${((e - s) * 100) / HALF_WEEKS}%`,
                            display: 'flex', alignItems: 'center', padding: '0 4px', whiteSpace: 'nowrap', fontSize: 10, zIndex: 2,
                          }}
                        >
                          {barText(b.label, b.color, isZero ? b.length_weeks! : roughBarWeeksExcludingBreaks(base, b.start_week!, b.length_weeks!), 'week', isZero ? WEEKS_PER_MONTH_ZERO : WEEKS_PER_MONTH_CALENDAR)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {rows.length === 0 && <div style={{ height: ROW_H, fontSize: 11, color: '#94a3b8', padding: '6px 10px' }}>この期間の工程はありません</div>}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 6, border: '1px solid #cbd5e1', background: '#f1f5f9' }}>
        <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#475569' }}>備考欄</div>
        <div style={{ padding: '8px 12px 12px', fontSize: 10.5, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{(isZero ? project.zero_notes : project.schedule_notes) || ''}</div>
      </div>
    </FitToPage>
  )
}
