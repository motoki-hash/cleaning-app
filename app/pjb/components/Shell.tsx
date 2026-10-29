'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProjectStatus } from '@/lib/pjb/types'
import { logActivity } from '@/lib/pjb/activity'
import QuickAddSheet from './QuickAddSheet'
import { InlineText } from './ui'
import { getUndoHandlers, useUndoHandlers } from '@/lib/pjb/undo'

const TABS = [
  { key: 'dashboard', label: 'ダッシュボード', href: '', group: '全体' },
  { key: 'budget', label: '予実管理', href: '/budget', group: '予算' },
  { key: 'cost-ve', label: '追加工事・増減表', href: '/cost-ve', group: '予算' },
  { key: 'schedule', label: 'スケジュール', href: '/schedule', group: '工程' },
  { key: 'orders', label: '発注管理', href: '/orders', group: '発注・支払' },
  { key: 'payments', label: '支払', href: '/payments', group: '発注・支払' },
  { key: 'investors', label: '投資家請求', href: '/investors', group: '請求' },
  { key: 'documents', label: '書類（見積書など）', href: '/documents', group: 'その他' },
  { key: 'history', label: '操作履歴', href: '/history', group: 'その他' },
] as const

const NAV_GROUPS = ['全体', '予算', '工程', '発注・支払', '請求', 'その他'] as const

const STATUS_PILL: Record<ProjectStatus, string> = {
  '進行中': 'bg-blue-50 text-blue-700 border-blue-200',
  '完了': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '保留': 'bg-amber-50 text-amber-700 border-amber-200',
}

// サイドメニュー用の線アイコン
export function NavIcon({ name }: { name: string }) {
  const p = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    budget: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
    'cost-ve': <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    orders: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
    payments: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    investors: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 5.5a3 3 0 0 1 0 5.8M21.5 20c0-2.6-1.4-4.5-3.5-5.5" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
    fy: <><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /><circle cx="19" cy="6" r="1.2" /></>,
    resources: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 5.5a3 3 0 0 1 0 5.8M21.5 20c0-2.6-1.4-4.5-3.5-5.5" /></>,
    documents: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  }[name] ?? null
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{p}</svg>
  )
}

