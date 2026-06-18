'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CleanerSettingsPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cleanerId, setCleanerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email || '')

      const { data: cleaner } = await supabase
        .from('cleaners').select('id, name').eq('user_id', user.id).single()
      if (cleaner) {
        setCleanerId(cleaner.id)
        setName(cleaner.name || '')
      }
      setLoading(false)
    }
    init()
  }, [router])

  const save = async () => {
    if (!cleanerId || !name.trim()) return
    setSaving(true)
    await supabase.from('cleaners').update({ name: name.trim() }).eq('id', cleanerId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/cleaner')} className="text-xl">‹</button>
        <h1 className="text-lg font-bold">プロフィール設定</h1>
      </header>

      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* アイコン */}
        <div className="flex justify-center py-6">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600">
            {name ? name.slice(0, 1) : '?'}
          </div>
        </div>

        {/* 名前 */}
        <div className="bg-white rounded-xl p-4 space-y-2 shadow-sm">
          <label className="text-sm font-medium text-gray-700">表示名</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="名前を入力してください"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400">チャットで他の清掃員に表示される名前です</p>
        </div>

        {/* メールアドレス（表示のみ） */}
        <div className="bg-white rounded-xl p-4 space-y-2 shadow-sm">
          <label className="text-sm font-medium text-gray-700">メールアドレス</label>
          <p className="text-sm text-gray-600 px-1">{email}</p>
          <p className="text-xs text-gray-400">メールアドレスは変更できません</p>
        </div>

        {/* 保存ボタン */}
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className={`w-full py-3 rounded-xl text-white font-medium text-sm transition-colors ${
            saved ? 'bg-green-500' : saving ? 'bg-blue-400' : 'bg-blue-600'
          } disabled:opacity-50`}
        >
          {saved ? '✓ 保存しました' : saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
