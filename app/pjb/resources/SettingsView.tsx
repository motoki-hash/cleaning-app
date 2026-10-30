'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isCommitEnter } from '../components/ui'
import {
  DEFAULT_COEFS, PHASES, PHASE_LABEL, RESOURCE_ROLES, phaseLabelFor, resolveCoefs,
  type Phase, type ResourceRole, type ResourceSettings, type StaffRow,
} from '@/lib/pjb/resource'

// 担当者・係数・閾値・採用リードタイムの編集。変えると、負荷予測にすぐ反映される
function NumInput({ value, onCommit, width = 'w-16', step = 'any', suffix, allowEmpty }: { value: number | null; onCommit: (v: number | null) => void; width?: string; step?: string; suffix?: string; allowEmpty?: boolean }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const t = v.trim()
    if (t === '') { if (allowEmpty && value !== null) onCommit(null); else setV(value == null ? '' : String(value)); return }
    const n = Number(t)
    if (isNaN(n) || n < 0) { setV(value == null ? '' : String(value)); return }
    if (n !== value) onCommit(n)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={v} onChange={e => setV(e.target.value)} onBlur={commit} inputMode="decimal" step={step}
        onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
        className={`${width} text-right border border-slate-200 rounded-md px-2 py-1 text-[13.5px] tabular-nums bg-white`}
      />
      {suffix && <span className="text-[12.5px] text-slate-500">{suffix}</span>}
    </span>
  )
}

