'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function CleanerEntryPage() {
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    const cleanerId = params.cleanerId as string
    if (cleanerId) {
      localStorage.setItem('cleanerId', cleanerId)
      // PWAホーム画面追加時のためcookieにも保存（1年間有効）
      document.cookie = `cleanerId=${cleanerId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
      router.replace('/cleaner')
    }
  }, [params.cleanerId, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">読み込み中...</p>
    </div>
  )
}
