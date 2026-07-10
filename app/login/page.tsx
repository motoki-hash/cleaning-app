'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('メールアドレスまたはパスワードが違います')
      setLoading(false)
      return
    }

    const user = data.user
    const role = user?.user_metadata?.role

    if (role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/cleaner')
    }
  }

  const handleMagicLink = async () => {
    if (!email) { setError('メールアドレスを入力してください'); return }
    setMagicLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/cleaner` },
    })
    if (error) {
      setError('送信に失敗しました。しばらくしてから再試行してください')
    } else {
      setMagicSent(true)
    }
    setMagicLoading(false)
  }

  if (magicSent) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <p className="text-3xl mb-4">📧</p>
        <p className="font-bold text-gray-800 mb-2">メールを送信しました</p>
        <p className="text-sm text-gray-500">{email} に届いたリンクをタップしてログインしてください</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">清掃管理システム</h1>
        <p className="text-center text-gray-500 text-sm mb-8">ログイン</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="example@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-sm disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-center text-gray-400 mb-3">パスワードを忘れた方・初回ログインの方</p>
          <button
            onClick={handleMagicLink}
            disabled={magicLoading}
            className="w-full border border-gray-300 text-gray-600 py-3 rounded-lg font-medium text-sm disabled:opacity-50"
          >
            {magicLoading ? '送信中...' : 'メールでログインリンクを受け取る'}
          </button>
        </div>
      </div>
    </div>
  )
}
