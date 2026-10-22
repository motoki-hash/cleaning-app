'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Project, BudgetCategory, Order, AdditionalWork, VeItem, Investor, InvestorBilling, Vendor,
} from './types'

export function useProjectData(projectId: string) {
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

  const load = useCallback(async () => {
    setLoading(true)
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

    if (investorRows.length > 0) {
      const { data: billingData } = await supabase
        .from('pjb_investor_billings')
        .select('*')
        .in('investor_id', investorRows.map(i => i.id))
      setBillings((billingData || []) as InvestorBilling[])
    } else {
      setBillings([])
    }

    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  return {
    project, categories, orders, additionalWorks, veItems, investors, billings, vendors,
    loading, notFound, reload: load,
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
