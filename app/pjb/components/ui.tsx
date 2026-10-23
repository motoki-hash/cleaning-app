'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Alert } from '@/lib/pjb/types'
import { formatYen, formatSignedYen, formatPercent } from '@/lib/pjb/format'
import { normalizeExpr, isPlainNumber, evaluateExpr } from '@/lib/pjb/calcExpr'
import { formulaFor, saveFormula, useFormulaVersion } from '@/lib/pjb/formulaStore'

// Enterで確定する入力欄用。日本語の変換を確定するEnterでは、保存されないようにする
export const isCommitEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229

// 入力中に3桁カンマを自動で付ける金額入力。valueは数字のみの文字列（マイナス可）で受け渡す。
// スプレッドシートのように、計算式も入れられる（例：150万+30万 / 1200000*1.1）。
// 式を打っている間は、そのまま表示して、結果を下にプレビューする。Enterか、枠の外を押すと、結果の金額になる。
function toCommas(raw: string) {
  if (!raw) return ''
  const neg = raw.startsWith('-')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return neg ? '-' : ''
  return (neg ? '-' : '') + Number(digits).toLocaleString('ja-JP')
}

export function MoneyInput({
  value, onChange, className, placeholder, autoFocus, allowNegative, formulaKey,
}: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; autoFocus?: boolean; allowNegative?: boolean; formulaKey?: string }) {
  // 計算式で入れた金額は、開いたときに式のまま出す（金額が式の結果と同じときだけ）
  const [expr, setExpr] = useState<string | null>(() => formulaFor(formulaKey, Number(value) || 0))
  const [hintPos, setHintPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const place = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setHintPos({ left: r.left, top: r.bottom + 2 })
  }
  useEffect(() => { if (expr !== null) place() }, [expr])   // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (raw: string) => {
    const t = normalizeExpr(raw)
    if (isPlainNumber(t, !!allowNegative)) {
      setExpr(null); setHintPos(null)
      const neg = !!allowNegative && t.startsWith('-')
      const digits = t.replace(/\D/g, '')
      onChange(digits ? (neg ? '-' : '') + digits : (neg ? '-' : ''))
      return
    }
    setExpr(raw)
    place()
    const r = evaluateExpr(raw)
    if (r !== null) onChange(String(Math.round(r)))
  }

  const result = expr !== null ? evaluateExpr(expr) : null

  return (
    <>
      <input
        ref={ref}
        type="text"
        inputMode="text"
        autoFocus={autoFocus}
        value={expr ?? toCommas(value)}
        onChange={e => handle(e.target.value)}
        onFocus={() => {
          if (expr === null) {
            const f = formulaFor(formulaKey, Number(value) || 0)
            if (f) setExpr(f)
          }
        }}
        onBlur={() => {
          // 式で入れた金額は、式も一緒に保存する
          if (expr !== null && formulaKey) {
            const r = evaluateExpr(expr)
            if (r !== null) saveFormula(formulaKey, expr.trim(), Math.round(r))
          }
          setExpr(null); setHintPos(null)
        }}
        placeholder={placeholder}
        title="計算式も入力できます（例：150万+30万 / 1200000*1.1）"
        className={className}
      />
      {expr !== null && hintPos && (
        <span
          className={`fixed z-50 rounded px-2 py-1 text-[12px] shadow-lg whitespace-nowrap pointer-events-none ${result === null ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'}`}
          style={{ left: hintPos.left, top: hintPos.top }}
        >
          {result === null ? '式を確認してください' : `= ${formatYen(Math.round(result))}`}
        </span>
      )}
    </>
  )
}

// フォーカスが外れたときだけ確定する版（既存値の編集用）
export function MoneyBlurInput({
  defaultValue, onCommit, className, placeholder,
}: { defaultValue: number; onCommit: (v: number) => void; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState(defaultValue ? String(defaultValue) : '')
  return (
    <span onBlur={() => onCommit(Number(draft) || 0)}>
      <MoneyInput
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        className={className}
      />
    </span>
  )
}

// タップ/クリックでその場编集できる金額表示。onCommitは値が変わったときだけ呼ばれる。
export function InlineAmount({ value, onCommit, emphasize, formulaKey }: { value: number; onCommit: (v: number) => void; emphasize?: boolean; formulaKey?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  useFormulaVersion()   // 式が読み込まれた／保存されたときに、表示を更新する
  const formula = formulaFor(formulaKey, value)

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true) }}
        className={`tabular-nums text-right w-full px-2 py-1 rounded-md hover:bg-slate-50 ${emphasize ? 'font-semibold text-slate-900' : value === 0 ? 'text-slate-300' : 'text-slate-800'}`}
      >
        <span className="border-b border-dashed border-slate-300" title={formula ? `計算式：${formula}` : undefined}>
          {formula && <span className="text-[10px] text-slate-400 mr-1 no-underline">ƒ</span>}{formatYen(value)}
        </span>
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    const num = Number(draft)
    if (!isNaN(num) && num !== value) onCommit(num)
  }

  return (
    <span
      onBlur={commit}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
    >
      <MoneyInput
        value={draft}
        onChange={setDraft}
        autoFocus
        allowNegative
        formulaKey={formulaKey}
        className="w-28 sm:w-36 text-right tabular-nums px-2 py-1 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
    </span>
  )
}

