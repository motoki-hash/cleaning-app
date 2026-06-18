'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Record_ = {
  id: string
  scheduled_date: string
  status: string
  started_at: string | null
  completed_at: string | null
  notes: string | null
  rooms: { room_number: string; facilities: { name: string; area: string } | null } | null
  cleaners: { name: string; cleaning_companies: { name: string } | null } | null
}

type TroubleReport = {
  id: string
  title: string
  priority: string
  status: string
  created_at: string
  rooms: { room_number: string; facilities: { name: string } | null } | null
}

type Facility = { id: string; name: string; area: string }
type Room = { id: string; room_number: string; facility_id: string }

export default function AdminPage() {
  const router = useRouter()
  const [records, setRecords] = useState<Record_[]>([])
  const [troubles, setTroubles] = useState<TroubleReport[]>([])
  const [tab, setTab] = useState<'records' | 'troubles' | 'photos'>('records')
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; photo_type: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [facilities, setFacilities] = useState<Facility[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedFacility, setSelectedFacility] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const today = new Date().toISOString().split('T')[0]

      const [recordsRes, troublesRes, photosRes, facilitiesRes, roomsRes] = await Promise.all([
        supabase
          .from('cleaning_records')
          .select('id, scheduled_date, status, started_at, completed_at, notes, rooms(room_number, facilities(name, area)), cleaners(name, cleaning_companies(name))')
          .eq('scheduled_date', today)
          .order('created_at'),
        supabase
          .from('trouble_reports')
          .select('id, title, priority, status, created_at, rooms(room_number, facilities(name))')
          .neq('status', 'closed')
          .order('created_at', { ascending: false }),
        supabase
          .from('cleaning_photos')
          .select('id, photo_url, photo_type, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('facilities').select('id, name, area').order('area').order('name'),
        supabase.from('rooms').select('id, room_number, facility_id').order('room_number'),
      ])

      setRecords((recordsRes.data as unknown as Record_[]) || [])
      setTroubles((troublesRes.data as unknown as TroubleReport[]) || [])
      setPhotos(photosRes.data || [])
      setFacilities((facilitiesRes.data as Facility[]) || [])
      setRooms((roomsRes.data as Room[]) || [])
      setLoading(false)
    }
    init()
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const resolveTrouble = async (id: string) => {
    await supabase.from('trouble_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    setTroubles(prev => prev.filter(t => t.id !== id))
  }

  const areas = [...new Set(facilities.map(f => f.area).filter(Boolean))].sort()
  const filteredFacilities = selectedArea ? facilities.filter(f => f.area === selectedArea) : facilities
  const filteredRooms = selectedFacility ? rooms.filter(r => r.facility_id === selectedFacility) : []

  const filteredRecords = records.filter(r => {
    const facilityName = r.rooms?.facilities?.name || ''
    const roomNumber = r.rooms?.room_number || ''
    const area = r.rooms?.facilities?.area || ''

    if (selectedArea && area !== selectedArea) return false
    if (selectedFacility) {
      const fac = facilities.find(f => f.id === selectedFacility)
      if (fac && facilityName !== fac.name) return false
    }
    if (selectedRoom) {
      const room = rooms.find(r => r.id === selectedRoom)
      if (room && roomNumber !== room.room_number) return false
    }
    return true
  })

  const statusLabel: Record<string, string> = {
    scheduled: '未開始', in_progress: '清掃中', completed: '完了', cancelled: 'キャンセル'
  }
  const statusColor: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  const priorityColor: Record<string, string> = {
    low: 'bg-blue-100 text-blue-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  }
  const priorityLabel: Record<string, string> = { low: '低', medium: '中', high: '高', urgent: '緊急' }

  const summary = {
    total: filteredRecords.length,
    completed: filteredRecords.filter(r => r.status === 'completed').length,
    inProgress: filteredRecords.filter(r => r.status === 'in_progress').length,
    scheduled: filteredRecords.filter(r => r.status === 'scheduled').length,
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">管理者ダッシュボード</h1>
        <button onClick={logout} className="text-sm bg-gray-700 px-3 py-1 rounded-lg">ログアウト</button>
      </header>

      {/* エリア・物件・号室フィルター */}
      <div className="bg-white border-b px-4 py-3 flex gap-3 flex-wrap">
        <select
          value={selectedArea}
          onChange={e => { setSelectedArea(e.target.value); setSelectedFacility(''); setSelectedRoom('') }}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px]"
        >
          <option value="">エリア（全て）</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={selectedFacility}
          onChange={e => { setSelectedFacility(e.target.value); setSelectedRoom('') }}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
          disabled={!selectedArea}
        >
          <option value="">物件（全て）</option>
          {filteredFacilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        <select
          value={selectedRoom}
          onChange={e => setSelectedRoom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-28"
          disabled={!selectedFacility}
        >
          <option value="">号室（全て）</option>
          {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.room_number}号室</option>)}
        </select>

        {(selectedArea || selectedFacility || selectedRoom) && (
          <button
            onClick={() => { setSelectedArea(''); setSelectedFacility(''); setSelectedRoom('') }}
            className="text-sm text-gray-500 border rounded-lg px-3 py-2"
          >
            リセット
          </button>
        )}
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-3 p-4">
        {[
          { label: '合計', value: summary.total, color: 'bg-white' },
          { label: '完了', value: summary.completed, color: 'bg-green-50' },
          { label: '清掃中', value: summary.inProgress, color: 'bg-yellow-50' },
          { label: '未開始', value: summary.scheduled, color: 'bg-gray-50' },
        ].map(item => (
          <div key={item.label} className={`${item.color} rounded-xl p-3 text-center shadow-sm`}>
            <p className="text-2xl font-bold text-gray-800">{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* トラブル通知 */}
      {troubles.filter(t => t.priority === 'urgent' || t.priority === 'high').length > 0 && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm font-bold text-red-700">
            ⚠ 緊急・高優先度のトラブルが {troubles.filter(t => t.priority === 'urgent' || t.priority === 'high').length} 件あります
          </p>
        </div>
      )}

      {/* タブ */}
      <div className="flex border-b border-gray-200 mx-4">
        {(['records', 'troubles', 'photos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          >
            {t === 'records' ? '清掃状況' : t === 'troubles' ? `トラブル (${troubles.length})` : '写真'}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {tab === 'records' && (
          <>
            {filteredRecords.length === 0 && (
              <p className="text-center text-gray-400 mt-8">該当するタスクがありません</p>
            )}
            {filteredRecords.map(record => (
              <div key={record.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs text-gray-400">{record.rooms?.facilities?.area}</p>
                    <p className="font-medium text-gray-800">{record.rooms?.facilities?.name}</p>
                    <p className="text-sm text-gray-500">{record.rooms?.room_number}号室</p>
                    <p className="text-xs text-gray-400">{record.cleaners?.name} ({record.cleaners?.cleaning_companies?.name})</p>
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
              </div>
            ))}
          </>
        )}

        {tab === 'troubles' && troubles.map(trouble => (
          <div key={trouble.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{trouble.title}</p>
                <p className="text-sm text-gray-500">{trouble.rooms?.facilities?.name} {trouble.rooms?.room_number}号室</p>
                <p className="text-xs text-gray-400">{new Date(trouble.created_at).toLocaleString('ja-JP')}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[trouble.priority]}`}>
                {priorityLabel[trouble.priority]}
              </span>
            </div>
            <button
              onClick={() => resolveTrouble(trouble.id)}
              className="w-full text-sm bg-green-500 text-white py-2 rounded-lg mt-2"
            >
              解決済みにする
            </button>
          </div>
        ))}

        {tab === 'photos' && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(photo => (
              <div key={photo.id} className="relative">
                <img src={photo.photo_url} alt={photo.photo_type} className="w-full aspect-square object-cover rounded-lg" />
                <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 rounded">
                  {photo.photo_type === 'before' ? '前' : photo.photo_type === 'after' ? '後' : '問題'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