export default function SettingsView({
  staff, settings, onChanged,
}: { staff: StaffRow[]; settings: ResourceSettings; onChanged: () => void }) {
  const coefs = resolveCoefs(settings)
  const [newName, setNewName] = useState('')
  const [newFte, setNewFte] = useState('3')

  const saveSettings = async (patch: Partial<ResourceSettings>) => {
    const { error } = await supabase.from('pjb_resource_settings').upsert({ id: 1, ...patchToRow(settings, patch), updated_at: new Date().toISOString() })
    if (error) { alert(`保存できませんでした：${error.message}`); return }
    onChanged()
  }
  const setCoef = (role: ResourceRole, phase: Phase, v: number) =>
    saveSettings({ phase_coefs: { ...settings.phase_coefs, [role]: { ...resolveCoefs(settings)[role], [phase]: v } } })
  const resetCoefs = () => { if (confirm('係数の表を、初期値に戻します。よろしいですか？')) saveSettings({ phase_coefs: {} }) }

  const updateStaff = async (s: StaffRow, patch: Partial<StaffRow>) => {
    const { error } = await supabase.from('pjb_staff').update(patch).eq('id', s.id)
    if (error) { alert(`保存できませんでした：${error.message}`); return }
    onChanged()
  }
  const addStaff = async () => {
    const name = newName.trim()
    if (!name) return
    const fte = Number(newFte)
    const { error } = await supabase.from('pjb_staff').insert({ name, capacity_fte: isNaN(fte) ? 3 : fte, sort_order: staff.length })
    if (error) { alert(`追加できませんでした：${error.message.includes('duplicate') ? '同じ名前の人がいます' : error.message}`); return }
    setNewName('')
    onChanged()
  }
  const removeStaff = async (s: StaffRow) => {
    if (!confirm(`${s.name}さんを削除します。この人の案件への割り当ても消えます。\n退職・異動なら、削除せず「在籍の終了日」を入れてください。削除しますか？`)) return
    const { error } = await supabase.from('pjb_staff').delete().eq('id', s.id)
    if (error) { alert(`削除できませんでした：${error.message}`); return }
    onChanged()
  }

  const card = 'bg-white rounded-xl border border-slate-200 p-4 mb-4'
  return (
    <div>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">担当者</h2>
        <p className="text-[12.5px] text-slate-500 mb-3">適正FTEは、その人が無理なく持てる負荷の目安です（社内の負荷を比べるための指標）。退職・異動は「在籍の終了日」、産休などで一時的に外れるときは「使わない」にします。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-slate-500 text-[12px]">
                <th className="font-medium py-1 pr-3">名前</th><th className="font-medium pr-3">適正FTE</th><th className="font-medium pr-3">在籍の開始日</th><th className="font-medium pr-3">在籍の終了日</th><th className="font-medium pr-3">使う</th><th />
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 font-medium text-slate-900 whitespace-nowrap">{s.name}</td>
                  <td className="pr-3"><NumInput value={s.capacity_fte} onCommit={v => updateStaff(s, { capacity_fte: v ?? 0 })} /></td>
                  <td className="pr-3"><input type="date" defaultValue={s.joined_on ?? ''} onBlur={e => { if ((e.target.value || null) !== s.joined_on) updateStaff(s, { joined_on: e.target.value || null }) }} className="border border-slate-200 rounded-md px-2 py-1 text-[13px]" /></td>
                  <td className="pr-3"><input type="date" defaultValue={s.left_on ?? ''} onBlur={e => { if ((e.target.value || null) !== s.left_on) updateStaff(s, { left_on: e.target.value || null }) }} className="border border-slate-200 rounded-md px-2 py-1 text-[13px]" /></td>
                  <td className="pr-3"><input type="checkbox" checked={s.active} onChange={e => updateStaff(s, { active: e.target.checked })} /></td>
                  <td className="text-right"><button onClick={() => removeStaff(s)} className="text-[12px] text-slate-400 hover:text-rose-600">削除</button></td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-500">まだ担当者がいません。下で追加してください。</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="名前" onKeyDown={e => { if (isCommitEnter(e)) addStaff() }} className="border border-slate-200 rounded-md px-2.5 py-1.5 text-[13.5px] w-40" />
          <input value={newFte} onChange={e => setNewFte(e.target.value)} inputMode="decimal" className="border border-slate-200 rounded-md px-2 py-1.5 text-[13.5px] w-16 text-right" />
          <span className="text-[12.5px] text-slate-500">FTE</span>
          <button onClick={addStaff} className="px-3 py-1.5 rounded-md bg-[#17382f] text-white text-[13.5px]">＋ 追加</button>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-[15px] font-semibold text-slate-900">負荷係数（役割×フェーズ）</h2>
          <button onClick={resetCoefs} className="ml-auto text-[12px] text-slate-500 hover:text-slate-800">初期値に戻す</button>
        </div>
        <p className="text-[12.5px] text-slate-500 mb-3">案件がそのフェーズにいる間、担当者1人にかかる負荷（FTE）です。初期値は仮の値なので、実際の業務量に合わせて直してください。ステイ期間は、案件にステイ期間を入れた案件だけに使われます。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-slate-500 text-[12px]">
                <th className="text-left font-medium py-1 pr-3">フェーズ</th>
                {RESOURCE_ROLES.map(r => <th key={r} className="font-medium px-2 text-center">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {PHASES.map(p => (
                <tr key={p} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-800">{PHASE_LABEL[p]}{p === 'closing' && <span className="text-[11.5px] text-slate-400">（デザインは「工事終了後」）</span>}</td>
                  {RESOURCE_ROLES.map(r => (
                    <td key={r} className="px-2 text-center" title={phaseLabelFor(r, p)}>
                      <NumInput value={coefs[r][p]} onCommit={v => setCoef(r, p, v ?? DEFAULT_COEFS[r][p])} width="w-16" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-slate-400 mt-2">オープン月は、オープン日がある月をまとめて判定します。案件別の調整は、案件ページの「案件情報」にある「案件別調整係数」で行います。</p>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 mb-3">色の閾値と採用の目安</h2>
        <div className="grid gap-3 sm:grid-cols-2 text-[13.5px]">
          <Row label="余力あり（適正FTEの何％未満か）"><NumInput value={Math.round(settings.th_spare * 100)} onCommit={v => saveSettings({ th_spare: (v ?? 80) / 100 })} suffix="％" /></Row>
          <Row label="注意（何％を超えたか）"><NumInput value={Math.round(settings.th_warn * 100)} onCommit={v => saveSettings({ th_warn: (v ?? 100) / 100 })} suffix="％" /></Row>
          <Row label="重大な逼迫（何％を超えたか）"><NumInput value={Math.round(settings.th_danger * 100)} onCommit={v => saveSettings({ th_danger: (v ?? 120) / 100 })} suffix="％" /></Row>
          <Row label="採用リードタイム"><NumInput value={settings.hire_lead_months} onCommit={v => saveSettings({ hire_lead_months: Math.round(v ?? 3) })} suffix="か月" /></Row>
          <Row label="「構造的な不足」とみなす連続月数"><NumInput value={settings.structural_months} onCommit={v => saveSettings({ structural_months: Math.max(1, Math.round(v ?? 3)) })} suffix="か月以上" /></Row>
          <Row label="新しく採用する人の適正FTE"><NumInput value={settings.new_hire_fte} onCommit={v => saveSettings({ new_hire_fte: v ?? 3 })} suffix="FTE" /></Row>
        </div>
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-700">{label}</span>{children}</div>
}

function patchToRow(cur: ResourceSettings, patch: Partial<ResourceSettings>) {
  const m = { ...cur, ...patch }
  return {
    phase_coefs: m.phase_coefs, th_spare: m.th_spare, th_warn: m.th_warn, th_danger: m.th_danger,
    hire_lead_months: m.hire_lead_months, structural_months: m.structural_months, new_hire_fte: m.new_hire_fte,
  }
}
