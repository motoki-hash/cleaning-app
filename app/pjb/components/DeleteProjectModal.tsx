'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// 案件を完全に削除する。誤操作を防ぐため、案件名を入力しないと削除できない。
export default function DeleteProjectModal({
  projectId, projectName, onClose,
}: { projectId: string; projectName: string; onClose: () => void }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const matches = typed.trim() === projectName.trim()

  const remove = async () => {
    if (!matches || busy) return
    setBusy(true)
    setError('')
    // 予算・発注・支払・投資家・スケジュール・操作履歴などは、案件に紐づいて一緒に削除される
    const { error: err } = await supabase.from('pjb_projects').delete().eq('id', projectId)
    if (err) { setError(`削除に失敗しました：${err.message}`); setBusy(false); return }
    router.push('/pjb')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5">
        <div className="text-[16px] font-semibold text-rose-700 mb-2">案件を削除</div>
        <p className="text-[13.5px] text-slate-700 leading-relaxed">
          「<b>{projectName}</b>」を削除します。この案件の<b>予算・発注・支払・投資家請求・スケジュール・操作履歴</b>がすべて消え、<b>元に戻せません</b>。
        </p>
        <label className="grid gap-1 mt-4">
          <span className="text-[13px] text-slate-500">確認のため、案件名を入力してください</span>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={projectName}
            autoFocus
            className="border border-slate-200 rounded-lg px-3 py-2 text-[15px]"
          />
        </label>
        {error && <p className="text-[13px] text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-600">キャンセル</button>
          <button
            onClick={remove}
            disabled={!matches || busy}
            className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white text-[14px] font-medium disabled:opacity-40"
          >
            {busy ? '削除中…' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  )
}