// 金額以外の数値（部屋数・比率%など）向けのタップ編集。displayはvalueをそのまま整形するだけの表示用関数。
export function InlineNumber({
  value, onCommit, display, width = 'w-16', emphasize,
}: { value: number; onCommit: (v: number) => void; display?: (v: number) => string; width?: string; emphasize?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true) }}
        className={`tabular-nums text-right rounded-md hover:bg-slate-50 px-1 -mx-1 ${emphasize ? 'font-semibold text-slate-900' : ''}`}
      >
        <span className="border-b border-dashed border-slate-300">{display ? display(value) : value.toLocaleString('ja-JP')}</span>
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    const num = Number(draft)
    if (!isNaN(num) && num !== value) onCommit(num)
  }

  return (
    <input
      type="number"
      autoFocus
      defaultValue={value}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
      onFocus={e => e.currentTarget.select()}
      className={`${width} text-right tabular-nums px-1.5 py-0.5 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300`}
    />
  )
}

// タップ/クリックでその場編集できるテキスト表示。onCommitは値が変わり、空でないときだけ呼ばれる。
export function InlineText({
  value, onCommit, placeholder, emptyLabel, className, inputClassName,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; emptyLabel?: string; className?: string; inputClassName?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true) }}
        className={`text-left truncate rounded-md hover:bg-slate-50 px-1 -mx-1 ${!value ? 'text-slate-400' : ''} ${className || ''}`}
      >
        <span className="border-b border-dashed border-slate-300">{value || emptyLabel || '未設定'}</span>
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
  }

  return (
    <input
      autoFocus
      defaultValue={value}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
      onFocus={e => e.currentTarget.select()}
      className={`px-1.5 py-0.5 -mx-1 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 ${className || ''} ${inputClassName || ''}`}
    />
  )
}

export function KpiCard({
  label, value, sub, tone = 'default',
}: { label: string; value: string; sub?: string; tone?: 'default' | 'warning' | 'danger' | 'good' }) {
  const box = {
    default: 'border-slate-200 bg-white',
    warning: 'border-amber-300 bg-amber-50',
    danger: 'border-rose-300 bg-rose-50',
    good: 'border-emerald-300 bg-emerald-50',
  }[tone]
  const valueColor = {
    default: 'text-slate-900',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
    good: 'text-emerald-700',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${box}`}>
      <div className="text-[13px] text-slate-500 mb-1">{label}</div>
      <div className={`text-[21px] leading-tight font-bold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

// タップして金額を編集できるKPIカード（例：PJ総予算）。計算式も入力できる
export function EditableKpiCard({
  label, value, onCommit, sub, formulaKey,
}: { label: string; value: number; onCommit: (v: number) => void; sub?: string; formulaKey?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  useFormulaVersion()
  const formula = formulaFor(formulaKey, value)

  const commit = () => {
    setEditing(false)
    const num = Number(draft)
    if (!isNaN(num) && num !== value) onCommit(num)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[13px] text-slate-500 mb-1">{label}</div>
      {editing ? (
        <span onBlur={commit} onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}>
          <MoneyInput
            value={draft} onChange={setDraft} autoFocus formulaKey={formulaKey}
            className="w-full text-[19px] font-bold tabular-nums px-2 py-1 -mx-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </span>
      ) : (
        <button
          onClick={() => { setDraft(String(value)); setEditing(true) }}
          className="text-left text-[21px] leading-tight font-bold tabular-nums text-slate-900"
          title={formula ? `計算式：${formula}` : 'タップして編集'}
        >
          <span className="border-b border-dashed border-slate-300">
            {formula && <span className="text-[11px] font-normal text-slate-400 mr-1">ƒ</span>}{formatYen(value)}
          </span>
        </button>
      )}
      <div className="text-[12px] text-slate-500 mt-1">{sub ?? 'タップして編集できます'}</div>
    </div>
  )
}

const SEVERITY_STYLE: Record<Alert['severity'], string> = {
  danger: 'bg-rose-50 text-rose-700 border-rose-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">
        現在、要対応の項目はありません
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-rose-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-rose-100 text-[14px] font-semibold text-rose-700">
        要対応 {alerts.length}件
      </div>
      <div className="divide-y divide-slate-100">
        {alerts.map(a => {
          const content = (
            <div className={`flex items-center gap-2 px-4 py-2.5 text-[13.5px] ${SEVERITY_STYLE[a.severity]}`}>
              <span className="text-[11.5px] font-mono font-semibold tracking-wide">{a.kind}</span>
              <span className="flex-1">{a.message}</span>
              {a.href && <span className="text-slate-300">›</span>}
            </div>
          )
          return a.href ? <Link key={a.id} href={a.href}>{content}</Link> : <div key={a.id}>{content}</div>
        })}
      </div>
    </div>
  )
}

export function StatePill({ state }: { state: 'normal' | 'warning' | 'danger' }) {
  const map = {
    normal: { label: '予算内', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    warning: { label: '要注意', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    danger: { label: '超過', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  }[state]
  return <span className={`text-[12px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${map.cls}`}>{map.label}</span>
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-8 first:mt-0">
      <h2 className="flex items-center gap-2 text-[16px] font-bold text-slate-900">
        <span className="w-1 h-4 rounded-sm bg-blue-600" />
        {children}
      </h2>
      {action}
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[14px] text-slate-400">{children}</div>
}

export { formatYen, formatSignedYen, formatPercent }
