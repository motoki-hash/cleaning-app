'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Company = { id: string; name: string }

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<'loading' | 'form' | 'done' | 'error'>('loading')
  const [companies, setCompanies] = useState<Company[]>([])
  const [name, setName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const init = async () => {
      // 招待リンクからのアクセスか確認
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // ハッシュフラグメントのトークンを処理
        const hash = window.location.hash
        if (!hash.includes('access_token')) {
          setStep('error')
          return
        }
        // Supabaseが自動でセッションを設定するまで少し待つ
        await new Promise(r => setTimeout(r, 1000))
        const { data: { session: s2 } } = await supabase.auth.getSession()
        if (!s2) { setStep('error'); return }
      }

      const { data: companies } = await supabase
        .from('cleaning_companies')
        .select('id, name')
        .order('name')
      setCompanies(companies || [])
      setStep('form')
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!name.trim() || !companyId || !password) {
      setErrorMsg('すべての項目を入力してください')
      return
    }
    if (password.length < 8) {
      setErrorMsg('パスワードは8文字以上にしてください')
      return
    }
    setSaving(true)
    setErrorMsg('')

    // パスワードを設定
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) { setErrorMsg(pwError.message); setSaving(false); return }

    // cleanersレコードを作成
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // 既存レコードがあれば更新、なければ作成
      const { data: existing } = await supabase
        .from('cleaners')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        await supabase.from('cleaners').update({ name: name.trim(), company_id: companyId }).eq('id', existing.id)
      } else {
        await supabase.from('cleaners').insert({ user_id: user.id, name: name.trim(), company_id: companyId, is_active: true })
      }
    }

    setStep('done')
    setTimeout(() => router.push('/cleaner'), 1500)
  }

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">読み込み中...</p>
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-gray-700 font-medium mb-2">無効なリンクです</p>
        <p className="text-sm text-gray-500">管理者から招待メールを再送してもらってください</p>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-4xl mb-4">✅</p>
        <p className="text-gray-700 font-medium">登録完了！アプリに移動します...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6">
        <div className="text-center mb-6">
          <p className="text-3xl mb-2">🧹</p>
          <h1 className="text-lg font-bold text-gray-800">アカウント登録</h1>
          <p className="text-xs text-gray-500 mt-1">招待された清掃員の方はこちらから登録してください</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">お名前</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：田中 太郎"
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">所属会社</label>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 bg-white"
            >
              <option value="">会社を選択してください</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">パスワード（8文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワードを設定"
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-medium text-sm disabled:opacity-50"
          >
            {saving ? '登録中...' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  )
}
