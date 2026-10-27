'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BUSINESSES, STAFF_FIELDS, normalizeBusiness, type StaffKey } from '@/lib/pjb/constants'
import { fiscalYearOf, currentFiscal, dateToMonthInput, monthInputToDate } from '@/lib/pjb/fiscal'
import { logActivity } from '@/lib/pjb/activity'
import { isCommitEnter } from './ui'
import type { Project } from '@/lib/pjb/types'

// 案件の基本情報：事業・売上計上月・担当者（進行管理／品質管理／設計会社／施工会社／クライアント）。すべて任意で、いつでも編集できる
function Field({ label, value, onSave, list, type = 'text' }: { label: string; value: string; onSave: (v: string) => void; list?: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <label className="grid gap-1">
      <span className="text-[12px] text-slate-500">{label}</span>
      <input
        type={type} list={list} value={v} placeholder="未設定"
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v) }}
        onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
        className="border border-slate-200 rounded-lg px-3 py-2 text-[14px] bg-white"
      />
    </label>
  )
}

export default function ProjectInfoPanel({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [people, setPeople] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])

  // 入力の候補（これまでに入れた名前）
  useEffect(() => {
    supabase.from('pjb_projects').select('pm_name, qa_name, design_company, contractor_company, client_name').then(({ data, error }) => {
      if (error || !data) return
      const uniq = (xs: Array<string | null | undefined>) => Array.from(new Set(xs.filter((x): x is string => !!x && x.trim() !== ''))).sort()
      const rows = data as Array<Record<string, string | null>>
      setPeople(uniq(rows.flatMap(r => [r.pm_name, r.qa_name])))
      setCompanies(uniq(rows.flatMap(r => [r.design_company, r.contractor_company, r.client_name])))
    })
  }, [])

  const save = async (patch: Partial<Project>, label: string, before: unknown, after: unknown) => {
    const { error } = await supabase.from('pjb_projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', project.id)
    if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ017・018を実行していない場合は、先に実行してください）`); return }
    await logActivity({ projectId: project.id, action: 'update', entityType: 'project', entityLabel: label, before: String(before ?? ''), after: String(after ?? '') })
    onChanged()
  }

  const fy = fiscalYearOf(project.sales_month)
  const nowFy = currentFiscal().year

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5">
      <datalist id="pjb-people">{people.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="pjb-companies">{companies.map(p => <option key={p} value={p} />)}</datalist>
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <span className="text-[14px] font-semibold text-slate-900">案件情報</span>
        <span className="text-[12px] text-slate-400">担当者・売上計上月は任意です。あとからいつでも入力・変更できます</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-[12px] text-slate-500">事業</span>
          <select
            value={project.business ? normalizeBusiness(project.business) : ''}
            onChange={e => save({ business: e.target.value || null }, '事業', project.business || '未分類', e.target.value || '未分類')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[14px] bg-white"
          >
            <option value="">未分類</option>
            {BUSINESSES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <div className="grid gap-1">
          <Field
            label="売上計上月（その月に売上が立つ）" type="month" value={dateToMonthInput(project.sales_month)}
            onSave={v => save({ sales_month: monthInputToDate(v) }, '売上計上月', project.sales_month, monthInputToDate(v))}
          />
          {fy !== null && (
            <span className={`text-[12px] ${fy === nowFy ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {fy}年度{fy === nowFy ? '（今期売上）' : ''}
            </span>
          )}
        </div>
        <span className="hidden lg:block" />
        {STAFF_FIELDS.map(f => (
          <Field
            key={f.key} label={f.label} value={(project[f.key as StaffKey] as string | null | undefined) ?? ''}
            list={f.kind === 'person' ? 'pjb-people' : 'pjb-companies'}
            onSave={v => save({ [f.key]: v.trim() || null } as Partial<Project>, f.label, project[f.key as StaffKey], v.trim())}
          />
        ))}
      </div>
    </div>
  )
}
