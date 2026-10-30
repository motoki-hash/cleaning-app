'use client'

import { periodName } from '@/lib/pjb/periods'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AssigneeEditor } from '../components/AssigneeEditor'
import { buildTimeline, type AssignmentRow, type ProjectRow, type RoughBar, type StaffRow } from '@/lib/pjb/resource'

// 案件ごとの担当割り当て（役割別・複数名OK）。案件ページの「案件情報」と同じ内容を、ここで一覧して直せる
export default function AssignView({
  projects, staff, assignments, bars, onChanged,
}: { projects: ProjectRow[]; staff: StaffRow[]; assignments: AssignmentRow[]; bars: RoughBar[]; onChanged: () => void }) {
  const [onlyActive, setOnlyActive] = useState(true)
  const list = useMemo(() => projects.filter(p => !onlyActive || p.status === '進行中'), [projects, onlyActive])

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[13px] text-slate-500">役割ごとに、担当者を追加します。同じ役割に2名以上入れると、負荷は均等に分けます（％を入れると、その割合にできます）。</p>
        <label className="ml-auto flex items-center gap-1.5 text-[13px] text-slate-600 whitespace-nowrap">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />進行中の案件だけ
        </label>
      </div>
      {staff.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[13px] px-4 py-3 mb-3">まだ担当者がいません。各行の「＋ 追加」から「新しい人を登録…」を選ぶか、「設定」のタブで登録してください。</div>}
      <div className="grid gap-3">
        {list.map(p => {
          const tl = buildTimeline(p, bars.filter(b => b.project_id === p.id))
          return (
            <section key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <Link href={`/pjb/${p.id}`} className="text-[15px] font-semibold text-slate-900 hover:underline">{periodName(p.name, p.period_label)}</Link>
                <span className="text-[12px] text-slate-500">{p.status}</span>
                {p.status === '進行中' && (tl.ok
                  ? <span className="text-[12px] text-emerald-700">日程OK</span>
                  : <Link href={`/pjb/${p.id}/schedule`} className="text-[12px] text-amber-700 hover:underline">日程が未設定：{tl.reasons.join('／')}</Link>)}
              </div>
              <AssigneeEditor project={p} staff={staff} assignments={assignments} onChanged={onChanged} />
            </section>
          )
        })}
        {list.length === 0 && <div className="text-[13px] text-slate-500 bg-white rounded-xl border border-slate-200 p-6">対象の案件がありません。</div>}
      </div>
    </div>
  )
}
