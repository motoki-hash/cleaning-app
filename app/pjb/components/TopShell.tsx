'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authState } from '@/lib/pjb/authState'
import { supabase } from '@/lib/supabase'
import { NavIcon } from './Shell'

// 案件を開く前の、トップ側のページ（案件一覧・年度の売上分析・リソース管理）の共通の枠。
// 案件の中の画面（Shell）と同じ、左のメニューを持つ。
export const TOP_TABS = [
  { key: 'home', label: '案件一覧', href: '/pjb', icon: 'home' },
  { key: 'fy', label: '年度の売上分析', href: '/pjb/fy', icon: 'fy' },
  { key: 'resources', label: 'リソース管理', href: '/pjb/resources', icon: 'resources' },
] as const

export default function TopShell({ active, children }: { active: typeof TOP_TABS[number]['key']; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(authState.checked)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push(`/login?redirect=${encodeURIComponent(pathname || '/pjb')}`)
      else { authState.checked = true; setChecked(true) }
    })
  }, [router, pathname])

  if (!checked) return <div className="min-h-screen" />

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* PC: 左サイドメニュー */}
      <aside className="hidden lg:flex print:!hidden fixed inset-y-0 left-0 w-60 flex-col bg-[#17382f] border-r border-[#0f2a22] z-20">
        <div className="px-4 pt-5 pb-4 border-b border-white/10">
          <div className="text-[11px] font-mono tracking-wide text-emerald-100/50">BARE NOTE STUDIO</div>
          <div className="mt-1 text-[17px] font-semibold text-white">PJ予算管理</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="px-2 mb-1 text-[12px] font-medium text-emerald-100/50">全体</div>
          {TOP_TABS.map(t => (
            <Link
              key={t.key} href={t.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
                active === t.key ? 'bg-[#e2efe8] text-[#17382f] font-semibold' : 'text-emerald-50/90 hover:bg-white/10'
              }`}
            >
              <NavIcon name={t.icon} />
              {t.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* スマホ・タブレット: 上のタブ */}
      <header className="lg:hidden print:hidden sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-3 h-12 flex items-center text-[15px] font-semibold text-slate-900">PJ予算管理</div>
        <nav className="flex gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar">
          {TOP_TABS.map(t => (
            <Link
              key={t.key} href={t.href}
              className={`text-[14px] px-3.5 py-2 rounded-full whitespace-nowrap border ${
                active === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="lg:pl-60 print:!pl-0">{children}</main>
    </div>
  )
}
