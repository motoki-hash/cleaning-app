'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeBusiness } from './constants'
import { summarizeCategory, summarizeProject, buildAlerts } from './calc'
import type { Project, BudgetCategory, Order, AdditionalWork, VeItem, SalesItem } from './types'

// 全案件の、一覧用の集計（案件一覧・年度ダッシュボード・リソース管理で共通に使う）
export type ProjectCardData = {
  project: Project
  totalBudget: number        // PJ総予算（手入力）
  executionBudget: number    // 実行費用（自動）
  budgetGap: number          // 総予算 − 実行費用
  landingForecast: number
  remaining: number
  consumptionRate: number
  grossProfit: number
  grossMargin: number
  bnsSell: number
  bnsCost: number
  business: string
  alertCount: number
  pmNames: string[]          // 進行管理の担当者（担当者の割り当てから。複数名OK）
  qaNames: string[]          // 品質管理の担当者
}

// 前に読み込んだ一覧を覚えておき、ページを切り替えたとき空の「読み込み中」を挟まず、すぐ表示して裏で更新する
let cardsCache: ProjectCardData[] | null = null

export function useProjectCards(enabled: boolean) {
  const [cards, setCards] = useState<ProjectCardData[]>(cardsCache ?? [])
  const [loading, setLoading] = useState(cardsCache === null)

  const load = useCallback(async () => {
    const { data: projects } = await supabase.from('pjb_projects').select('*').order('created_at', { ascending: false })
    const list = (projects || []) as Project[]
    if (list.length === 0) { cardsCache = []; setCards([]); setLoading(false); return }

    const ids = list.map(p => p.id)
    const [catRes, orderRes, workRes, veRes, salesRes, asgRes, staffRes] = await Promise.all([
      supabase.from('pjb_budget_categories').select('*').in('project_id', ids),
      supabase.from('pjb_orders').select('*').in('project_id', ids),
      supabase.from('pjb_additional_works').select('*').in('project_id', ids),
      supabase.from('pjb_ve_items').select('*').in('project_id', ids),
      supabase.from('pjb_sales_items').select('*').in('project_id', ids),
      supabase.from('pjb_assignments').select('project_id, staff_id, role').order('created_at'),
      supabase.from('pjb_staff').select('id, name'),
    ])
    // 担当者のテーブルがまだないとき（パッチ021の前）は、案件に直接入れた名前だけを使う
    const staffName = new Map(((staffRes.error ? [] : staffRes.data) || []).map((s: { id: string; name: string }) => [s.id, s.name]))
    const assignments = (asgRes.error ? [] : (asgRes.data || [])) as Array<{ project_id: string; staff_id: string; role: string }>
    const namesOf = (projectId: string, role: string, fallback?: string | null) => {
      const list = assignments.filter(a => a.project_id === projectId && a.role === role).map(a => staffName.get(a.staff_id)).filter((n): n is string => !!n)
      return list.length > 0 ? list : fallback ? [fallback] : []
    }
    // 売上の内訳のテーブルがまだないときは null（従来どおり、項目に直接入れた売上を使う）
    const salesAll: SalesItem[] | null = salesRes.error ? null : ((salesRes.data || []) as SalesItem[])
    const categories = (catRes.data || []) as BudgetCategory[]
    const orders = (orderRes.data || []) as Order[]
    const works = (workRes.data || []) as AdditionalWork[]
    const ves = (veRes.data || []) as VeItem[]

    const result: ProjectCardData[] = list.map(project => {
      const cats = categories.filter(c => c.project_id === project.id)
      const summaries = cats.map(c => summarizeCategory(c, orders, works, ves))
      const totals = summarizeProject(project, cats, summaries, salesAll === null ? null : salesAll.filter(x => x.project_id === project.id))
      const alerts = buildAlerts(cats, summaries, orders.filter(o => o.project_id === project.id), works.filter(w => w.project_id === project.id), ves.filter(v => v.project_id === project.id), `/pjb/${project.id}`)
      return {
        project,
        totalBudget: totals.totalBudget,
        executionBudget: totals.executionBudget,
        budgetGap: totals.budgetGap,
        landingForecast: totals.landingForecast,
        remaining: totals.remaining,
        consumptionRate: totals.consumptionRate,
        grossProfit: totals.bnsGrossProfit,
        grossMargin: totals.grossMargin,
        bnsSell: totals.bnsSell,
        bnsCost: totals.bnsCost,
        business: normalizeBusiness(project.business),
        alertCount: alerts.length,
        pmNames: namesOf(project.id, '進行管理', project.pm_name),
        qaNames: namesOf(project.id, '品質管理', project.qa_name),
      }
    })
    cardsCache = result
    setCards(result)
    setLoading(false)
  }, [])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  return { cards, loading, reload: load }
}
