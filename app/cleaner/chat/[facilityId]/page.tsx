'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCleanerId } from '@/lib/cleanerAuth'

type Room = { id: string; room_number: string }
type CleaningRecord = {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  room_id: string
  rooms: Room | null
}
type ChatMessage = {
  id: string
  type: string
  content: string
  created_at: string
  cleaning_record_id: string | null
  early_late_request_id: string | null
  sender_id: string | null
  sender_name: string | null
}
type EarlyLateRequest = {
  id: string
  type: string
  requested_time: string | null
  request_date: string | null
  message: string | null
  status: string
  rooms?: { room_number: string } | null
}
type RoomEvent = {
  id: string
  room_id: string | null
  event_type: '内覧' | '是正' | '修繕' | '点検'
  event_date: string
  start_time: string
  end_time: string
  note: string | null
  rooms: { room_number: string } | null
}

export default function FacilityChatPage() {
  const router = useRouter()
  const params = useParams()
  const facilityId = params?.facilityId as string
  const bottomRef = useRef<HTMLDivElement>(null)

  const [facility, setFacility] = useState<{ name: string; area: string } | null>(null)
  const [records, setRecords] = useState<CleaningRecord[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [showTroubleForm, setShowTroubleForm] = useState<string | null>(null)
  const [troubleTitle, setTroubleTitle] = useState('')
  const [troubleDesc, setTroubleDesc] = useState('')
  const [troublePriority, setTroublePriority] = useState<'low'|'medium'|'high'|'urgent'>('medium')
  const [activeTab, setActiveTab] = useState<'chat' | 'photos'>('chat')
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('清掃員')
  const [pendingRequests, setPendingRequests] = useState<EarlyLateRequest[]>([])
  const [allRequests, setAllRequests] = useState<EarlyLateRequest[]>([])
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showRequestList, setShowRequestList] = useState(false)
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({})
  const [adminLastReadAt, setAdminLastReadAt] = useState<string | null>(null)
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([])
  const requestRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    let msgChannel: ReturnType<typeof supabase.channel> | null = null
    let recChannel: ReturnType<typeof supabase.channel> | null = null
    let readsChannel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      const cleanerId = getCleanerId()
      if (!cleanerId) { router.push('/login'); return }

      setCurrentUserId(cleanerId)

      const { data: cleaner } = await supabase
        .from('cleaners').select('id, name').eq('id', cleanerId).single()
      if (!cleaner) { setLoading(false); return }
      if (cleaner.name) setCurrentUserName(cleaner.name)

      const today = new Date().toISOString().split('T')[0]

      // まず施設情報と部屋IDを取得
      const [facRes, roomsRes] = await Promise.all([
        supabase.from('facilities').select('name, area').eq('id', facilityId).single(),
        supabase.from('rooms').select('id, room_number').eq('facility_id', facilityId),
      ])
      setFacility(facRes.data)

      const roomIds = (roomsRes.data || []).map(r => r.id)
      if (roomIds.length === 0) { setLoading(false); return }

      // 部屋IDで清掃レコード・チャット・依頼を取得
      const [recRes, msgRes, reqRes, readsRes, eventsRes] = await Promise.all([
        supabase.from('cleaning_records')
          .select('id, status, started_at, completed_at, room_id, rooms(id, room_number)')
          .eq('scheduled_date', today)
          .in('room_id', roomIds)
          .order('created_at'),
        supabase.from('chat_messages')
          .select('*')
          .eq('facility_id', facilityId)
          .order('created_at'),
        supabase.from('early_late_requests')
          .select('id, type, requested_time, request_date, message, status, rooms(room_number)')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false }),
        supabase.from('message_reads')
          .select('reader, last_read_at')
          .eq('facility_id', facilityId),
        supabase.from('room_events')
          .select('id, room_id, event_type, event_date, start_time, end_time, note, rooms(room_number)')
          .eq('facility_id', facilityId)
          .gte('event_date', today)
          .order('event_date'),
      ])

      // 同じroom_idの重複レコードを除去（最新1件のみ残す）
      const raw = (recRes.data as unknown as CleaningRecord[]) || []
      const seen = new Map<string, CleaningRecord>()
      for (const r of raw) {
        if (!seen.has(r.room_id)) seen.set(r.room_id, r)
      }
      setRecords(Array.from(seen.values()))
      setMessages(msgRes.data || [])
      const allReqs = (reqRes.data as unknown as EarlyLateRequest[]) || []
      setPendingRequests(allReqs.filter(r => r.status === 'pending'))
      setAllRequests(allReqs)

      setRoomEvents((eventsRes.data as unknown as RoomEvent[]) || [])
      const adminRead = (readsRes.data || []).find(r => r.reader === 'admin')
      setAdminLastReadAt(adminRead?.last_read_at || null)

      // 清掃員の既読を登録
      await supabase.from('message_reads').upsert(
        { facility_id: facilityId, reader: 'cleaner', last_read_at: new Date().toISOString() },
        { onConflict: 'facility_id,reader' }
      )
      setLoading(false)

      // リアルタイム購読
      msgChannel = supabase
        .channel(`chat:${facilityId}`)
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
          supabase.from('message_reads').upsert(
            { facility_id: facilityId, reader: 'cleaner', last_read_at: new Date().toISOString() },
            { onConflict: 'facility_id,reader' }
          )
        })
        .subscribe()

      recChannel = supabase
        .channel(`records:${facilityId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'cleaning_records',
        }, payload => {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        })
        .subscribe()

      readsChannel = supabase
        .channel(`cleaner-reads:${facilityId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'message_reads',
          filter: `facility_id=eq.${facilityId}`,
        }, payload => {
          if (payload.new && (payload.new as { reader: string }).reader === 'admin') {
            setAdminLastReadAt((payload.new as { last_read_at: string }).last_read_at)
          }
        })
        .subscribe()
    }
    init()

    return () => {
      if (msgChannel) supabase.removeChannel(msgChannel)
      if (recChannel) supabase.removeChannel(recChannel)
      if (readsChannel) supabase.removeChannel(readsChannel)
    }
  }, [facilityId, router])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages])

  const addMessage = async (type: string, content: string, recordId?: string) => {
    await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      cleaning_record_id: recordId || null,
      type,
      content,
      sender_id: type === 'note' ? currentUserId : null,
      sender_name: type === 'note' ? currentUserName : null,
    })
    // Realtimeが自動でsetMessagesするので手動追加不要

    // noteメッセージは他のユーザーにプッシュ通知＋Slack通知
    if (type === 'note' && currentUserId) {
      fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `💬 ${currentUserName}`,
          body: content,
          url: `/cleaner/chat/${facilityId}`,
          excludeUserId: currentUserId,
        }),
      })
      const pathMatch = typeof window !== 'undefined'
        ? window.location.pathname.match(/\/cleaner\/chat\/([^/?#]+)/)
        : null
      const currentFacilityId = pathMatch?.[1] || facilityId
      fetch('/api/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'chat',
          facilityId: currentFacilityId,
          facilityName: facility?.name || currentFacilityId,
          message: `${currentUserName}：${content}`,
          _debugUrl: typeof window !== 'undefined' ? window.location.pathname : 'ssr',
        }),
      })
    }
  }

  const updateStatus = async (recordId: string, newStatus: string) => {
    const now = new Date().toISOString()
    const updates: Record<string, string> = { status: newStatus }
    if (newStatus === 'in_progress') updates.started_at = now
    if (newStatus === 'completed') updates.completed_at = now

    await supabase.from('cleaning_records').update(updates).eq('id', recordId)
    const record = records.find(r => r.id === recordId)
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updates } : r))
    setSelectedRecord(null)

    const room = record?.rooms?.room_number || ''
    const content = newStatus === 'in_progress'
      ? `🧹 ${room}号室の清掃を開始しました`
      : `✅ ${room}号室の清掃が完了しました`
    await addMessage('status_update', content, recordId)

    fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        facilityName: facility?.name || '',
        roomNumber: room,
        area: facility?.area || '',
      }),
    })
  }

  const uploadPhotos = async (recordId: string, files: File[], type: 'before' | 'after' | 'issue') => {
    setUploading(`${recordId}-${type}`)
    let successCount = 0
    await Promise.all(files.map(async file => {
      const ext = file.name.split('.').pop()
      const path = `${recordId}/${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error } = await supabase.storage.from('cleaning-photos').upload(path, file)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('cleaning-photos').getPublicUrl(path)
        await supabase.from('cleaning_photos').insert({ cleaning_record_id: recordId, photo_url: publicUrl, photo_type: type })
        successCount++
      }
    }))
    if (successCount > 0) {
      const room = records.find(r => r.id === recordId)?.rooms?.room_number
      const typeLabel = type === 'after' ? '清掃後' : type === 'issue' ? '問題' : '清掃前'
      const countText = successCount > 1 ? `${successCount}枚` : ''
      await addMessage('system', `📷 ${room}号室の${typeLabel}写真${countText}を追加しました`, recordId)
      fetch('/api/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'photo',
          facilityId,
          facilityName: facility?.name || '',
          area: facility?.area || '',
          roomNumber: room,
          photoType: typeLabel,
          photoCount: successCount,
        }),
      }).catch(() => {})
    }
    setUploading(null)
  }

  const submitTrouble = async (recordId: string) => {
    if (!troubleTitle) return
    const record = records.find(r => r.id === recordId)
    await supabase.from('trouble_reports').insert({
      room_id: record?.room_id,
      cleaning_record_id: recordId,
      title: troubleTitle,
      description: troubleDesc,
      priority: troublePriority,
    })
    await addMessage('system', `⚠️ ${record?.rooms?.room_number}号室 トラブル報告「${troubleTitle}」`, recordId)
    setShowTroubleForm(null)
    setTroubleTitle('')
    setTroubleDesc('')
  }

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return
    setSending(true)
    try {
      await addMessage('note', inputText.trim())
      setInputText('')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  const pendingRooms = records.filter(r => r.status === 'scheduled' || r.status === 'in_progress')
  const completedCount = records.filter(r => r.status === 'completed').length

  // 自分が送った最後のメッセージのうち管理者が既読済みのもの
  const myMessages = messages.filter(m => m.type === 'note' && m.sender_id === currentUserId)
  const lastReadByAdminMsg = adminLastReadAt
    ? [...myMessages].reverse().find(m => m.created_at <= adminLastReadAt)
    : null

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-[#b2c9d7] flex flex-col">
      {/* ヘッダー（LINE風） */}
      <header className="bg-[#00b900] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/cleaner')} className="text-white text-2xl leading-none">‹</button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{facility?.name}</p>
          <p className="text-xs opacity-80">{completedCount}/{records.length}部屋完了</p>
        </div>
        <div className="flex gap-1">
          {(['chat', 'photos'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-2 py-1 rounded ${activeTab === tab ? 'bg-white text-[#00b900] font-medium' : 'text-white/80'}`}
            >
              {tab === 'chat' ? '清掃' : '写真'}
            </button>
          ))}
          <button
            onClick={() => setShowRequestList(true)}
            className="relative text-xs px-2 py-1 rounded text-white/80"
          >
            依頼
            {(allRequests.filter(r => r.status === 'pending' || r.status === 'hold').length > 0) && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {allRequests.filter(r => r.status === 'pending' || r.status === 'hold').length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 内覧・是正バナー */}
      {roomEvents.length > 0 && (
        <div style={{ position: 'sticky', top: '52px', zIndex: 19 }}
          className="bg-purple-600 text-white px-4 py-2">
          {roomEvents.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs py-0.5">
              <span>{ev.event_type === '内覧' ? '👀' : ev.event_type === '是正' ? '🔧' : ev.event_type === '修繕' ? '🔨' : '🔍'}</span>
              <span className="font-bold">{ev.event_type}</span>
              {ev.rooms ? <span>{ev.rooms.room_number}号室</span> : <span>施設全体</span>}
              <span>{ev.start_time.slice(0,5)}〜{ev.end_time.slice(0,5)}</span>
              {ev.note && <span className="opacity-80">/ {ev.note}</span>}
            </div>
          ))}
        </div>
      )}

      {/* 未回答の依頼バナー（スクロールしても固定） */}
      {pendingRequests.length > 0 && (
        <div
          style={{ position: 'sticky', top: '52px', zIndex: 20 }}
          onClick={() => setShowRequestModal(true)}
          className="bg-orange-500 text-white px-4 py-2 flex items-center gap-2 cursor-pointer active:bg-orange-600"
        >
          <span className="text-sm">🔔</span>
          <div className="flex-1">
            <p className="text-xs font-bold">
              未回答の依頼が {pendingRequests.length}件あります
            </p>
            <p className="text-xs opacity-80">
              {[...new Set(pendingRequests.map(r => r.type === 'early_checkin' ? 'アーリーチェックイン' : 'レイトチェックアウト'))].join('・')}
            </p>
          </div>
          <span className="text-white/70 text-sm">›</span>
        </div>
      )}

      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* チャットエリア（スクロール可能） */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {/* 最初のシステムメッセージ */}
            <div className="flex justify-center">
              <span className="text-xs text-white bg-black/20 px-3 py-1 rounded-full">
                {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              </span>
            </div>
            <div className="flex justify-center">
              <div className="bg-white/90 rounded-2xl px-4 py-2 text-xs text-gray-600 text-center max-w-[280px]">
                📋 本日 {records.length}部屋の清掃が割り当てられています
              </div>
            </div>

            {/* チャットメッセージ */}
            {messages.map(msg => {
              const isNote = msg.type === 'note'
              const isStatusUpdate = msg.type === 'status_update'
              const isMyMessage = isNote && msg.sender_id === currentUserId
              const isLastReadByAdmin = lastReadByAdminMsg?.id === msg.id

              if (isNote) {
                return (
                  <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                    {!isMyMessage && (
                      <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs flex-shrink-0">
                        {(msg.sender_name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className={`max-w-[70%] ${isMyMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!isMyMessage && (
                        <p className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_name || '清掃員'}</p>
                      )}
                      <div className={`rounded-2xl px-4 py-2 text-sm ${
                        isMyMessage ? 'bg-[#00b900] text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm'
                      }`}>
                        <p>{msg.content}</p>
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isMyMessage ? 'flex-row-reverse' : ''}`}>
                        <p className={`text-xs ${isMyMessage ? 'text-white/60' : 'text-gray-400 ml-1'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }

              // アーリー/レイト依頼メッセージ（回答ボタン付き）
              if (msg.type === 'early_late_request') {
                return (
                  <div key={msg.id} className="flex justify-center" ref={el => { requestRefs.current[msg.id] = el }}>
                    <div className="bg-white rounded-2xl px-4 py-3 text-sm max-w-[90%] shadow-sm border border-orange-300">
                      <p className="text-orange-600 font-bold text-xs mb-1">🔔 依頼</p>
                      <p className="text-blue-700 font-medium whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</p>
                      <RequestReplyButtons
                        requestId={msg.early_late_request_id}
                        facilityId={facilityId}
                        onReplied={(newStatus) => {
                          if (newStatus !== 'hold') setPendingRequests(prev => prev.filter(r => r.id !== msg.early_late_request_id))
                          setAllRequests(prev => prev.map(r => r.id === msg.early_late_request_id ? { ...r, status: newStatus } : r))
                        }} />
                    </div>
                  </div>
                )
              }

              return (
                <div key={msg.id} className="flex justify-center">
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
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* テキスト入力欄（LINE風） */}
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
                inputText.trim() ? 'bg-[#00b900] text-white' : 'bg-gray-300 text-gray-400'
              }`}
            >
              ▶
            </button>
          </div>

          {/* 下部アクションエリア */}
          <div className="bg-white border-t safe-area-bottom">
            {pendingRooms.length > 0 ? (
              <div className="px-3 pt-3 pb-2">
                <p className="text-xs text-gray-400 mb-2">部屋を選択してアクションを実行</p>
                <div className="flex flex-wrap gap-2">
                  {pendingRooms.map(record => (
                    <button
                      key={record.id}
                      onClick={() => setSelectedRecord(selectedRecord === record.id ? null : record.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        selectedRecord === record.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : record.status === 'in_progress'
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                          : 'bg-gray-50 text-gray-700 border-gray-300'
                      }`}
                    >
                      {record.rooms?.room_number}号室
                      {record.status === 'in_progress' && ' 🧹'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-sm text-green-600 font-medium">
                🎉 全部屋の清掃が完了しました！
              </div>
            )}
          </div>

          {/* 未回答依頼モーダル */}
          {showRequestModal && (
            <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowRequestModal(false)}>
              <div className="w-full bg-white rounded-t-2xl shadow-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-800">🔔 未回答の依頼</p>
                  <button onClick={() => setShowRequestModal(false)} className="text-gray-400 text-2xl leading-none">×</button>
                </div>
                {pendingRequests.map(req => (
                  <div key={req.id} className="border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-bold text-orange-600">
                      {req.type === 'early_checkin' ? 'アーリーチェックイン' : 'レイトチェックアウト'}
                    </p>
                    {(() => {
                      const rt = req.requested_time
                      if (!rt) return null
                      const parts = rt.split(' ')
                      const date = parts[0]?.match(/^\d{4}-\d{2}-\d{2}$/) ? parts[0] : null
                      const time = (date ? parts[1] : parts[0])?.slice(0, 5) || null
                      return (
                        <p className="text-sm text-gray-700">
                          {date ? `📅 ${date}` : '📅 日付未設定'}
                          {time && ` 🕐 ${time}`}
                        </p>
                      )
                    })()}
                    {req.message && <p className="text-sm text-gray-700">{req.message}</p>}
                    <RequestReplyButtons
                      requestId={req.id}
                      facilityId={facilityId}
                      onReplied={() => {
                        setPendingRequests(prev => prev.filter(r => r.id !== req.id))
                        if (pendingRequests.length <= 1) setShowRequestModal(false)
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 選択した部屋のアクション（オーバーレイ） */}
          {selectedRecord && (() => {
            const record = records.find(r => r.id === selectedRecord)
            if (!record) return null
            return (
              <div className="fixed inset-0 z-50 flex items-end" onClick={() => { setSelectedRecord(null); setShowTroubleForm(null) }}>
                <div className="w-full bg-white rounded-t-2xl shadow-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-gray-800">{record.rooms?.room_number}号室</p>
                    <button onClick={() => { setSelectedRecord(null); setShowTroubleForm(null) }} className="text-gray-400 text-2xl leading-none">×</button>
                  </div>
                  <div className="flex gap-2">
                    {record.status === 'scheduled' && (
                      <button onClick={() => updateStatus(record.id, 'in_progress')}
                        className="flex-1 bg-yellow-500 text-white py-3 rounded-xl text-base font-bold">
                        🧹 清掃開始
                      </button>
                    )}
                    {record.status === 'in_progress' && (
                      <button onClick={() => updateStatus(record.id, 'completed')}
                        className="flex-1 bg-green-500 text-white py-3 rounded-xl text-base font-bold">
                        ✅ 清掃完了
                      </button>
                    )}
                  </div>

                  {/* 写真アップロード */}
                  {record.status !== 'scheduled' && (
                    <div className="flex gap-2">
                      {(['after', 'issue'] as const).map(type => (
                        <label key={type} className="flex-1 cursor-pointer">
                          <input type="file" accept="image/*" multiple className="hidden"
                            onChange={e => {
                              const files = Array.from(e.target.files || [])
                              if (files.length > 0) uploadPhotos(record.id, files, type)
                              e.target.value = ''
                            }} />
                          <span className={`block text-center text-xs py-2 rounded-xl border ${
                            uploading === `${record.id}-${type}` ? 'bg-gray-100 text-gray-400' : 'border-gray-300 text-gray-600'
                          }`}>
                            {uploading === `${record.id}-${type}` ? '...' :
                              type === 'after' ? '📷清掃後' : '📷問題'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* トラブル報告フォーム */}
                  {showTroubleForm === record.id && (
                    <div className="space-y-2 bg-red-50 p-3 rounded-xl">
                      <input type="text" placeholder="タイトル" value={troubleTitle}
                        onChange={e => setTroubleTitle(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                      <textarea placeholder="詳細..." value={troubleDesc}
                        onChange={e => setTroubleDesc(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm h-16" />
                      <div className="flex gap-2">
                        <select value={troublePriority}
                          onChange={e => setTroublePriority(e.target.value as 'low'|'medium'|'high'|'urgent')}
                          className="flex-1 border rounded-lg px-2 py-2 text-sm">
                          <option value="low">低</option>
                          <option value="medium">中</option>
                          <option value="high">高</option>
                          <option value="urgent">緊急</option>
                        </select>
                        <button onClick={() => submitTrouble(record.id)}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium">送信</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        <PhotosTab facilityId={facilityId} />
      )}

      {/* 依頼一覧モーダル */}
      {showRequestList && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowRequestList(false)}>
          <div className="w-full bg-white rounded-t-2xl shadow-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-800">📋 依頼一覧</p>
              <button onClick={() => setShowRequestList(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            {(() => {
              const today = new Date().toISOString().split('T')[0]
              const current = allRequests.filter(r => !r.request_date || r.request_date >= today)
              const past = allRequests.filter(r => r.request_date && r.request_date < today)

              // 過去分を日付ごとにグループ化
              const pastByDate: Record<string, EarlyLateRequest[]> = {}
              for (const r of past) {
                const d = r.request_date!
                if (!pastByDate[d]) pastByDate[d] = []
                pastByDate[d].push(r)
              }

              const renderReq = (req: EarlyLateRequest) => {
                const typeLabel = req.type === 'early_checkin' ? 'アーリーチェックイン' : 'レイトチェックアウト'
                const rt = req.requested_time || ''
                const time = rt.includes(' ') ? rt.split(' ')[1]?.slice(0, 5) : rt.slice(0, 5)
                const statusInfo =
                  req.status === 'accepted' ? { label: '✅ 受けます', color: 'text-green-600' } :
                  req.status === 'declined' ? { label: '❌ 受けれません', color: 'text-red-500' } :
                  req.status === 'hold' ? { label: '⏸ 保留中', color: 'text-yellow-600' } :
                  { label: '⏳ 未回答', color: 'text-orange-500' }
                const needsAction = req.status === 'pending' || req.status === 'hold'
                return (
                  <div key={req.id} className={`border rounded-xl p-3 mb-2 ${
                    req.status === 'pending' ? 'border-orange-300 bg-orange-50' :
                    req.status === 'hold' ? 'border-yellow-300 bg-yellow-50' :
                    'border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{typeLabel}</p>
                        {req.rooms?.room_number && <p className="text-xs text-gray-500">{req.rooms.room_number}号室</p>}
                        {time && <p className="text-xs text-gray-600 mt-0.5">🕐 {time}</p>}
                        {req.message && <p className="text-xs text-gray-500 mt-0.5">{req.message}</p>}
                      </div>
                      <span className={`text-xs font-medium ${statusInfo.color} ml-2 flex-shrink-0`}>{statusInfo.label}</span>
                    </div>
                    {needsAction && (
                      <RequestReplyButtons
                        requestId={req.id}
                        facilityId={facilityId}
                        initialStatus={req.status}
                        onReplied={(newStatus) => {
                          setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: newStatus } : r))
                          setPendingRequests(prev => prev.filter(r => r.id !== req.id))
                        }}
                      />
                    )}
                  </div>
                )
              }

              return (
                <>
                  {allRequests.length === 0 && <p className="text-sm text-gray-400 text-center py-6">依頼はありません</p>}

                  {/* 今日以降 */}
                  {[...current].sort((a, b) => {
                    const order = (s: string) => s === 'pending' ? 0 : s === 'hold' ? 1 : 2
                    return order(a.status) - order(b.status)
                  }).map(renderReq)}

                  {/* 過去（日付ごとに折りたたみ） */}
                  {Object.keys(pastByDate).length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-bold text-gray-400 mb-2">過去の依頼</p>
                      {Object.entries(pastByDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, reqs]) => (
                        <div key={date} className="mb-2">
                          <button
                            onClick={() => setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }))}
                            className="w-full flex items-center justify-between text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2"
                          >
                            <span>📅 {date}（{reqs.length}件）</span>
                            <span>{expandedDates[date] ? '▲' : '▼'}</span>
                          </button>
                          {expandedDates[date] && (
                            <div className="mt-1 pl-1">
                              {reqs.map(renderReq)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function RequestReplyButtons({ requestId, facilityId, initialStatus, onReplied }: { requestId: string | null; facilityId: string; initialStatus?: string; onReplied?: (newStatus: string) => void }) {
  const [status, setStatus] = useState<string | null>(
    initialStatus && initialStatus !== 'pending' && initialStatus !== 'hold' ? initialStatus : null
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!requestId) return
    if (initialStatus && initialStatus !== 'pending' && initialStatus !== 'hold') return
    supabase.from('early_late_requests').select('status').eq('id', requestId).single()
      .then(({ data }) => { if (data && data.status !== 'pending' && data.status !== 'hold') setStatus(data.status) })
  }, [requestId, initialStatus])

  const reply = async (answer: 'accepted' | 'declined' | 'hold') => {
    if (!requestId) return
    setSaving(true)

    const { error } = await supabase.from('early_late_requests').update({
      status: answer,
      responded_at: new Date().toISOString(),
    }).eq('id', requestId)
    if (error) {
      await supabase.from('early_late_requests').update({ status: answer }).eq('id', requestId)
    }

    const label = answer === 'accepted' ? '✅ 受けます' : answer === 'declined' ? '❌ 受けれません' : '⏸ 保留中（後で返答します）'
    await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      type: 'status_update',
      content: label,
      sender_id: null,
      sender_name: null,
    })

    if (answer !== 'hold') {
      setStatus(answer)
    }

    setSaving(false)
    onReplied?.(answer)
  }

  if (status) {
    const label = status === 'accepted' ? '✅ 受けます' : status === 'declined' ? '❌ 受けれません' : '⏸ 保留'
    return <p className="text-xs font-medium mt-2 text-gray-600">回答済み: {label}</p>
  }

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={() => reply('accepted')} disabled={saving}
        className="flex-1 bg-green-500 text-white text-xs py-1.5 rounded-lg font-medium">受ける</button>
      <button onClick={() => reply('declined')} disabled={saving}
        className="flex-1 bg-red-500 text-white text-xs py-1.5 rounded-lg font-medium">受けれない</button>
      <button onClick={() => reply('hold')} disabled={saving}
        className="flex-1 bg-yellow-500 text-white text-xs py-1.5 rounded-lg font-medium">保留</button>
    </div>
  )
}

type AllPhoto = {
  id: string
  photo_url: string
  photo_type: string
  cleaning_record_id: string
  cleaning_records: { scheduled_date: string; rooms: { room_number: string } | null } | null
}

function PhotosTab({ facilityId }: { facilityId: string }) {
  const [allPhotos, setAllPhotos] = useState<AllPhoto[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: roomsData } = await supabase.from('rooms').select('id').eq('facility_id', facilityId)
      const roomIds = (roomsData || []).map(r => r.id)
      if (!roomIds.length) { setLoading(false); return }

      const { data: recData } = await supabase.from('cleaning_records').select('id').in('room_id', roomIds)
      const recIds = (recData || []).map(r => r.id)
      if (!recIds.length) { setLoading(false); return }

      const { data } = await supabase.from('cleaning_photos')
        .select('id, photo_url, photo_type, cleaning_record_id, cleaning_records(scheduled_date, rooms(room_number))')
        .in('cleaning_record_id', recIds)
        .order('created_at', { ascending: false })
      setAllPhotos((data as unknown as AllPhoto[]) || [])
      setLoading(false)
    }
    load()
  }, [facilityId])

  const dates = [...new Set(allPhotos.map(p => p.cleaning_records?.scheduled_date).filter(Boolean) as string[])].sort().reverse()
  const datePhotos = selectedDate ? allPhotos.filter(p => p.cleaning_records?.scheduled_date === selectedDate) : []

  // 号室ごとにグループ化
  const grouped: Record<string, AllPhoto[]> = {}
  for (const p of datePhotos) {
    const room = p.cleaning_records?.rooms?.room_number || '不明'
    if (!grouped[room]) grouped[room] = []
    grouped[room].push(p)
  }

  const flatPhotos = datePhotos
  const typeLabel = (t: string) => t === 'after' ? '清掃後' : t === 'issue' ? '問題' : t === 'before' ? '清掃前' : t
  const currentPhoto = lightboxIndex !== null ? flatPhotos[lightboxIndex] : null

  if (loading) return <div className="flex-1 flex items-center justify-center text-white text-sm">読み込み中...</div>

  if (!selectedDate) {
    if (dates.length === 0) return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center"><p className="text-4xl mb-2">📷</p><p className="text-sm">写真はまだありません</p></div>
      </div>
    )
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <p className="text-xs text-gray-500 font-medium mb-3">日付を選択</p>
        <div className="space-y-2">
          {dates.map(d => {
            const count = allPhotos.filter(p => p.cleaning_records?.scheduled_date === d).length
            return (
              <button key={d} onClick={() => setSelectedDate(d)}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between text-left active:bg-gray-50">
                <span className="text-sm font-medium text-gray-800">📅 {d}</span>
                <span className="text-xs text-gray-400">{count}枚 ›</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <button onClick={() => setSelectedDate(null)} className="text-blue-600 text-sm">‹ 日付一覧</button>
        <span className="text-sm text-gray-600">{selectedDate}</span>
      </div>
      <div className="p-4 space-y-4">
        {Object.keys(grouped).length === 0 && <p className="text-sm text-gray-400 text-center py-8">この日の写真はありません</p>}
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'ja', { numeric: true })).map(([room, roomPhotos]) => {
          const afterPhotos = roomPhotos.filter(p => p.photo_type === 'after')
          const issuePhotos = roomPhotos.filter(p => p.photo_type === 'issue')
          const sections = [
            { label: '清掃後', color: 'bg-green-600', photos: afterPhotos },
            { label: '問題', color: 'bg-red-500', photos: issuePhotos },
          ]
          return (
            <div key={room}>
              <p className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">{room}号室</p>
              {sections.map(sec => sec.photos.length === 0 ? null : (
                <div key={sec.label} className="mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${sec.color}`} />
                    {sec.label}（{sec.photos.length}枚）
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {sec.photos.map(photo => {
                      const idx = flatPhotos.findIndex(p => p.id === photo.id)
                      return (
                        <div key={photo.id} className="relative aspect-square cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.photo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* ライトボックス */}
      {currentPhoto && lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: '#000' }}>
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <span className="text-white text-sm">
              {currentPhoto.cleaning_records?.rooms?.room_number}号室 · <span className={currentPhoto.photo_type === 'issue' ? 'text-red-400' : 'text-white/70'}>{typeLabel(currentPhoto.photo_type)}</span>
              <span className="text-white/40 text-xs ml-2">{lightboxIndex + 1} / {flatPhotos.length}</span>
            </span>
            <button onClick={() => setLightboxIndex(null)} className="text-white text-3xl font-light leading-none">×</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentPhoto.photo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          {flatPhotos.length > 1 && (
            <button onClick={() => setLightboxIndex((lightboxIndex - 1 + flatPhotos.length) % flatPhotos.length)}
              className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-start pl-3" style={{ width: '20%' }}>
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-white text-3xl font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>‹</span>
            </button>
          )}
          {flatPhotos.length > 1 && (
            <button onClick={() => setLightboxIndex((lightboxIndex + 1) % flatPhotos.length)}
              className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-end pr-3" style={{ width: '20%' }}>
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-white text-3xl font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>›</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
