'use client'

import { useState } from 'react'
import TopShell from '../components/TopShell'
import { useResourceData } from '@/lib/pjb/useResourceData'
import LoadView from './LoadView'
import HoldingsView from './HoldingsView'
import AssignView from './AssignView'
import SettingsView from './SettingsView'

const TABS = [
  { key: 'load', label: '負荷予測' },
  { key: 'assign', label: '担当割り当て' },
  { key: 'holdings', label: '持ち案件' },
  { key: 'settings', label: '設定' },
] as const
type TabKey = typeof TABS[number]['key']

export default function ResourcesPage() {
  const [tab, setTab] = useState<TabKey>('load')
  const { data, loading, reload } = useResourceData()

  return (
    <TopShell active="resources">
      <div className="max-w-[1240px] mx-auto px-4 py-5 pb-24">
        <h1 className="text-[20px] font-semibold text-slate-900 mb-1">リソース管理</h1>
        <p className="text-[13px] text-slate-500 mb-4">コンストラクション事業部の人員が、いつ・誰に負荷が集中し、現状の人員で対応できるかを見ます。案件の日程と担当者から自動で集計します。</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-full text-[14px] border ${tab === t.key ? 'bg-[#17382f] text-white border-[#17382f]' : 'bg-white text-slate-600 border-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'holdings' ? <HoldingsView /> : loading || !data ? (
          <div className="text-slate-500 text-[14px]">読み込み中…</div>
        ) : !data.tablesReady ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[14px] px-4 py-3">
            リソース管理の準備がまだです。Supabase の SQL Editor で <b>supabase-pj-budget-patch-021.sql</b> を実行してください（既存の進行管理・品質管理の名前は、自動で取り込まれます）。
          </div>
        ) : tab === 'load' ? (
          <LoadView projects={data.projects} assignments={data.assignments} staff={data.staff} bars={data.bars} settings={data.settings} />
        ) : tab === 'assign' ? (
          <AssignView projects={data.projects} staff={data.staff} assignments={data.assignments} bars={data.bars} onChanged={reload} />
        ) : (
          <SettingsView staff={data.staff} settings={data.settings} onChanged={reload} />
        )}
      </div>
    </TopShell>
  )
}
