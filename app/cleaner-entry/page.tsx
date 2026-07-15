'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCleanerId } from '@/lib/cleanerAuth'

export default function CleanerEntryPage() {
  const router = useRouter()

  useEffect(() => {
    // localStorageにcookieの値を同期
    const id = getCleanerId()
    if (id) localStorage.setItem('cleanerId', id)

    // PWAスタンドアロンモードなら即リダイレクト
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true)

    if (isStandalone) {
      router.replace('/cleaner')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm text-center space-y-5">
        <div className="text-5xl">📱</div>
        <div>
          <h1 className="text-lg font-bold text-gray-800 mb-1">ホーム画面に追加</h1>
          <p className="text-sm text-gray-500">
            このページをホーム画面に追加すると、次回からすぐに開けます
          </p>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 text-left space-y-2 text-sm text-gray-700">
          <p className="font-bold text-blue-700 mb-2">⚠️ まず先にホーム画面に追加してください</p>
          <p>① 画面下の <span className="font-bold">□↑ ボタン</span> をタップ</p>
          <p>②「<span className="font-bold">ホーム画面に追加</span>」を選択・追加</p>
          <p>③ 追加後に下の「<span className="font-bold">アプリを開く</span>」をタップ</p>
        </div>

        <button
          onClick={() => router.replace('/cleaner')}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-base"
        >
          ホーム画面追加済み → アプリを開く
        </button>
      </div>
    </div>
  )
}
