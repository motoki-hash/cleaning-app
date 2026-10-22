'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PIN_LENGTH, AUTO_LOCK_MS, isUnlocked, markUnlocked, lockNow } from '@/lib/pjb/pin'

type Phase = 'loading' | 'login' | 'open'

// PJ予算管理の入口。PIN（6桁）だけでログインする。メールアドレス・パスワードは不要。
// 一定時間（AUTO_LOCK_MS）操作がなければ、自動でログアウトしてPIN入力に戻る。
export default function PinGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && isUnlocked()) { setPhase('open'); return }
      // 操作のないまま時間がたった／別のログインが残っている場合は、いったん外してPINから入り直す
      if (session) await supabase.auth.signOut({ scope: 'local' })
      setPhase('login')
    })
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') setPhase('login')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 最後の操作時刻を共有ストレージに記録し、一定時間操作がなければログアウトする
  useEffect(() => {
    if (phase !== 'open') return
    let last = 0
    const touch = () => {
      const now = Date.now()
      if (now - last < 5000) return
      last = now
      markUnlocked()
    }
    const check = async () => {
      if (!isUnlocked()) {
        lockNow()
        await supabase.auth.signOut({ scope: 'local' })
        setPhase('login')
      }
    }
    touch()
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach(e => window.addEventListener(e, touch, { passive: true }))
    const timer = setInterval(check, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      events.forEach(e => window.removeEventListener(e, touch))
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase])

  const login = async (pin: string): Promise<string | null> => {
    let res: Response
    try {
      res = await fetch('/api/pjb/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    } catch {
      return '通信に失敗しました。ネットワークを確認してください'
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const left = typeof json.remaining === 'number' ? `（あと${json.remaining}回でしばらく入力できなくなります）` : ''
      return `${json.error || 'ログインに失敗しました'}${res.status === 401 ? left : ''}`
    }
    const { error } = await supabase.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token })
    if (error) return `ログインに失敗しました：${error.message}`
    markUnlocked()
    setPhase('open')
    return null
  }

  if (phase === 'loading') return <div className="min-h-screen bg-slate-100" />
  if (phase === 'open') return <>{children}</>
  return <PinScreen onSubmit={login} />
}

function PinScreen({ onSubmit }: { onSubmit: (pin: string) => Promise<string | null> }) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const submit = useCallback(async (pin: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const err = await onSubmit(pin)
    busyRef.current = false
    setBusy(false)
    if (err) {
      setMessage(err); setShake(true); setValue('')
      setTimeout(() => setShake(false), 400)
    }
  }, [onSubmit])

  const press = useCallback((d: string) => {
    if (busyRef.current) return
    setMessage('')
    setValue(prev => {
      if (prev.length >= PIN_LENGTH) return prev
      const next = prev + d
      if (next.length === PIN_LENGTH) setTimeout(() => submit(next), 120)
      return next
    })
  }, [submit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setValue(v => v.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  const keyCls = 'h-14 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-[22px] font-medium text-slate-900 disabled:opacity-40'

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-8 text-center">
        <div className="text-[12px] font-mono tracking-wide text-slate-400">BARE NOTE STUDIO</div>
        <h1 className="text-[20px] font-bold text-slate-900 mt-1">PINを入力</h1>
        <p className="text-[13.5px] text-slate-500 mt-2 mb-6">BNS PJ管理システムを開くには、{PIN_LENGTH}桁のPINが必要です</p>

        <div className={`flex justify-center gap-3 mb-3 ${shake ? 'animate-pulse' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${i < value.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`} />
          ))}
        </div>

        <div className="min-h-10 text-[13px] flex items-center justify-center text-rose-600">
          {busy ? <span className="text-slate-500">確認中…</span> : message}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button key={d} onClick={() => press(d)} disabled={busy} className={keyCls}>{d}</button>
          ))}
          <span />
          <button onClick={() => press('0')} disabled={busy} className={keyCls}>0</button>
          <button onClick={() => setValue(v => v.slice(0, -1))} aria-label="1文字消す" className="h-14 rounded-xl text-[18px] text-slate-500 hover:bg-slate-50 active:bg-slate-100">⌫</button>
        </div>

        <p className="mt-6 text-[12px] text-slate-400">PINが分からない場合は、管理者に確認してください</p>
      </div>
    </div>
  )
}
