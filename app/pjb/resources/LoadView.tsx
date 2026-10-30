'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  RESOURCE_ROLES, PHASES, PHASE_LABEL, PHASE_SHORT, PHASE_COLOR, compute, forecast, levelOf, monthRange, phaseAt, resolveCoefs, fmtFte, fmtMonth, phaseLabelFor,
  type Computed, type Level, type Phase, type ProjectRow, type ResourceRole, type ResourceSettings, type Timeline,
} from '@/lib/pjb/resource'
import type { AssignmentRow, RoughBar, StaffRow } from '@/lib/pjb/resource'

const LEVEL_CLS: Record<Level, string> = {
  none: 'text-slate-300',
  spare: 'bg-emerald-50 text-emerald-800',
  normal: 'bg-slate-50 text-slate-800',
  warn: 'bg-amber-100 text-amber-900',
  danger: 'bg-rose-200 text-rose-900 font-semibold',
}
const NEUTRAL_CLS = 'bg-slate-50 text-slate-800'

type Sel = { who: string; mi: number }   // who: staffId または 'team'

export default function LoadView({
  projects, assignments, staff, bars, settings,
}: { projects: ProjectRow[]; assignments: AssignmentRow[]; staff: StaffRow[]; bars: RoughBar[]; settings: ResourceSettings }) {
  const [span, setSpan] = useState<6 | 12 | 24>(12)
  const [roleFilter, setRoleFilter] = useState<'all' | ResourceRole>('all')
  const [sel, setSel] = useState<Sel | null>(null)
  const [showGantt, setShowGantt] = useState(false)

  const today = useMemo(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1) }, [])
  // 予測は、表示の長さに関係なく、常に24か月先まで見る
  const months24 = useMemo(() => monthRange(today, 24), [today])
  const activeStaff = useMemo(() => staff.filter(s => s.active), [staff])
  const comp = useMemo(() => compute(projects, assignments, activeStaff, bars, settings, months24), [projects, assignments, activeStaff, bars, settings, months24])
  const fc = useMemo(() => forecast(comp, activeStaff, settings, today), [comp, activeStaff, settings, today])
  const shown = months24.slice(0, span)

  const activeProjects = projects.filter(p => p.status === '進行中')
  const notStarted = comp.counted.filter(p => { const tl = comp.timelines.get(p.id)!; return tl.planStart && tl.planStart > new Date() }).length

  // 今月の状況
  const nowStats = useMemo(() => {
    let max = { name: '—', load: 0, cap: 0 }, tight = 0, spare = 0
    for (const s of activeStaff) {
      const load = comp.cells.get(s.id)![0].load, cap = comp.capacity.get(s.id)![0]
      if (load > max.load) max = { name: s.name, load, cap }
      const lv = levelOf(load, cap, settings)
      if (lv === 'warn' || lv === 'danger') tight++
      if (lv === 'spare' && cap > 0) spare++
    }
    return { max, tight, spare }
  }, [comp, activeStaff, settings])

  const hasData = activeStaff.length > 0 && assignments.length > 0
  const cellLoad = (id: string, mi: number) => {
    const c = comp.cells.get(id)![mi]
    return roleFilter === 'all' ? c.load : c.items.filter(i => i.role === roleFilter).reduce((t, i) => t + i.load, 0)
  }

  // 結論の帯
  const banner = (() => {
    if (!hasData) return { tone: 'slate', title: '担当者と案件の割り当てを入れると、ここに「足りているか」が出ます', body: '「担当割り当て」と「設定」のタブで、担当者の登録と案件への割り当てができます。' }
    const target = fc.runs.find(r => r.structural) ?? fc.first
    if (!target) return { tone: 'green', title: '今後24か月、現在の人員で対応できる見込みです', body: '', }
    const sm = months24[target.start]
    const when = fmtMonth(sm)
    if (target.structural) {
      const hire = fc.hireBy ? (fc.hireNow ? 'すでに採用の検討を始める目安の時期です' : `採用の検討開始は${fmtMonth(fc.hireBy)}ごろが目安です`) : ''
      return { tone: 'amber', title: `${when}から人員が不足する見込みです（${target.months}か月続く構造的な不足）`, body: `不足は最大 +${fmtFte(target.peak)} FTE。${hire}（採用リードタイム${settings.hire_lead_months}か月・参考情報です）` }
    }
    return { tone: 'slate', title: `${when}に一時的な不足があります（${target.months}か月）`, body: `不足は最大 +${fmtFte(target.peak)} FTE。つづく期間が短いので、採用よりも再配置や外注での対応を先に検討できます。` }
  })()
  const toneCls = { green: 'border-l-emerald-500', amber: 'border-l-amber-500', slate: 'border-l-slate-400' }[banner.tone as 'green' | 'amber' | 'slate']

  const unscheduledCount = comp.unscheduled.length

  return (
    <div>
      <div className={`rounded-xl border border-slate-200 border-l-4 ${toneCls} bg-white px-4 py-3 mb-3`}>
        <div className="text-[12px] text-slate-500 mb-0.5">現在の人員で足りているか</div>
        <div className="text-[16px] font-semibold text-slate-900">{banner.title}</div>
        {banner.body && <div className="text-[13px] text-slate-600 mt-0.5">{banner.body}</div>}
        {unscheduledCount > 0 && (
          <div className="text-[12.5px] text-amber-800 mt-1">スケジュール未設定の進行中案件が{unscheduledCount}件あり、集計に入っていません。実際の負荷はこの表より大きい可能性があります。</div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Tile label="進行中の案件" value={`${activeProjects.length}件`} sub={`うち未着手 ${notStarted}件／集計に入っている ${comp.counted.length}件`} />
        <Tile label="今月の最大負荷" value={nowStats.max.load > 0 ? `${fmtFte(nowStats.max.load)} FTE` : '—'} sub={nowStats.max.load > 0 ? `${nowStats.max.name}（適正 ${fmtFte(nowStats.max.cap)}）` : undefined} tone={nowStats.max.load > 0 ? levelTone(levelOf(nowStats.max.load, nowStats.max.cap, settings)) : undefined} />
        <Tile label="今月の逼迫／余力" value={`${nowStats.tight}名 ／ ${nowStats.spare}名`} sub="適正FTEを超えている人／下回る人" tone={nowStats.tight > 0 ? 'warn' : undefined} />
        <Tile label="最初に不足する月" value={fc.first ? fmtMonth(months24[fc.first.start]) : 'なし'} sub={fc.first ? `チーム全体で最大 +${fmtFte(fc.first.peak)} FTE` : '24か月先まで'} tone={fc.first ? 'warn' : 'good'} />
        <Tile label="採用検討の開始目安" value={fc.hireBy ? (fc.hireNow ? '今すぐ' : fmtMonth(fc.hireBy)) : '不要'} sub={fc.hireBy ? `約${fc.hires}名分（参考）` : '構造的な不足なし'} tone={fc.hireBy ? 'warn' : 'good'} />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <h2 className="text-[15px] font-semibold text-slate-900">月別の負荷（担当者×月）</h2>
          <span className="text-[12px] text-slate-400">数字を押すと、内訳が出ます</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Seg value={roleFilter} onChange={v => setRoleFilter(v)} options={[['all', 'すべて'], ...RESOURCE_ROLES.map(r => [r, r] as [string, string])]} />
            <Seg value={String(span)} onChange={v => setSpan(Number(v) as 6 | 12 | 24)} options={[['6', '6か月'], ['12', '12か月'], ['24', '24か月']]} />
          </div>
        </div>

        {activeStaff.length === 0 ? (
          <div className="text-[13px] text-slate-500 py-6 text-center">担当者がまだ登録されていません。「設定」のタブから追加してください。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-[13px] border-separate border-spacing-0.5 min-w-full">
              <thead>
                <tr className="text-slate-500 text-[12px]">
                  <th className="sticky left-0 bg-white z-10 text-left font-medium px-2 py-1 min-w-[6rem]">担当者</th>
                  <th className="sticky left-24 bg-white z-10 text-right font-medium px-2 py-1 w-14">適正</th>
                  {shown.map((m, i) => (
                    <th key={i} className={`font-medium px-1 py-1 min-w-[3.4rem] ${i === 0 ? 'text-slate-900' : ''}`}>
                      {m.getMonth() === 0 || i === 0 ? <span className="block text-[10.5px] text-slate-400 leading-none">{m.getFullYear()}</span> : null}
                      {m.getMonth() + 1}月
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeStaff.map(s => (
                  <tr key={s.id}>
                    <td className="sticky left-0 bg-white z-10 px-2 py-1 whitespace-nowrap text-slate-800">{s.name}</td>
                    <td className="sticky left-24 bg-white z-10 px-2 py-1 text-right tabular-nums text-slate-500">{fmtFte(s.capacity_fte)}</td>
                    {shown.map((_, mi) => {
                      const load = cellLoad(s.id, mi)
                      const cap = comp.capacity.get(s.id)![mi]
                      const lv = roleFilter === 'all' ? levelOf(load, cap, settings) : (load > 0 ? 'normal' : 'none')
                      const isSel = sel?.who === s.id && sel.mi === mi
                      return (
                        <td key={mi} className="p-0">
                          <button
                            onClick={() => setSel(isSel ? null : { who: s.id, mi })}
                            className={`w-full rounded px-1 py-1.5 tabular-nums ${roleFilter === 'all' ? LEVEL_CLS[lv] : (load > 0 ? NEUTRAL_CLS : 'text-slate-300')} ${isSel ? 'ring-2 ring-slate-700' : 'hover:ring-1 hover:ring-slate-400'}`}
                            title={cap > 0 ? `適正 ${fmtFte(cap)} FTE` : '在籍していない月'}
                          >{load > 0.0001 ? fmtFte(load) : '–'}</button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 bg-white z-10 px-2 pt-2 font-semibold text-slate-900 whitespace-nowrap border-t border-slate-200">チーム合計</td>
                  <td className="sticky left-24 bg-white z-10 px-2 pt-2 text-right tabular-nums text-slate-500 border-t border-slate-200">{fmtFte(comp.team[0].cap)}</td>
                  {shown.map((_, mi) => {
                    const t = comp.team[mi]
                    const load = roleFilter === 'all' ? t.load : t.byRole[roleFilter]
                    const lv = roleFilter === 'all' ? levelOf(t.load, t.cap, settings) : 'normal'
                    const isSel = sel?.who === 'team' && sel.mi === mi
                    return (
                      <td key={mi} className="p-0 pt-1.5 border-t border-slate-200">
                        <button onClick={() => setSel(isSel ? null : { who: 'team', mi })}
                          className={`w-full rounded px-1 py-1.5 tabular-nums font-semibold ${roleFilter === 'all' ? LEVEL_CLS[lv] : NEUTRAL_CLS} ${isSel ? 'ring-2 ring-slate-700' : ''}`}>{fmtFte(load)}</button>
                      </td>
                    )
                  })}
                </tr>
                {roleFilter === 'all' && (
                  <tr>
                    <td className="sticky left-0 bg-white z-10 px-2 py-0.5 text-[12px] text-slate-500 whitespace-nowrap">余力（＋）／不足（−）</td>
                    <td className="sticky left-24 bg-white z-10" />
                    {shown.map((_, mi) => {
                      const t = comp.team[mi]
                      const d = t.cap * settings.th_warn - t.load
                      return <td key={mi} className={`text-center text-[12px] tabular-nums ${d < -0.05 ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>{d > 0.05 ? `+${fmtFte(d)}` : d < -0.05 ? `−${fmtFte(-d)}` : '0.0'}</td>
                    })}
                  </tr>
                )}
                {unscheduledCount > 0 && (
                  <tr>
                    <td className="sticky left-0 bg-white z-10 px-2 py-1 text-[12px] text-slate-500 whitespace-nowrap">未設定の案件</td>
                    <td className="sticky left-24 bg-white z-10" />
                    <td colSpan={shown.length} className="p-0">
                      <div className="rounded px-2 py-1.5 text-[12px] text-slate-500" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 5px,#e2e8f0 5px,#e2e8f0 6px)' }}>
                        スケジュール未設定 {unscheduledCount}件は集計に入っていません（下の「要確認」を見てください）
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11.5px] text-slate-500">
          <Legend cls="bg-emerald-50 border border-emerald-200" text={`${Math.round(settings.th_spare * 100)}%未満（余力あり）`} />
          <Legend cls="bg-slate-50 border border-slate-200" text="通常" />
          <Legend cls="bg-amber-100" text={`${Math.round(settings.th_warn * 100)}%超（注意）`} />
          <Legend cls="bg-rose-200" text={`${Math.round(settings.th_danger * 100)}%超（重大）`} />
          {roleFilter !== 'all' && <span>※役割で絞っているときは、色を付けません（適正FTEは全役割の合計の目安のため）</span>}
        </div>

        {sel && <Breakdown comp={comp} sel={sel} staff={activeStaff} settings={settings} onClose={() => setSel(null)} />}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-2">将来の不足の見立て <span className="text-[12px] font-normal text-slate-400">参考情報です</span></h2>
          {!hasData ? <p className="text-[13px] text-slate-500">担当の割り当てが入ると、予測が出ます。</p> : fc.runs.length === 0 ? (
            <p className="text-[13px] text-slate-600">24か月先まで、チーム全体の負荷は適正FTEの範囲内です。</p>
          ) : (
            <div className="grid gap-2 text-[13px]">
              {fc.runs.map((r, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span className={`text-[11.5px] px-2 py-0.5 rounded-full border ${r.structural ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-300 text-slate-600'}`}>{r.structural ? '構造的' : '一時的'}</span>
                  <span className="font-medium text-slate-900">{fmtMonth(months24[r.start])}{r.months > 1 ? `〜${fmtMonth(months24[r.end])}` : ''}（{r.months}か月）</span>
                  <span className="text-slate-600">最大 +{fmtFte(r.peak)} FTE 不足</span>
                </div>
              ))}
              <div className="text-slate-600 leading-relaxed">
                <div>不足している役割（ピーク月の按分）：{RESOURCE_ROLES.filter(r => fc.roleShortage[r] > 0.04).map(r => `${r} +${fmtFte(fc.roleShortage[r])}`).join('、') || '—'}</div>
                {fc.hireBy && <div>採用の検討開始：<b className="font-medium text-slate-900">{fc.hireNow ? 'すでに目安の時期' : fmtMonth(fc.hireBy)}</b>（開始月の{settings.hire_lead_months}か月前）／目安 約{fc.hires}名（新人の適正 {fmtFte(settings.new_hire_fte)} FTEで計算）</div>}
                <div className="text-[12px] text-slate-400">{settings.structural_months}か月以上つづく不足を「構造的」、それより短いものを「一時的」としています（設定で変更できます）</div>
              </div>
            </div>
          )}
          {fc.reassign.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 text-[13px]">
              <div className="font-medium text-slate-800 mb-1">個人は超過でも、チームには余力がある月（再配置で対応できる可能性）</div>
              <ul className="grid gap-1 text-slate-600">
                {fc.reassign.slice(0, 5).map(r => (
                  <li key={r.month}>{fmtMonth(months24[r.month])}：{r.over.join('・')} が超過 ／ 余力 {r.spare.length ? r.spare.join('・') : 'なし'}</li>
                ))}
                {fc.reassign.length > 5 && <li className="text-slate-400">ほか {fc.reassign.length - 5}か月</li>}
              </ul>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-2">要確認 <span className="text-[12px] font-normal text-slate-400">データが足りない案件</span></h2>
          {comp.unscheduled.length === 0 && comp.unassigned.length === 0 ? (
            <p className="text-[13px] text-slate-600">進行中の案件は、すべて日程と担当が入っています。</p>
          ) : (
            <div className="grid gap-3 text-[13px]">
              {comp.unscheduled.length > 0 && (
                <div>
                  <div className="font-medium text-slate-800 mb-1">スケジュールが使えない（集計に入っていません）</div>
                  <ul className="grid gap-1">
                    {comp.unscheduled.map(p => (
                      <li key={p.id} className="flex flex-wrap gap-x-2">
                        <Link href={`/pjb/${p.id}/schedule`} className="text-blue-700 hover:underline">{p.name}</Link>
                        <span className="text-slate-500">{comp.timelines.get(p.id)!.reasons.join('／')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {comp.unassigned.length > 0 && (
                <div>
                  <div className="font-medium text-slate-800 mb-1">担当者が未設定の役割がある</div>
                  <ul className="grid gap-1">
                    {comp.unassigned.map(u => (
                      <li key={u.project.id} className="flex flex-wrap gap-x-2">
                        <Link href={`/pjb/${u.project.id}`} className="text-blue-700 hover:underline">{u.project.name}</Link>
                        <span className="text-slate-500">{u.roles.join('・')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <button onClick={() => setShowGantt(v => !v)} className="flex items-center gap-2 text-left w-full" aria-expanded={showGantt}>
          <span className={`text-slate-400 text-[11px] transition-transform ${showGantt ? 'rotate-90' : ''}`}>▶</span>
          <h2 className="text-[15px] font-semibold text-slate-900">案件別ガント <span className="text-[12px] font-normal text-slate-400">案件の期間とフェーズ（概算スケジュールから自動）</span></h2>
        </button>
        {showGantt && <Gantt projects={activeProjects} timelines={comp.timelines} months={shown} />}
      </section>
      <p className="text-[12px] text-slate-400 mt-3">
        月別負荷 ＝ フェーズ係数（役割ごと）× 負荷割合 × 案件別調整係数。月の途中でフェーズが変わるときは日数で按分します。FTEは社内の負荷を比べるための管理指標です。
      </p>
    </div>
  )
}

function levelTone(l: Level): 'good' | 'warn' | 'bad' | undefined {
  return l === 'danger' ? 'bad' : l === 'warn' ? 'warn' : l === 'spare' ? 'good' : undefined
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const accent = tone === 'bad' ? 'border-l-rose-500' : tone === 'warn' ? 'border-l-amber-400' : tone === 'good' ? 'border-l-emerald-500' : 'border-l-transparent'
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${accent} bg-white px-3.5 py-2.5`}>
      <div className="text-[12.5px] text-slate-500">{label}</div>
      <div className="text-[20px] leading-tight font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-[11.5px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[string, string]> }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[13px]">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k as T)} className={`px-2.5 py-1 rounded-md ${value === k ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600'}`}>{label}</button>
      ))}
    </div>
  )
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${cls}`} />{text}</span>
}

// 数字の内訳（案件×役割×フェーズ）。何が原因かを確認する
function Breakdown({ comp, sel, staff, settings, onClose }: { comp: Computed; sel: Sel; staff: StaffRow[]; settings: ResourceSettings; onClose: () => void }) {
  const month = comp.months[sel.mi]
  const coefs = resolveCoefs(settings)
  const isTeam = sel.who === 'team'
  const person = staff.find(s => s.id === sel.who)
  const cell = !isTeam ? comp.cells.get(sel.who)![sel.mi] : null
  const cap = isTeam ? comp.team[sel.mi].cap : comp.capacity.get(sel.who)![sel.mi]
  const total = isTeam ? comp.team[sel.mi].load : cell!.load
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[14px] font-semibold text-slate-900">{isTeam ? 'チーム合計' : person?.name}／{fmtMonth(month)}の内訳</div>
        <button onClick={onClose} className="ml-auto text-[12px] text-slate-500 hover:text-slate-800">閉じる ×</button>
      </div>
      {isTeam ? (
        <table className="w-full text-[13px]">
          <thead><tr className="text-slate-500 text-[12px]"><th className="text-left font-medium py-1">担当者</th><th className="text-right font-medium">適正</th><th className="text-right font-medium">負荷</th></tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} className="border-t border-slate-200">
                <td className="py-1">{s.name}</td>
                <td className="text-right tabular-nums text-slate-500">{fmtFte(comp.capacity.get(s.id)![sel.mi])}</td>
                <td className="text-right tabular-nums">{fmtFte(comp.cells.get(s.id)![sel.mi].load)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-300 font-semibold"><td className="py-1">合計</td><td className="text-right tabular-nums">{fmtFte(cap)}</td><td className="text-right tabular-nums">{fmtFte(total)}</td></tr>
          </tbody>
        </table>
      ) : cell!.items.length === 0 ? (
        <p className="text-[13px] text-slate-500">この月に負荷のある案件はありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-slate-500 text-[12px]"><th className="text-left font-medium py-1">案件</th><th className="text-left font-medium">役割</th><th className="text-left font-medium">フェーズ（月の中の割合×係数）</th><th className="text-right font-medium">負荷割合</th><th className="text-right font-medium">負荷</th></tr></thead>
            <tbody>
              {cell!.items.sort((a, b) => b.load - a.load).map((it, i) => (
                <tr key={i} className="border-t border-slate-200 align-top">
                  <td className="py-1 pr-2"><Link href={`/pjb/${it.projectId}`} className="text-blue-700 hover:underline">{it.projectName}</Link></td>
                  <td className="pr-2 whitespace-nowrap">{it.role}</td>
                  <td className="pr-2 text-slate-700">
                    {it.phases.map(p => `${phaseLabelFor(it.role, p.phase)}${it.phases.length > 1 ? ` ${Math.round(p.frac * 100)}%` : ''}（×${coefs[it.role][p.phase]}）`).join('、')}
                    {it.factor !== 1 && <span className="text-slate-500">　案件調整 ×{it.factor}</span>}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{Math.round(it.share * 100)}%</td>
                  <td className="text-right tabular-nums">{(Math.round(it.load * 100) / 100).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-300 font-semibold"><td colSpan={4} className="py-1">合計（適正 {fmtFte(cap)} FTE ／ {cap > 0 ? Math.round(total / cap * 100) : 0}%）</td><td className="text-right tabular-nums">{(Math.round(total * 100) / 100).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 案件別ガント：月ごとに、その月でいちばん長いフェーズの色を塗る
function Gantt({ projects, timelines, months }: { projects: ProjectRow[]; timelines: Map<string, Timeline>; months: Date[] }) {
  const dominant = (tl: Timeline, m: Date): Phase | null => {
    const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
    const cnt: Partial<Record<Phase, number>> = {}
    for (let i = 0; i < dim; i++) { const ph = phaseAt(tl, new Date(m.getFullYear(), m.getMonth(), 1 + i)); if (ph) cnt[ph] = (cnt[ph] || 0) + 1 }
    let best: Phase | null = null
    for (const p of PHASES) if (cnt[p] && (!best || cnt[p]! > cnt[best]!)) best = p
    return best
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-[12px] border-separate border-spacing-0.5 min-w-full">
        <thead>
          <tr className="text-slate-500">
            <th className="sticky left-0 bg-white z-10 text-left font-medium px-2 py-1 min-w-[12rem]">案件</th>
            {months.map((m, i) => <th key={i} className="font-medium px-1 min-w-[2.6rem]">{m.getMonth() === 0 || i === 0 ? <span className="block text-[10px] text-slate-400 leading-none">{m.getFullYear()}</span> : null}{m.getMonth() + 1}月</th>)}
          </tr>
        </thead>
        <tbody>
          {projects.map(p => {
            const tl = timelines.get(p.id)!
            return (
              <tr key={p.id}>
                <td className="sticky left-0 bg-white z-10 px-2 py-0.5 whitespace-nowrap max-w-[16rem] truncate"><Link href={`/pjb/${p.id}/schedule`} className="text-slate-800 hover:underline">{p.name}</Link></td>
                {tl.ok ? months.map((m, i) => {
                  const ph = dominant(tl, m)
                  return <td key={i} className="p-0"><div className={`h-5 rounded-sm ${ph ? PHASE_COLOR[ph] : ''}`} title={ph ? PHASE_SHORT[ph] : ''} /></td>
                }) : (
                  <td colSpan={months.length} className="p-0"><div className="h-5 rounded-sm text-[11px] text-slate-500 px-2 flex items-center" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 5px,#e2e8f0 5px,#e2e8f0 6px)' }}>未設定：{tl.reasons[0]}</div></td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11.5px] text-slate-500">
        {PHASES.map(p => <Legend key={p} cls={PHASE_COLOR[p]} text={PHASE_LABEL[p]} />)}
      </div>
    </div>
  )
}
