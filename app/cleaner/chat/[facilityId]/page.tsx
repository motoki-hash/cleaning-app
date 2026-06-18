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

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cleaner } = await supabase
        .from('cleaners').select('id').eq('user_id', user.id).single()
      if (!cleaner) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]

      // まず施設情報と部屋IDを取得
      const [facRes, roomsRes] = await Promise.all([
        supabase.from('facilities').select('name, area').eq('id', facilityId).single(),
        supabase.from('rooms').select('id, room_number').eq('facility_id', facilityId),
      ])
      setFacility(facRes.data)

      const roomIds = (roomsRes.data || []).map(r => r.id)
      if (roomIds.length === 0) { setLoading(false); return }

      // 部屋IDで清掃レコードとチャットを取得
      const [recRes, msgRes] = await Promise.all([
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
      ])

      setRecords((recRes.data as unknown as CleaningRecord[]) || [])
      setMessages(msgRes.data || [])
      setLoading(false)
    }
    init()
  }, [facilityId, router])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages])

  const addMessage = async (type: string, content: string, recordId?: string) => {
    const { data } = await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      cleaning_record_id: recordId || null,
      type,
      content,
    }).select().single()
    if (data) setMessages(prev => [...prev, data as ChatMessage])
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

  const uploadPhoto = async (recordId: string, file: File, type: 'before' | 'after' | 'issue') => {
    setUploading(`${recordId}-${type}`)
    const ext = file.name.split('.').pop()
    const path = `${recordId}/${type}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('cleaning-photos').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('cleaning-photos').getPublicUrl(path)
      await supabase.from('cleaning_photos').insert({ cleaning_record_id: recordId, photo_url: publicUrl, photo_type: type })
      const room = records.find(r => r.id === recordId)?.rooms?.room_number
      const typeLabel = type === 'before' ? '清掃前' : type === 'after' ? '清掃後' : '問題'
      await addMessage('system', `📷 ${room}号室の${typeLabel}写真を追加しました`, recordId)
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
            {messages.map(msg => (
              <div key={msg.id} className="flex justify-center">
                <div className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] text-center ${
                  msg.type === 'status_update'
                    ? msg.content.includes('完了') ? 'bg-green-500 text-white' : 'bg-yellow-400 text-white'
                    : 'bg-white/90 text-gray-600'
                }`}>
                  <p>{msg.content}</p>
                  <p className={`text-xs mt-0.5 ${
                    msg.type === 'status_update' ? 'text-white/70' : 'text-gray-400'
                  }`}>{formatTime(msg.created_at)}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 下部アクションエリア（LINE風） */}
          <div className="bg-white border-t safe-area-bottom">
            {/* 未完了の部屋リスト */}
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

            {/* 選択した部屋のアクション */}
            {selectedRecord && (() => {
              const record = records.find(r => r.id === selectedRecord)
              if (!record) return null
              return (
                <div className="px-3 pb-3 border-t mt-2 pt-2 space-y-2">
                  <p className="text-xs text-gray-500 font-medium">{record.rooms?.room_number}号室</p>
                  <div className="flex gap-2">
                    {record.status === 'scheduled' && (
                      <button onClick={() => updateStatus(record.id, 'in_progress')}
                        className="flex-1 bg-yellow-500 text-white py-2.5 rounded-xl text-sm font-medium">
                        🧹 清掃開始
                      </button>
                    )}
                    {record.status === 'in_progress' && (
                      <button onClick={() => updateStatus(record.id, 'completed')}
                        className="flex-1 bg-green-500 text-white py-2.5 rounded-xl text-sm font-medium">
                        ✅ 完了
                      </button>
                    )}
                    <button
                      onClick={() => setShowTroubleForm(showTroubleForm === record.id ? null : record.id)}
                      className="bg-red-50 text-red-500 border border-red-200 px-3 py-2.5 rounded-xl text-sm">
                      報告
                    </button>
                  </div>

                  {/* 写真アップロード */}
                  {record.status !== 'scheduled' && (
                    <div className="flex gap-2">
                      {(['before', 'after', 'issue'] as const).map(type => (
                        <label key={type} className="flex-1 cursor-pointer">
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(record.id, f, type) }} />
                          <span className={`block text-center text-xs py-2 rounded-xl border ${
                            uploading === `${record.id}-${type}` ? 'bg-gray-100 text-gray-400' : 'border-gray-300 text-gray-600'
                          }`}>
                            {uploading === `${record.id}-${type}` ? '...' :
                              type === 'before' ? '📷清掃前' : type === 'after' ? '📷清掃後' : '📷問題'}
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
              )
            })()}
          </div>
        </div>
      ) : (
        <PhotosTab records={records} />
      )}
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
