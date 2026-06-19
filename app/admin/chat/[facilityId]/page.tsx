'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ChatMessage = {
  id: string
  type: string
  content: string
  created_at: string
  early_late_request_id: string | null
  sender_id: string | null
  sender_name: string | null
}

export default function AdminChatPage() {
  const router = useRouter()
  const params = useParams()
  const facilityId = params.facilityId as string
  const bottomRef = useRef<HTMLDivElement>(null)

  const [facility, setFacility] = useState<{ name: string; area: string } | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      const [facRes, msgRes] = await Promise.all([
        supabase.from('facilities').select('name, area').eq('id', facilityId).single(),
        supabase.from('chat_messages').select('*').eq('facility_id', facilityId).order('created_at'),
      ])
      setFacility(facRes.data)
      setMessages(msgRes.data || [])
      setLoading(false)

      const channel = supabase
        .channel(`admin-chat:${facilityId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `facility_id=eq.${facilityId}`,
        }, payload => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new as ChatMessage]
          })
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }
    init()
  }, [facilityId, router])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages])

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return
    setSending(true)
    const content = inputText.trim()
    setInputText('')

    await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      type: 'note',
      content,
      sender_id: currentUserId,
      sender_name: '管理者',
    })

    // 清掃員全員にプッシュ通知
    const notifyRes = await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '💬 管理者',
        body: content,
        url: `/cleaner/chat/${facilityId}`,
        excludeUserId: currentUserId,
      }),
    })
    const notifyJson = await notifyRes.json()
    alert(`通知結果: ${JSON.stringify(notifyJson)}`)

    setSending(false)
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  // 日付グループ化
  let lastDate = ''

  return (
    <div className="min-h-screen bg-[#b2c9d7] flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin?tab=chat')} className="text-white text-2xl leading-none">‹</button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{facility?.name}</p>
          <p className="text-xs opacity-60">{facility?.area}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.map(msg => {
          const isNote = msg.type === 'note'
          const isMyMessage = isNote && msg.sender_id === currentUserId
          const isStatusUpdate = msg.type === 'status_update'
          const msgDate = formatDate(msg.created_at)
          const showDate = msgDate !== lastDate
          lastDate = msgDate

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-2">
                  <span className="text-xs text-white bg-black/20 px-3 py-1 rounded-full">{msgDate}</span>
                </div>
              )}

              {msg.type === 'early_late_request' ? (
                <div className="flex justify-center">
                  <div className="bg-white rounded-2xl px-4 py-3 text-sm max-w-[90%] shadow-sm border border-orange-300">
                    <p className="text-orange-600 font-bold text-xs mb-1">🔔 依頼</p>
                    <p className="text-blue-700 font-medium whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              ) : isNote ? (
                <div className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                  {!isMyMessage && (
                    <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white text-xs flex-shrink-0">
                      {(msg.sender_name || '?').slice(0, 1)}
                    </div>
                  )}
                  <div className={`max-w-[70%] flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                    {!isMyMessage && (
                      <p className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_name || '清掃員'}</p>
                    )}
                    <div className={`rounded-2xl px-4 py-2 text-sm ${
                      isMyMessage ? 'bg-gray-700 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm'
                    }`}>
                      <p>{msg.content}</p>
                    </div>
                    <p className={`text-xs mt-0.5 ${isMyMessage ? 'text-white/60 text-right' : 'text-gray-400 ml-1'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] text-center ${
                    isStatusUpdate
                      ? msg.content.includes('完了') ? 'bg-green-500 text-white' : 'bg-yellow-400 text-white'
                      : 'bg-white/90 text-gray-600'
                  }`}>
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-0.5 ${isStatusUpdate ? 'text-white/70' : 'text-gray-400'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="bg-[#f0f0f0] border-t px-2 py-2 flex gap-2 items-end">
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="メッセージを入力..."
          rows={1}
          className="flex-1 bg-white rounded-2xl px-4 py-2 text-sm resize-none outline-none max-h-24"
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!inputText.trim() || sending}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            inputText.trim() ? 'bg-gray-700 text-white' : 'bg-gray-300 text-gray-400'
          }`}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
