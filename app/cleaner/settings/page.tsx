'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function CleanerSettingsPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [cleanerId, setCleanerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'granted' | 'denied' | 'registering'>('unknown')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email || '')
      setUserId(user.id)

      const { data: cleaner } = await supabase
        .from('cleaners').select('id, name').eq('user_id', user.id).single()
      if (cleaner) {
        setCleanerId(cleaner.id)
        setName(cleaner.name || '')
      }
      setLoading(false)

      if ('Notification' in window) {
        setNotifStatus(Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'unknown')
      }
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

  const enableNotifications = async () => {
    if (!userId) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('このブラウザはプッシュ通知に対応していません')
      return
    }
    setNotifStatus('registering')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNotifStatus('denied')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const res = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userId }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert('登録エラー: ' + JSON.stringify(json))
        setNotifStatus('unknown')
        return
      }
      setNotifStatus('granted')
    } catch (e) {
      alert('エラー: ' + String(e))
      setNotifStatus('unknown')
    }
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

        {/* プッシュ通知 */}
        <div className="bg-white rounded-xl p-4 space-y-2 shadow-sm">
          <label className="text-sm font-medium text-gray-700">プッシュ通知</label>
          {notifStatus === 'granted' ? (
            <div className="flex items-center gap-2 py-2">
              <span className="text-green-500 text-lg">✓</span>
              <p className="text-sm text-green-600 font-medium">通知が有効です</p>
            </div>
          ) : notifStatus === 'denied' ? (
            <div>
              <p className="text-sm text-red-500">通知がブロックされています</p>
              <p className="text-xs text-gray-400 mt-1">ブラウザの設定から通知を許可してください</p>
            </div>
          ) : (
            <button
              onClick={enableNotifications}
              disabled={notifStatus === 'registering'}
              className="w-full py-3 rounded-xl bg-orange-500 text-white font-medium text-sm disabled:opacity-50"
            >
              {notifStatus === 'registering' ? '設定中...' : '🔔 通知を有効にする'}
            </button>
          )}
          <p className="text-xs text-gray-400">アーリー/レイト依頼などの通知を受け取れます</p>
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
