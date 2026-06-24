'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  message: string | null
  status: string
}

export default function FacilityChatPage() {
  const router = useRouter()
  const params = useParams()
  const facilityId = params.facilityId as string
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
  const [showRequestModal, setShowRequestModal] = useState(false)
  const requestRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      setCurrentUserId(user.id)

      const { data: cleaner } = await supabase
        .from('cleaners').select('id, name').eq('user_id', user.id).single()
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
      const [recRes, msgRes, reqRes] = await Promise.all([
        supabase.from('cleaning_records')
          .select('id, status, started_at, completed_at, room_id, rooms(id, room_number)')
          .eq('cleaner_id', cleaner.id)
          .eq('scheduled_date', today)
          .in('room_id', roomIds)
          .order('created_at'),
        supabase.from('chat_messages')
          .select('*')
          .eq('facility_id', facilityId)
          .order('created_at'),
        supabase.from('early_late_requests')
          .select('id, type, requested_time, message, status')
          .in('room_id', roomIds)
          .eq('status', 'pending'),
      ])

      // 同じroom_idの重複レコードを除去（最新1件のみ残す）
      const raw = (recRes.data as unknown as CleaningRecord[]) || []
      const seen = new Map<string, CleaningRecord>()
      for (const r of raw) {
        if (!seen.has(r.room_id)) seen.set(r.room_id, r)
      }
      setRecords(Array.from(seen.values()))
      setMessages(msgRes.data || [])
      setPendingRequests((reqRes.data as EarlyLateRequest[]) || [])
      setLoading(false)

      // リアルタイム購読
      const msgChannel = supabase
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
        })
        .subscribe()

      const recChannel = supabase
        .channel(`records:${facilityId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'cleaning_records',
        }, payload => {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        })
        .subscribe()

      return () => {
        supabase.removeChannel(msgChannel)
        supabase.removeChannel(recChannel)
      }
    }
    init()
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

    // noteメッセージは他のユーザーにプッシュ通知
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
    await addMessage('note', inputText.trim())
    setInputText('')
    setSending(false)
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  const pendingRooms = records.filter(r => r.status === 'scheduled' || r.status === 'in_progress')
  const completedCount = records.filter(r => r.status === 'completed').length

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
        </div>
      </header>

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
              {pendingRequests.map(r => r.type === 'early_checkin' ? 'アーリーチェックイン' : 'レイトチェックアウト').join('・')}
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
                      <p className={`text-xs mt-0.5 ${isMyMessage ? 'text-white/60 text-right' : 'text-gray-400 ml-1'}`}>
                        {formatTime(msg.created_at)}
                      </p>
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
                        onReplied={() => setPendingRequests(prev => prev.slice(1))} />
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
                    {req.requested_time && (() => {
                      const parts = req.requested_time!.split(' ')
                      const date = parts[0]?.match(/^\d{4}-\d{2}-\d{2}$/) ? parts[0] : null
                      const time = parts[1]?.slice(0, 5) || (parts[0]?.match(/^\d{2}:\d{2}/) ? parts[0].slice(0, 5) : null)
                      return (
                        <p className="text-sm text-gray-700">
                          {date && `📅 ${date}`}{date && time && ' '}{time && `🕐 ${time}`}
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
                    <button
                      onClick={() => setShowTroubleForm(showTroubleForm === record.id ? null : record.id)}
                      className="bg-red-50 text-red-500 border border-red-200 px-4 py-3 rounded-xl text-sm">
                      報告
                    </button>
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
        <PhotosTab records={records} />
      )}
    </div>
  )
}

function RequestReplyButtons({ requestId, facilityId, onReplied }: { requestId: string | null; facilityId: string; onReplied?: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!requestId) return
    supabase.from('early_late_requests').select('status').eq('id', requestId).single()
      .then(({ data }) => { if (data && data.status !== 'pending') setStatus(data.status) })
  }, [requestId])

  const reply = async (answer: 'accepted' | 'declined' | 'hold') => {
    if (!requestId) return
    setSaving(true)

    await supabase.from('early_late_requests').update({
      status: answer,
      responded_at: new Date().toISOString(),
    }).eq('id', requestId)

    const label = answer === 'accepted' ? '✅ 受けます' : answer === 'declined' ? '❌ 受けれません' : '⏸ 保留します'
    await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      type: 'status_update',
      content: label,
      sender_id: null,
      sender_name: null,
    })

    setStatus(answer)
    setSaving(false)
    onReplied?.()
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
        className="flex-1 bg-gray-400 text-white text-xs py-1.5 rounded-lg font-medium">保留</button>
    </div>
  )
}

function PhotosTab({ records }: { records: CleaningRecord[] }) {
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; photo_type: string; cleaning_record_id: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const ids = records.map(r => r.id)
      if (!ids.length) return
      const { data } = await supabase.from('cleaning_photos')
        .select('id, photo_url, photo_type, cleaning_record_id')
        .in('cleaning_record_id', ids)
        .order('created_at', { ascending: false })
      setPhotos(data || [])
    }
    load()
  }, [records])

  if (!photos.length) return (
    <div className="flex-1 flex items-center justify-center text-white">
      <div className="text-center">
        <p className="text-4xl mb-2">📷</p>
        <p className="text-sm">写真はまだありません</p>
      </div>
    </div>
  )

  return (
    <div className="p-2 grid grid-cols-3 gap-1">
      {photos.map(p => {
        const room = records.find(r => r.id === p.cleaning_record_id)?.rooms?.room_number
        const colors: Record<string, string> = { before: 'bg-blue-600', after: 'bg-green-600', issue: 'bg-red-600' }
        const labels: Record<string, string> = { before: '前', after: '後', issue: '問題' }
        return (
          <div key={p.id} className="relative aspect-square">
            <img src={p.photo_url} alt={p.photo_type} className="w-full h-full object-cover rounded-lg" />
            <div className="absolute bottom-1 left-1 flex gap-0.5">
              <span className={`text-xs text-white px-1.5 py-0.5 rounded ${colors[p.photo_type] || 'bg-gray-600'}`}>
                {labels[p.photo_type] || p.photo_type}
              </span>
              {room && <span className="text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">{room}号</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
