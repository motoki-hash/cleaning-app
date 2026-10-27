'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import TopShell from '../components/TopShell'
import { useProjectCards } from '@/lib/pjb/useProjectCards'
import { formatYen } from '@/lib/pjb/format'
import { fiscalYearOf, currentFiscal } from '@/lib/pjb/fiscal'

type Role = 'pm_name' | 'qa_name'
const ROLES: { key: Role; label: string }[] = [
  { key: 'pm_name', label: '進行管理' },
  { key: 'qa_name', label: '品質管理' },
]

export default function ResourcesPage() {
  const { cards, loading } = useProjectCards(true)
  const [role, setRole] = useState<Role>('pm_name')
  const [onlyActive, setOnlyActive] = useState(true)
  const fy = currentFiscal().year

  const groups = useMemo(() => {
    const pool = cards.filter(c => !onlyActive || c.project.status === '進行中')
    const map = new Map<string, typeof cards>()
    for (const c of pool) {
      const name = (c.project[role] || '').trim() || '（未設定）'
      map.set(name, [...(map.get(name) || []), c])
    }
    return Array.from(map.entries())
      .map(([name, list]) => ({
        name,
        list,
        rooms: list.reduce((s, c) => s + (c.project.room_count || 0), 0),
        sell: list.reduce((s, c) => s + c.bnsSell, 0),
        profit: list.reduce((s, c) => s + c.grossProfit, 0),
        thisFy: list.filter(c => fiscalYearOf(c.project.sales_month) === fy).length,
      }))
      .sort((a, b) => (a.name === '（未設定）' ? 1 : b.name === '（未設定）' ? -1 : b.list.length - a.list.length))
  }, [cards, role, onlyActive, fy])

  const max = Math.max(1, ...groups.map(g => g.list.length))

  return (
    <TopShell active="resources">
      <div className="max-w-5xl mx-auto px-4 py-5 pb-24">
        <h1 className="text-[20px] font-semibold text-slate-900 mb-1">リソース管理</h1>
        <p className="text-[13px] text-slate-500 mb-4">担当者ごとの持ち案件と部屋数です。担当者は各案件の画面の「案件情報」から入力できます。</p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setRole(r.key)}
              className={`px-3.5 py-1.5 rounded-full text-[14px] border ${role === r.key ? 'bg-[#17382f] text-white border-[#17382f]' : 'bg-white text-slate-600 border-slate-200'}`}>
              {r.label}別
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[13px] text-slate-600">
            <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
            進行中の案件だけ
          </label>
        </div>

        {loading ? <div className="text-slate-500 text-[14px]">読み込み中…</div> : groups.length === 0 ? (
          <div className="text-slate-500 text-[14px] bg-white rounded-xl border border-slate-200 p-6">対象の案件がありません。</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
              <div className="text-[13px] font-semibold text-slate-700 mb-2">担当者ごとの案件数</div>
              <div className="grid gap-1.5">
                {groups.map(g => (
                  <div key={g.name} className="grid grid-cols-[7rem_1fr_9rem] items-center gap-2 text-[13px]">
                    <span className="truncate text-slate-700">{g.name}</span>
                    <span className="h-3 rounded bg-slate-100 overflow-hidden">
                      <span className="block h-full bg-emerald-600" style={{ width: `${(g.list.length / max) * 100}%` }} />
                    </span>
                    <span className="text-slate-500 text-right">{g.list.length}件／{g.rooms}室</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {groups.map(g => (
                <section key={g.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <h2 className="text-[16px] font-semibold text-slate-900">{g.name}</h2>
                    <span className="text-[13px] text-slate-600">{g.list.length}件</span>
                    <span className="text-[13px] text-slate-600">合計 {g.rooms}室</span>
                    <span className="text-[13px] text-slate-600">今期売上 {g.thisFy}件</span>
                    <span className="text-[13px] text-slate-600 ml-auto">BNS売上 {formatYen(g.sell)}／利益 {formatYen(g.profit)}</span>
                  </header>
                  <ul>
                    {g.list.map(c => (
                      <li key={c.project.id} className="border-b border-slate-100 last:border-b-0">
                        <Link href={`/pjb/${c.project.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-slate-50">
                          <span className="text-[14px] font-medium text-slate-900 truncate">{c.project.name}</span>
                          <span className="text-[13px] text-slate-600 text-right">{c.project.room_count || 0}室</span>
                          <span className="text-[12px] text-slate-500 truncate">
                            {c.business}／{c.project.status}
                            {c.project.sales_month ? `／売上 ${c.project.sales_month.slice(0, 7).replace('-', '年')}月` : ''}
                            {fiscalYearOf(c.project.sales_month) === fy ? '（今期）' : ''}
                          </span>
                          <span className="text-[12px] text-slate-500 text-right">
                            {ROLES.filter(r => r.key !== role).map(r => c.project[r.key] ? `${r.label} ${c.project[r.key]}` : '').filter(Boolean).join('／')}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </TopShell>
  )
}
