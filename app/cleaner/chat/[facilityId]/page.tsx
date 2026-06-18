'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CleaningRecord = {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  rooms: { id: string; room_number: string } | null
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
  const [cleanerId, setCleanerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [showTroubleForm, setShowTroubleForm] = useState<string | null>(null)
  const [troubleTitle, setTroubleTitle] = useState('')
  const [troubleDesc, setTroubleDesc] = useState('')
  const [troublePriority, setTroublePriority] = useState<'low'|'medium'|'high'|'urgent'>('medium')
  const [activeTab, setActiveTab] = useState<'tasks' | 'photos'>('tasks')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cleaner } = await supabase
        .from('cleaners').select('id').eq('user_id', user.id).single()
      if (!cleaner) { setLoading(false); return }
      setCleanerId(cleaner.id)

      const today = new Date().toISOString().split('T')[0]
      const [facRes, recRes, msgRes] = await Promise.all([
        supabase.from('facilities').select('name, area').eq('id', facilityId).single(),
        supabase.from('cleaning_records')
          .select('id, status, started_at, completed_at, rooms(id, room_number)')
          .eq('cleaner_id', cleaner.id)
          .eq('scheduled_date', today)
          .in('room_id',
            (await supabase.from('rooms').select('id').eq('facility_id', facilityId)).data?.map(r => r.id) || []
          )
          .order('created_at'),
        supabase.from('chat_messages')
          .select('*')
          .eq('facility_id', facilityId)
          .order('created_at'),
      ])

      setFacility(facRes.data)
      setRecords((recRes.data as unknown as CleaningRecord[]) || [])
      setMessages(msgRes.data || [])
      setLoading(false)
    }
    init()
  }, [facilityId, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, records])

  const addMessage = async (type: string, content: string, recordId?: string) => {
    const { data } = await supabase.from('chat_messages').insert({
      facility_id: facilityId,
      cleaning_record_id: recordId || null,
      type,
      content,
    }).select().single()
    if (data) setMessages(prev => [...prev, data as ChatMessage])
  }

  const updateStatus = async (recordId: string, status: string) => {
    const now = new Date().toISOString()
    const updates: Record<string, string> = { status }
    if (status === 'in_progress') updates.started_at = now
    if (status === 'completed') updates.completed_at = now

    await supabase.from('cleaning_records').update(updates).eq('id', recordId)
    const record = records.find(r => r.id === recordId)
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updates } : r))

    const roomNumber = record?.rooms?.room_number || ''
    const statusText = status === 'in_progress' ? `🧹 ${roomNumber}号室 清掃開始` : `✅ ${roomNumber}号室 清掃完了`
    await addMessage('status_update', statusText, recordId)

    if (record?.rooms) {
      fetch('/api/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          facilityName: facility?.name || '',
          roomNumber,
          area: facility?.area || '',
        }),
      })
    }
  }

  const uploadPhoto = async (recordId: string, file: File, type: 'before' | 'after' | 'issue') => {
    setUploading(`${recordId}-${type}`)
    const ext = file.name.split('.').pop()
    const path = `${recordId}/${type}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('cleaning-photos').upload(path, file)
    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('cleaning-photos').getPublicUrl(path)
      await supabase.from('cleaning_photos').insert({ cleaning_record_id: recordId, photo_url: publicUrl, photo_type: type })
      const record = records.find(r => r.id === recordId)
      const typeLabel = type === 'before' ? '清掃前' : type === 'after' ? '清掃後' : '問題'
      await addMessage('system', `📷 ${record?.rooms?.room_number}号室 ${typeLabel}写真をアップロードしました`, recordId)
    }
    setUploading(null)
  }

  const submitTrouble = async (recordId: string, roomId: string) => {
    await supabase.from('trouble_reports').insert({
      room_id: roomId,
      cleaning_record_id: recordId,
      title: troubleTitle,
      description: troubleDesc,
      priority: troublePriority,
    })
    const record = records.find(r => r.id === recordId)
    await addMessage('system', `⚠️ ${record?.rooms?.room_number}号室 トラブル報告：${troubleTitle}`, recordId)
    setShowTroubleForm(null)
    setTroubleTitle('')
    setTroubleDesc('')
  }

  const statusLabel: Record<string, string> = {
    scheduled: '未開始', in_progress: '清掃中', completed: '完了', cancelled: 'キャンセル'
  }
  const statusColor: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/cleaner')} className="text-white text-xl">‹</button>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{facility?.name}</p>
          <p className="text-xs text-blue-200">{facility?.area} · {records.length}部屋</p>
        </div>
        <div className="text-right text-xs text-blue-200">
          <p>{records.filter(r => r.status === 'completed').length}/{records.length} 完了</p>
        </div>
      </header>

      {/* タブ */}
      <div className="flex bg-white border-b">
        {(['tasks', 'photos'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          >
            {tab === 'tasks' ? '清掃タスク' : '写真・報告'}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <div className="flex-1 flex flex-col">
          {/* チャット形式のタイムライン */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-4">
            {/* 今日のスケジュール（システムメッセージ） */}
            <div className="flex justify-center">
              <span className="text-xs text-gray-400 bg-gray-200 px-3 py-1 rounded-full">
                {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-center">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-700 max-w-xs text-center">
                📋 本日の清掃：{records.length}部屋
              </div>
            </div>

            {/* チャットメッセージ */}
            {messages.map(msg => (
              <div key={msg.id} className="flex justify-center">
                <div className={`rounded-xl px-3 py-1.5 text-xs max-w-xs text-center ${
                  msg.type === 'status_update' ? 'bg-green-50 border border-green-200 text-green-700' :
                  msg.type === 'system' ? 'bg-gray-100 text-gray-600' :
                  'bg-blue-50 text-blue-700'
                }`}>
                  {msg.content}
                  <span className="block text-gray-400 mt-0.5">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* タスクカード */}
          <div className="border-t bg-white">
            <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {records.map(record => (
                <div key={record.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-800">{record.rooms?.room_number}号室</p>
                      {record.started_at && (
                        <p className="text-xs text-gray-400">開始 {formatTime(record.started_at)}</p>
                      )}
                      {record.completed_at && (
                        <p className="text-xs text-gray-400">完了 {formatTime(record.completed_at)}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[record.status]}`}>
                      {statusLabel[record.status]}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {record.status === 'scheduled' && (
                      <button onClick={() => updateStatus(record.id, 'in_progress')}
                        className="flex-1 bg-yellow-500 text-white text-sm py-2 rounded-lg font-medium">
                        清掃開始
                      </button>
                    )}
                    {record.status === 'in_progress' && (
                      <button onClick={() => updateStatus(record.id, 'completed')}
                        className="flex-1 bg-green-500 text-white text-sm py-2 rounded-lg font-medium">
                        完了
                      </button>
                    )}
                    <button
                      onClick={() => setShowTroubleForm(showTroubleForm === record.id ? null : record.id)}
                      className="text-sm text-red-500 border border-red-300 px-3 py-2 rounded-lg">
                      報告
                    </button>
                  </div>

                  {record.status !== 'scheduled' && (
                    <div className="flex gap-2">
                      {(['before', 'after', 'issue'] as const).map(type => (
                        <label key={type} className="flex-1 cursor-pointer">
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(record.id, f, type) }} />
                          <span className={`block text-center text-xs py-1.5 rounded-lg border ${
                            uploading === `${record.id}-${type}` ? 'bg-gray-100 text-gray-400' : 'border-gray-300 text-gray-600'
                          }`}>
                            {uploading === `${record.id}-${type}` ? '...' : type === 'before' ? '清掃前' : type === 'after' ? '清掃後' : '問題'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {showTroubleForm === record.id && (
                    <div className="space-y-2 bg-red-50 p-3 rounded-xl">
                      <input type="text" placeholder="タイトル" value={troubleTitle}
                        onChange={e => setTroubleTitle(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm" />
                      <textarea placeholder="詳細..." value={troubleDesc}
                        onChange={e => setTroubleDesc(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm h-16" />
                      <div className="flex gap-2">
                        <select value={troublePriority}
                          onChange={e => setTroublePriority(e.target.value as 'low'|'medium'|'high'|'urgent')}
                          className="flex-1 border rounded px-2 py-2 text-sm">
                          <option value="low">低</option>
                          <option value="medium">中</option>
                          <option value="high">高</option>
                          <option value="urgent">緊急</option>
                        </select>
                        <button onClick={() => submitTrouble(record.id, record.rooms?.id || '')}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm">送信</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'photos' && (
        <PhotosTab facilityId={facilityId} records={records} />
      )}
    </div>
  )
}

function PhotosTab({ facilityId, records }: { facilityId: string; records: CleaningRecord[] }) {
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; photo_type: string; cleaning_record_id: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const recordIds = records.map(r => r.id)
      if (recordIds.length === 0) return
      const { data } = await supabase.from('cleaning_photos')
        .select('id, photo_url, photo_type, cleaning_record_id')
        .in('cleaning_record_id', recordIds)
        .order('created_at', { ascending: false })
      setPhotos(data || [])
    }
    load()
  }, [records])

  const typeLabel: Record<string, string> = { before: '清掃前', after: '清掃後', issue: '問題' }
  const typeColor: Record<string, string> = {
    before: 'bg-blue-600', after: 'bg-green-600', issue: 'bg-red-600'
  }

  if (photos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-4xl mb-2">📷</p>
          <p className="text-sm">写真はまだありません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 grid grid-cols-3 gap-2">
      {photos.map(photo => {
        const record = records.find(r => r.id === photo.cleaning_record_id)
        return (
          <div key={photo.id} className="relative aspect-square">
            <img src={photo.photo_url} alt={photo.photo_type} className="w-full h-full object-cover rounded-lg" />
            <div className="absolute bottom-1 left-1 flex gap-1">
              <span className={`text-xs text-white px-1.5 py-0.5 rounded ${typeColor[photo.photo_type] || 'bg-gray-600'}`}>
                {typeLabel[photo.photo_type] || photo.photo_type}
              </span>
              {record && (
                <span className="text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {record.rooms?.room_number}号
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
