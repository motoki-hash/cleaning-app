'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeBusiness } from './constants'
import { summarizeCategory, summarizeProject, buildAlerts } from './calc'
import type { Project, BudgetCategory, Order, AdditionalWork, VeItem, SalesItem, CashOut } from './types'

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
  cashOut: number          // BNSキャッシュ持ち出しの合計（売上・利益には含めない）
  alertCount: number
}

export function useProjectCards(enabled: boolean) {
  const [cards, setCards] = useState<ProjectCardData[]>([])
  const [cashOuts, setCashOuts] = useState<CashOut[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: projects } = await supabase.from('pjb_projects').select('*').order('created_at', { ascending: false })
    const list = (projects || []) as Project[]
    if (list.length === 0) { setCards([]); setCashOuts([]); setLoading(false); return }

    const ids = list.map(p => p.id)
    const [catRes, orderRes, workRes, veRes, salesRes, cashRes] = await Promise.all([
      supabase.from('pjb_budget_categories').select('*').in('project_id', ids),
      supabase.from('pjb_orders').select('*').in('project_id', ids),
      supabase.from('pjb_additional_works').select('*').in('project_id', ids),
      supabase.from('pjb_ve_items').select('*').in('project_id', ids),
      supabase.from('pjb_sales_items').select('*').in('project_id', ids),
      supabase.from('pjb_cash_outs').select('*').in('project_id', ids),
    ])
    // 持ち出しのテーブルがまだないときは、持ち出しなし（0）として扱う
    const cashAll = (cashRes.error ? [] : (cashRes.data || [])) as CashOut[]
    // 売上の内訳のテーブルがまだないときは null（従来どおり、項目に直接入れた売上を使う）
    const salesAll: SalesItem[] | null = salesRes.error ? null : ((salesRes.data || []) as SalesItem[])
    const categories = (catRes.data || []) as BudgetCategory[]
    const orders = (orderRes.data || []) as Order[]
    const works = (workRes.data || []) as AdditionalWork[]
    const ves = (veRes.data || []) as VeItem[]

    const result: ProjectCardData[] = list.map(project => {
      const cats = categories.filter(c => c.project_id === project.id)
      const summaries = cats.map(c => summarizeCategory(c, orders, works, ves))
      const cashOut = cashAll.filter(x => x.project_id === project.id).reduce((s, x) => s + Number(x.amount || 0), 0)
      const totals = summarizeProject(project, cats, summaries, salesAll === null ? null : salesAll.filter(x => x.project_id === project.id), cashOut)
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
        cashOut,
        alertCount: alerts.length,
      }
    })
    setCards(result)
    setCashOuts(cashAll)
    setLoading(false)
  }, [])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  return { cards, cashOuts, loading, reload: load }
}
