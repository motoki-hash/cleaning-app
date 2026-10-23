'use client'

import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

// 計算式で入力した金額の「式」を覚えておく入れ物。
// 金額欄を開いたときに、式のまま編集できるようにするために使う（金額が式の結果と違っていたら、式は使わない）。
type Entry = { expr: string; amount: number }

let projectId: string | null = null
let map = new Map<string, Entry>()
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach(l => l()) }

export async function loadFormulas(pid: string) {
  projectId = pid
  const { data, error } = await supabase.from('pjb_formulas').select('key, expr, amount').eq('project_id', pid)
  const next = new Map<string, Entry>()
  if (!error) for (const r of (data || []) as Array<{ key: string; expr: string; amount: number }>) next.set(r.key, { expr: r.expr, amount: Number(r.amount) })
  map = next
  notify()
}

export const getFormula = (key: string | undefined): Entry | undefined => (key ? map.get(key) : undefined)

// その金額が、いまも式の結果と同じときだけ、式を返す
export const formulaFor = (key: string | undefined, currentAmount: number): string | null => {
  const f = getFormula(key)
  return f && f.amount === currentAmount ? f.expr : null
}

export async function saveFormula(key: string, expr: string, amount: number) {
  if (!projectId) return
  map.set(key, { expr, amount })
  notify()
  await supabase.from('pjb_formulas').upsert({ project_id: projectId, key, expr, amount, updated_at: new Date().toISOString() }, { onConflict: 'project_id,key' })
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useFormulaVersion = () => useSyncExternalStore(subscribe, () => version, () => 0)