export default function Shell({
  projectId,
  projectName,
  projectStatus,
  active,
  wide,
  children,
  onQuickAdded,
}: {
  projectId: string
  projectName?: string
  projectStatus?: ProjectStatus
  active: typeof TABS[number]['key']
  wide?: boolean
  children: React.ReactNode
  onQuickAdded?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [checked, setChecked] = useState(false)
  const [status, setStatus] = useState<ProjectStatus | undefined>(projectStatus)
  const [name, setName] = useState(projectName)
  const undoH = useUndoHandlers()

  // ⌘Z（Ctrl+Z）で元に戻す／⌘⇧Z（Ctrl+Y）でやり直す。入力欄の中では、文字の取り消しを優先する
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const h = getUndoHandlers()
      if (!h) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) { if (h.canRedo) h.redo() }
      else if (h.canUndo) h.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { setStatus(projectStatus) }, [projectStatus])
  useEffect(() => { setName(projectName) }, [projectName])

  const renameProject = async (next: string) => {
    const prev = name
    setName(next)
    const { error } = await supabase.from('pjb_projects').update({ name: next, updated_at: new Date().toISOString() }).eq('id', projectId)
    if (error) {
      setName(prev)
      alert(`物件名の変更に失敗しました：${error.message}`)
      return
    }
    await logActivity({ projectId, action: 'update', entityType: 'project', entityLabel: '物件名', before: prev, after: next })
    onQuickAdded?.()
  }

  // 案件のステータス（進行中／完了／保留）は人が判断して切り替える
  const changeStatus = async (next: ProjectStatus) => {
    if (!status || next === status) return
    const prev = status
    setStatus(next)
    const { error } = await supabase.from('pjb_projects').update({
      status: next,
      completed_at: next === '完了' ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId)
    if (error) {
      setStatus(prev)
      alert(`ステータスの変更に失敗しました：${error.message}`)
      return
    }
    await logActivity({ projectId, action: 'update', entityType: 'project', entityLabel: '案件ステータス', before: prev, after: next })
    onQuickAdded?.()
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(pathname || '/pjb')}`)
      } else {
        setChecked(true)
      }
    })
  }, [router, pathname])

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">読み込み中…</div>
  }

  const statusSelect = status && (
    <select
      value={status}
      onChange={e => changeStatus(e.target.value as ProjectStatus)}
      aria-label="案件ステータス"
      className={`text-[13px] px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${STATUS_PILL[status]}`}
    >
      <option value="進行中">進行中</option>
      <option value="完了">完了</option>
      <option value="保留">保留</option>
    </select>
  )

  return (
    <div className="min-h-screen bg-slate-100 pb-24 print:min-h-0 print:pb-0 print:bg-white">
      {/* PC: 左サイドメニュー（lg以上のみ表示） */}
      <aside className="hidden lg:flex print:!hidden fixed inset-y-0 left-0 w-60 flex-col bg-[#17382f] border-r border-[#0f2a22] z-20">
        <div className="px-4 pt-4 pb-4 border-b border-white/10">
          <Link href="/pjb" className="text-[13px] text-emerald-100/70 hover:text-white">‹ 案件一覧</Link>
          <div className="mt-3 flex items-start gap-1.5 text-[16px] font-semibold text-white leading-snug break-words">
            {name ? <InlineText value={name} onCommit={renameProject} className="!whitespace-normal !overflow-visible hover:!bg-white/10" inputClassName="!bg-white !text-slate-900 !w-full" /> : 'プロジェクト'}
            {name && <span className="text-[12px] font-normal text-emerald-100/50 mt-0.5 whitespace-nowrap">✎ 編集</span>}
          </div>
          <div className="mt-2">{statusSelect}</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map(group => (
            <div key={group} className="mb-4">
              <div className="px-2 mb-1 text-[12px] font-medium text-emerald-100/50">{group}</div>
              {TABS.filter(t => t.group === group).map(t => (
                <Link
                  key={t.key}
                  href={`/pjb/${projectId}${t.href}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
                    active === t.key
                      ? 'bg-[#e2efe8] text-[#17382f] font-semibold'
                      : 'text-emerald-50/90 hover:bg-white/10'
                  }`}
                >
                  <NavIcon name={t.key} />
                  {t.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-white/10 flex gap-2">
          <button
            onClick={() => undoH?.undo()} disabled={!undoH?.canUndo} title="元に戻す（⌘Z / Ctrl+Z）"
            className="flex-1 text-[13px] py-2 rounded-lg border border-white/20 text-emerald-50 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >↶ 元に戻す</button>
          <button
            onClick={() => undoH?.redo()} disabled={!undoH?.canRedo} title="やり直す（⌘⇧Z / Ctrl+Y）"
            className="flex-1 text-[13px] py-2 rounded-lg border border-white/20 text-emerald-50 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >↷ やり直す</button>
        </div>
      </aside>

      {/* スマホ・タブレット: 上部ヘッダー＋横スクロールのタブ */}
      <header className="lg:hidden print:hidden sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 px-3 h-12">
          <Link href="/pjb" className="text-slate-400 hover:text-slate-600 px-1 text-lg leading-none">‹</Link>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 truncate">
              {name ? <InlineText value={name} onCommit={renameProject} className="max-w-full" /> : 'プロジェクト'}
            </div>
          </div>
          <button onClick={() => undoH?.undo()} disabled={!undoH?.canUndo} aria-label="元に戻す" className="px-1.5 text-[17px] text-slate-500 disabled:opacity-25">↶</button>
          <button onClick={() => undoH?.redo()} disabled={!undoH?.canRedo} aria-label="やり直す" className="px-1.5 text-[17px] text-slate-500 disabled:opacity-25">↷</button>
          {statusSelect}
        </div>
        <nav className="flex gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <Link
              key={t.key}
              href={`/pjb/${projectId}${t.href}`}
              className={`text-[14px] px-3.5 py-2 rounded-full whitespace-nowrap border transition-colors ${
                active === t.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="lg:pl-60 print:!pl-0">
        <div className={`${wide ? '' : 'max-w-[1240px]'} mx-auto px-3 sm:px-5 lg:px-8 pt-4 lg:pt-7 print:max-w-none print:px-0 print:pt-0`}>{children}</div>
      </main>

      <button
        onClick={() => setShowQuickAdd(true)}
        className="print:hidden fixed bottom-5 right-5 w-14 h-14 rounded-full bg-blue-600 text-white text-2xl shadow-lg shadow-slate-900/20 flex items-center justify-center z-30 active:scale-95 transition-transform"
        aria-label="クイック入力"
      >
        ＋
      </button>

      {showQuickAdd && (
        <QuickAddSheet
          projectId={projectId}
          onClose={() => setShowQuickAdd(false)}
          onSaved={() => { setShowQuickAdd(false); onQuickAdded?.() }}
        />
      )}
    </div>
  )
}
