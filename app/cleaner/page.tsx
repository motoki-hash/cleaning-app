'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CleaningRecord = {
  id: string
  scheduled_date: string
  status: string
  started_at: string | null
  completed_at: string | null
  rooms: { room_number: string; facilities: { name: string } | null } | null
}

export default function CleanerPage() {
  const router = useRouter()
  const [records, setRecords] = useState<CleaningRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [cleanerId, setCleanerId] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [showTroubleForm, setShowTroubleForm] = useState<string | null>(null)
  const [troubleTitle, setTroubleTitle] = useState('')
  const [troubleDesc, setTroubleDesc] = useState('')
  const [troublePriority, setTroublePriority] = useState<'low'|'medium'|'high'|'urgent'>('medium')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cleaner } = await supabase
        .from('cleaners')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!cleaner) { setLoading(false); return }
      setCleanerId(cleaner.id)

      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('cleaning_records')
        .select('id, scheduled_date, status, started_at, completed_at, rooms(room_number, facilities(name))')
        .eq('cleaner_id', cleaner.id)
        .eq('scheduled_date', today)
        .order('created_at')

      setRecords((data as unknown as CleaningRecord[]) || [])
      setLoading(false)
    }
    init()
  }, [router])

  const updateStatus = async (recordId: string, status: string) => {
    const now = new Date().toISOString()
    const updates: Record<string, string> = { status }
    if (status === 'in_progress') updates.started_at = now
    if (status === 'completed') updates.completed_at = now

    await supabase.from('cleaning_records').update(updates).eq('id', recordId)
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updates } : r))
  }

  const uploadPhoto = async (recordId: string, file: File, type: 'before' | 'after' | 'issue') => {
    setUploading(recordId)
    const ext = file.name.split('.').pop()
    const path = `${recordId}/${type}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('cleaning-photos')
      .upload(path, file)

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('cleaning-photos').getPublicUrl(path)
      await supabase.from('cleaning_photos').insert({
        cleaning_record_id: recordId,
        photo_url: publicUrl,
        photo_type: type,
      })
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
    setShowTroubleForm(null)
    setTroubleTitle('')
    setTroubleDesc('')
    alert('トラブルを報告しました')
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const statusLabel: Record<string, string> = {
    scheduled: '未開始',
    in_progress: '清掃中',
    completed: '完了',
    cancelled: 'キャンセル',
  }
  const statusColor: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white px-4 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">今日の清掃タスク</h1>
        <button onClick={logout} className="text-sm bg-blue-700 px-3 py-1 rounded-lg">ログアウト</button>
      </header>

      <div className="p-4 space-y-4">
        {records.length === 0 && (
          <div className="text-center text-gray-500 mt-12">今日のタスクはありません</div>
        )}

        {records.map(record => {
          const room = record.rooms
          const facilityName = room?.facilities?.name || ''
          const roomNumber = room?.room_number || ''

          return (
            <div key={record.id} className="bg-white rounded-xl shadow p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-800">{facilityName}</p>
                  <p className="text-sm text-gray-500">部屋番号: {roomNumber}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[record.status]}`}>
                  {statusLabel[record.status]}
                </span>
              </div>

              {record.started_at && (
                <p className="text-xs text-gray-400">開始: {new Date(record.started_at).toLocaleTimeString('ja-JP')}</p>
              )}
              {record.completed_at && (
                <p className="text-xs text-gray-400">完了: {new Date(record.completed_at).toLocaleTimeString('ja-JP')}</p>
              )}

              <div className="flex gap-2 flex-wrap">
                {record.status === 'scheduled' && (
                  <button
                    onClick={() => updateStatus(record.id, 'in_progress')}
                    className="bg-yellow-500 text-white text-sm px-4 py-2 rounded-lg flex-1"
                  >
                    清掃開始
                  </button>
                )}
                {record.status === 'in_progress' && (
                  <button
                    onClick={() => updateStatus(record.id, 'completed')}
                    className="bg-green-500 text-white text-sm px-4 py-2 rounded-lg flex-1"
                  >
                    完了
                  </button>
                )}
              </div>

              {record.status !== 'scheduled' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">写真アップロード</p>
                  <div className="flex gap-2">
                    {(['before', 'after', 'issue'] as const).map(type => (
                      <label key={type} className="flex-1 cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) uploadPhoto(record.id, file, type)
                          }}
                        />
                        <span className={`block text-center text-xs py-2 rounded-lg border ${uploading === record.id ? 'opacity-50' : 'border-gray-300 hover:border-blue-400'}`}>
                          {type === 'before' ? '清掃前' : type === 'after' ? '清掃後' : '問題'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowTroubleForm(showTroubleForm === record.id ? null : record.id)}
                className="w-full text-sm text-red-600 border border-red-300 py-2 rounded-lg"
              >
                トラブル報告
              </button>

              {showTroubleForm === record.id && (
                <div className="space-y-2 bg-red-50 p-3 rounded-lg">
                  <input
                    type="text"
                    placeholder="タイトル"
                    value={troubleTitle}
                    onChange={e => setTroubleTitle(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  <textarea
                    placeholder="詳細を入力..."
                    value={troubleDesc}
                    onChange={e => setTroubleDesc(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm h-20"
                  />
                  <select
                    value={troublePriority}
                    onChange={e => setTroublePriority(e.target.value as 'low'|'medium'|'high'|'urgent')}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">緊急</option>
                  </select>
                  <button
                    onClick={() => submitTrouble(record.id, record.rooms ? '' : '')}
                    className="w-full bg-red-600 text-white py-2 rounded-lg text-sm"
                  >
                    送信
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
