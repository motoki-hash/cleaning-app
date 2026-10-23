'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { setUndoHandlers, clearUndoHandlers } from './undo'
import type {
  Project, BudgetCategory, Order, AdditionalWork, VeItem, Investor, InvestorBilling, Vendor,
} from './types'

// 「元に戻す」用に、案件のデータ全体（予算・発注・追加工事・VE・投資家・請求）の写しを持つ。
// 画面を切り替えても履歴が残るように、案件ごとにモジュール内で保持する。
type Snapshot = {
  project: Project
  categories: BudgetCategory[]
  orders: Order[]
  works: AdditionalWork[]
  ves: VeItem[]
  investors: Investor[]
  billings: InvestorBilling[]
}
type History = { undo: Snapshot[]; redo: Snapshot[]; current: Snapshot | null; skipPush: boolean }
const histories = new Map<string, History>()
const getHistory = (pid: string): History => {
  let h = histories.get(pid)
  if (!h) { h = { undo: [], redo: [], current: null, skipPush: false }; histories.set(pid, h) }
  return h
}
const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b)

// 今の状態（cur）を、過去の状態（target）に戻す。違う行だけを書き戻し、増えた行は削除する
async function restoreSnapshot(cur: Snapshot, target: Snapshot): Promise<string | null> {
  const errors: string[] = []
  const diffRows = <T extends { id: string }>(a: T[], b: T[]) => {
    const am = new Map(a.map(r => [r.id, r]))
    const upsert = b.filter(r => JSON.stringify(am.get(r.id)) !== JSON.stringify(r))
    const keep = new Set(b.map(r => r.id))
    const remove = a.filter(r => !keep.has(r.id)).map(r => r.id)
    return { upsert, remove }
  }
  const tables: Array<[string, { upsert: { id: string }[]; remove: string[] }]> = [
    ['pjb_budget_categories', diffRows(cur.categories, target.categories)],
    ['pjb_orders', diffRows(cur.orders, target.orders)],
    ['pjb_additional_works', diffRows(cur.works, target.works)],
    ['pjb_ve_items', diffRows(cur.ves, target.ves)],
    ['pjb_investors', diffRows(cur.investors, target.investors)],
    ['pjb_investor_billings', diffRows(cur.billings, target.billings)],
  ]
  // 先に、親にあたる行（案件・カテゴリー・投資家・発注）を戻してから、子の行を戻す
  if (JSON.stringify(cur.project) !== JSON.stringify(target.project)) {
    const r = await supabase.from('pjb_projects').upsert(target.project)
    if (r.error) errors.push(r.error.message)
  }
  for (const [table, d] of tables) {
    if (d.upsert.length) { const r = await supabase.from(table).upsert(d.upsert); if (r.error) errors.push(`${table}：${r.error.message}`) }
  }
  // 増えた行の削除は、子から先に
  for (const [table, d] of [...tables].reverse()) {
    if (d.remove.length) { const r = await supabase.from(table).delete().in('id', d.remove); if (r.error) errors.push(`${table}：${r.error.message}`) }
  }
  return errors.length ? errors[0] : null
}

