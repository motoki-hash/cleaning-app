import { BAR_COLORS, addDays, diffDays, parseYmd, barText, daysExcludingBreaks } from '@/lib/pjb/schedule'
import { breakInRange } from '@/lib/pjb/holidays'
import FitToPage from '../../components/FitToPage'
import type { Project, ScheduleBar, ScheduleTask } from '@/lib/pjb/types'

const NAVY = '#1b3350'
const SLATE = '#3d5675'
const LEFT_W = '34%'
const ROW_H = 26
const HEAD_H = 24
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_COLS_PER_PAGE = 63   // これより長い期間は前半・後半の2段に分ける

const fmtYmd = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`

// OPEN前スケジュールのPDF出力用レイアウト（A3横・1ページ）。日付ごとの列、土日・大型連休・OPEN日を色分け。
export default function PreopenPrintSheet({
  project, tasks, bars, start, cols,
}: { project: Project; tasks: ScheduleTask[]; bars: ScheduleBar[]; start: Date; cols: number }) {
  const openDate = project.open_date ? parseYmd(project.open_date) : null
  const pageCols = cols > MAX_COLS_PER_PAGE ? Math.ceil(cols / 2) : cols
  const chunks: number[] = []
  for (let c = 0; c < cols; c += pageCols) chunks.push(c)

  const preBars = bars.filter(b => b.kind === 'preopen' && b.start_date && b.end_date)

  return (
    <FitToPage>

      <div style={{ background: NAVY, color: '#fff', padding: '14px 12px', fontSize: 22, fontWeight: 800 }}>
        OPEN前スケジュール｜{project.name}
      </div>
      <div style={{ background: '#e3e9f1', padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
        OPENまでの準備工程を一元管理{openDate ? `｜基準OPEN日：${fmtYmd(openDate)}` : ''}
      </div>

      {chunks.map(c0 => {
        const n = Math.min(pageCols, cols - c0)
        const days = Array.from({ length: n }, (_, i) => addDays(start, c0 + i))
        const groups: { label: string; span: number }[] = []
        days.forEach(d => {
          const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
          if (groups.length && groups[groups.length - 1].label === label) groups[groups.length - 1].span++
          else groups.push({ label, span: 1 })
        })
        const shade = days.map(d => {
          if (openDate && diffDays(d, openDate) === 0) return 'open'
          if (breakInRange(d, d)) return 'break'
          return d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : null
        })
        const shadeBg: Record<string, string> = { open: '#22d3ee', break: '#fef3c7', sat: '#e8f0fe', sun: '#fde8e8' }
        const headBg: Record<string, string> = { open: '#22d3ee', break: '#fde68a', sat: '#dbe7fb', sun: '#fbd5d5' }
        const unit = 100 / n

        return (
          <div key={c0} style={{ marginTop: 8, breakInside: 'avoid' }}>
            {/* ヘッダー */}
            <div style={{ display: 'grid', gridTemplateColumns: `${LEFT_W} 1fr`, background: SLATE, color: '#fff', fontSize: 11, fontWeight: 700 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: HEAD_H * 2 + 6 }}>
                <div style={{ width: '9%', textAlign: 'center' }}>No.</div>
                <div style={{ width: '17%', textAlign: 'center' }}>区分</div>
                <div style={{ flex: 1, textAlign: 'center' }}>タスク</div>
                <div style={{ width: '22%', textAlign: 'center' }}>担当</div>
              </div>
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, height: HEAD_H + 6 }}>
                  {groups.map((g, i) => {
                    const from = groups.slice(0, i).reduce((s, x) => s + x.span, 0)
                    return (
                      <div key={i} style={{ gridColumn: `${from + 1} / span ${g.span}`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '2px solid #cbd5e1', fontSize: g.span >= 4 ? 12 : 9.5, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {g.span >= 4 ? g.label : `${g.label.replace(/^\d+年/, '')}`}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, height: HEAD_H, background: '#e8edf3', color: '#334155', fontWeight: 600 }}>
                  {days.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1, fontSize: 8.5,
                      borderLeft: '1px solid #fff', background: shade[i] ? headBg[shade[i]!] : undefined,
                      color: shade[i] === 'sat' ? '#1d4ed8' : shade[i] === 'sun' ? '#b91c1c' : undefined,
                    }}>
                      <span>{d.getDate()}</span>
                      <span style={{ fontSize: 7.5, fontWeight: 500 }}>{WEEKDAYS[d.getDay()]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 行 */}
            <div style={{ position: 'relative', border: '1px solid #cbd5e1', borderTop: 0 }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: LEFT_W, right: 0, pointerEvents: 'none' }}>
                {shade.map((s, i) => s && (
                  <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * unit}%`, width: `${unit}%`, background: shadeBg[s] }} />
                ))}
                {groups.slice(0, -1).map((_, i) => {
                  const at = groups.slice(0, i + 1).reduce((s, x) => s + x.span, 0)
                  return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${at * unit}%`, borderLeft: '2px solid #94a3b8' }} />
                })}
              </div>

              {tasks.map((t, ti) => {
                const rowBars = preBars
                  .filter(b => b.task_id === t.id)
                  .map(b => {
                    const s = diffDays(start, parseYmd(b.start_date!)) - c0
                    const e = diffDays(start, parseYmd(b.end_date!)) - c0
                    return { b, s, e }
                  })
                  .filter(x => x.e >= 0 && x.s < n)
                  .map(x => ({ ...x, cs: Math.max(0, x.s), ce: Math.min(n - 1, x.e) }))
                return (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: `${LEFT_W} 1fr`, height: ROW_H, borderBottom: '1px solid #e2e8f0', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc' }}>
                      <div style={{ width: '9%', textAlign: 'center', color: '#475569' }}>{ti + 1}</div>
                      <div style={{ width: '17%', fontSize: 9.5, color: '#475569', paddingLeft: 4 }}>{t.category}</div>
                      <div style={{ flex: 1, fontWeight: 700, paddingLeft: 4 }}>{t.name}</div>
                      <div style={{ width: '22%', fontSize: 10, color: '#475569', paddingLeft: 4 }}>{t.assignee}</div>
                    </div>
                    <div style={{
                      position: 'relative',
                      backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 0)',
                      backgroundSize: `${unit}% 100%`,
                    }}>
                      {rowBars.map(({ b, cs, ce }) => {
                        const next = rowBars.filter(o => o.b.id !== b.id && o.cs > ce).sort((x, y) => x.cs - y.cs)[0]
                        const cls = BAR_COLORS[b.color]?.cls || BAR_COLORS.gray.cls
                        // 右端に近いバーは、ラベルが切れないよう右端そろえで左へ広げて表示する
                        const nearEnd = !next && n - cs < 4
                        const labelFrom = nearEnd ? Math.max(0, n - 4) : cs
                        const labelCols = (next ? next.cs : n) - labelFrom
                        return (
                          <div key={b.id}>
                            <div className={cls} style={{ position: 'absolute', top: 3, bottom: 3, left: `${cs * unit}%`, width: `${(ce - cs + 1) * unit}%`, zIndex: 2 }} />
                            {/* ラベルはバーより長くても、次のバーにぶつかる手前まで表示する */}
                            <div style={{
                              position: 'absolute', top: 3, bottom: 3, left: `${labelFrom * unit}%`, width: `${labelCols * unit}%`, zIndex: 3,
                              display: 'flex', alignItems: 'center', justifyContent: nearEnd ? 'flex-end' : 'flex-start', padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 9.5, fontWeight: 500,
                            }}>{barText(b.label, b.color, daysExcludingBreaks(parseYmd(b.start_date!), parseYmd(b.end_date!)), 'day')}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {tasks.length === 0 && <div style={{ height: ROW_H, fontSize: 11, color: '#94a3b8', padding: '6px 10px' }}>タスクがありません</div>}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>
        ※ 青＝土曜、赤＝日曜、黄＝大型連休（GW・お盆・シルバーウィーク・年末年始）、水色＝OPEN日
      </div>
    </FitToPage>
  )
}
