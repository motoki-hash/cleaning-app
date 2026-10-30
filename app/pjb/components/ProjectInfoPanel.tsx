'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BUSINESSES, STAFF_FIELDS, normalizeBusiness, type StaffKey } from '@/lib/pjb/constants'
import { fiscalYearOf, currentFiscal, dateToMonthInput, monthInputToDate } from '@/lib/pjb/fiscal'
import { logActivity } from '@/lib/pjb/activity'
import { isCommitEnter } from './ui'
import { ProjectAssignees } from './AssigneeEditor'
import type { Project } from '@/lib/pjb/types'

// 案件の基本情報：事業・売上計上月・担当者（進行管理／品質管理／設計会社／施工会社／クライアント）。すべて任意で、いつでも編集できる
function Field({ label, hint, hintTone, value, onSave, list, type = 'text' }: { label: string; hint?: string; hintTone?: 'accent'; value: string; onSave: (v: string) => void; list?: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <label className="grid gap-1 content-start">
      <span className="flex items-baseline justify-between gap-2 text-[12px] text-slate-500">
        <span>{label}</span>
        {hint && <span className={hintTone === 'accent' ? 'text-emerald-700 font-medium' : 'text-slate-400'}>{hint}</span>}
      </span>
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
    if (error) { alert(`保存に失敗しました：${error.message}（SQLパッチ017・018・021を実行していない場合は、先に実行してください）`); return }
    await logActivity({ projectId: project.id, action: 'update', entityType: 'project', entityLabel: label, before: String(before ?? ''), after: String(after ?? '') })
    onChanged()
  }

  const fy = fiscalYearOf(project.sales_month)
  const nowFy = currentFiscal().year

  const staffField = (f: typeof STAFF_FIELDS[number]) => (
    <Field
      key={f.key} label={f.label} value={(project[f.key as StaffKey] as string | null | undefined) ?? ''}
      list={f.kind === 'person' ? 'pjb-people' : 'pjb-companies'}
      onSave={v => save({ [f.key]: v.trim() || null } as Partial<Project>, f.label, project[f.key as StaffKey], v.trim())}
    />
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5">
      <datalist id="pjb-people">{people.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="pjb-companies">{companies.map(p => <option key={p} value={p} />)}</datalist>
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <span className="text-[14px] font-semibold text-slate-900">案件情報</span>
        <span className="text-[12px] text-slate-400">担当者・売上計上月は任意です。あとからいつでも入力・変更できます</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 content-start">
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
        <Field
          label="売上計上月（その月に売上が立つ）" type="month" value={dateToMonthInput(project.sales_month)}
          hint={fy !== null ? `${fy}年度${fy === nowFy ? '（今期売上）' : ''}` : undefined} hintTone={fy === nowFy ? 'accent' : undefined}
          onSave={v => save({ sales_month: monthInputToDate(v) }, '売上計上月', project.sales_month, monthInputToDate(v))}
        />
        {STAFF_FIELDS.filter(f => f.key !== 'pm_name' && f.key !== 'qa_name').map(f => staffField(f))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="text-[13px] font-semibold text-slate-700 mb-2">社内の担当者 <span className="font-normal text-slate-400">（役割ごとに複数名OK。リソース管理の負荷計算に使います）</span></div>
        <ProjectAssignees
          project={project} onChanged={onChanged}
          fallback={<div className="grid gap-3 sm:grid-cols-2">{STAFF_FIELDS.filter(f => f.key === 'pm_name' || f.key === 'qa_name').map(f => staffField(f))}</div>}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="text-[13px] font-semibold text-slate-700 mb-2">リソース管理用 <span className="font-normal text-slate-400">（任意。工程・OPEN日はスケジュールから自動で取ります）</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="ステイ期間の開始月" type="month" value={dateToMonthInput(project.stay_start)}
            onSave={v => save({ stay_start: monthInputToDate(v) }, 'ステイ期間の開始月', project.stay_start, monthInputToDate(v))}
          />
          <Field
            label="ステイ期間の終了月" type="month" value={dateToMonthInput(project.stay_end)}
            onSave={v => save({ stay_end: monthInputToDate(v) }, 'ステイ期間の終了月', project.stay_end, monthInputToDate(v))}
          />
          <Field
            label="案件別調整係数（空欄＝1.0）" value={project.load_factor == null ? '' : String(project.load_factor)}
            onSave={v => {
              const t = v.trim()
              if (t !== '' && (isNaN(Number(t)) || Number(t) < 0)) { alert('0以上の数字で入力してください（例：1.2）'); return }
              save({ load_factor: t === '' ? null : Number(t) }, '案件別調整係数', project.load_factor, t)
            }}
          />
        </div>
      </div>
    </div>
  )
}