export function useProjectData(projectId: string, options: { registerUndo?: boolean } = {}) {
  const registerUndo = options.registerUndo !== false
  const [project, setProject] = useState<Project | null>(null)
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [additionalWorks, setAdditionalWorks] = useState<AdditionalWork[]>([])
  const [veItems, setVeItems] = useState<VeItem[]>([])
  const [investors, setInvestors] = useState<Investor[]>([])
  const [billings, setBillings] = useState<InvestorBilling[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadedOnce = useRef(false)
  const [historyTick, setHistoryTick] = useState(0)
  const undoBusy = useRef(false)

  const load = useCallback(async () => {
    // 最初の読み込みのときだけ「読み込み中」にする（再読み込みで画面が消えて入力中の内容が飛ぶのを防ぐ）
    if (!loadedOnce.current) setLoading(true)
    const [
      projectRes, catRes, orderRes, workRes, veRes, investorRes, vendorRes,
    ] = await Promise.all([
      supabase.from('pjb_projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('pjb_budget_categories').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('pjb_orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('pjb_additional_works').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('pjb_ve_items').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('pjb_investors').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('pjb_vendors').select('*').order('name'),
    ])

    if (!projectRes.data) {
      setNotFound(true)
      loadedOnce.current = true
      setLoading(false)
      return
    }

    setProject(projectRes.data as Project)
    setCategories((catRes.data || []) as BudgetCategory[])
    setOrders((orderRes.data || []) as Order[])
    setAdditionalWorks((workRes.data || []) as AdditionalWork[])
    setVeItems((veRes.data || []) as VeItem[])
    const investorRows = (investorRes.data || []) as Investor[]
    setInvestors(investorRows)
    setVendors((vendorRes.data || []) as Vendor[])

    let billingRows: InvestorBilling[] = []
    if (investorRows.length > 0) {
      const { data: billingData } = await supabase
        .from('pjb_investor_billings')
        .select('*')
        .in('investor_id', investorRows.map(i => i.id))
      billingRows = (billingData || []) as InvestorBilling[]
    }
    setBillings(billingRows)

    // 変更があったときは、変更前の状態を「元に戻す」の履歴に積む（最初の読み込みは基準にするだけ）
    const snap: Snapshot = {
      project: projectRes.data as Project,
      categories: (catRes.data || []) as BudgetCategory[],
      orders: (orderRes.data || []) as Order[],
      works: (workRes.data || []) as AdditionalWork[],
      ves: (veRes.data || []) as VeItem[],
      investors: investorRows,
      billings: billingRows,
    }
    const h = getHistory(projectId)
    if (!loadedOnce.current) {
      h.current = snap
    } else if (h.skipPush) {
      h.skipPush = false
      h.current = snap
    } else if (h.current && !sameSnapshot(h.current, snap)) {
      h.undo = [...h.undo.slice(-49), h.current]
      h.redo = []
      h.current = snap
    }
    setHistoryTick(t => t + 1)

    loadedOnce.current = true
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  const step = useCallback(async (dir: 'undo' | 'redo') => {
    const h = getHistory(projectId)
    const stack = dir === 'undo' ? h.undo : h.redo
    if (undoBusy.current || stack.length === 0 || !h.current) return
    undoBusy.current = true
    const target = stack[stack.length - 1]
    const cur = h.current
    const err = await restoreSnapshot(cur, target)
    if (err) {
      alert(`元に戻せませんでした：${err}`)
    } else {
      stack.pop()
      if (dir === 'undo') h.redo = [...h.redo, cur]; else h.undo = [...h.undo, cur]
      h.skipPush = true
    }
    undoBusy.current = false
    await load()
  }, [projectId, load])

  const history = getHistory(projectId)
  const canUndo = history.undo.length > 0
  const canRedo = history.redo.length > 0

  // 「元に戻す／やり直す」をShell（⌘Z・ボタン）から使えるように登録する
  useEffect(() => {
    if (!registerUndo) return
    const owner = `data-${projectId}`
    setUndoHandlers({ undo: () => step('undo'), redo: () => step('redo'), canUndo, canRedo, owner })
    return () => clearUndoHandlers(owner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerUndo, projectId, step, canUndo, canRedo, historyTick])

  return {
    project, categories, orders, additionalWorks, veItems, investors, billings, vendors,
    loading, notFound, reload: load,
    undo: () => step('undo'), redo: () => step('redo'), canUndo, canRedo,
  }
}

export async function findOrCreateVendor(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data: existing } = await supabase.from('pjb_vendors').select('id').eq('name', trimmed).maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase.from('pjb_vendors').insert({ name: trimmed }).select('id').single()
  return created?.id || null
}
