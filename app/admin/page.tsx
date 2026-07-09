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
  room_id: string
  rooms: { room_number: string; facility_id: string; facilities: { name: string; area: string } | null } | null
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

type EarlyLateRequest = {
  id: string
  type: 'early_checkin' | 'late_checkout'
  status: 'pending' | 'accepted' | 'declined' | 'hold'
  request_date: string | null
  requested_time: string | null
  message: string | null
  created_at: string
  responded_at: string | null
  rooms: { room_number: string; facilities: { name: string; area: string } | null } | null
}

type Facility = { id: string; name: string; area: string }
type Room = { id: string; room_number: string; facility_id: string }
type RoomEvent = {
  id: string
  facility_id: string
  room_id: string | null
  event_type: '内覧' | '是正'
  event_date: string
  start_time: string
  end_time: string
  note: string | null
  rooms: { room_number: string } | null
  facilities: { name: string; area: string } | null
}

export default function AdminPage() {
  const router = useRouter()
  const [records, setRecords] = useState<Record_[]>([])
  const [troubles, setTroubles] = useState<TroubleReport[]>([])
  const [requests, setRequests] = useState<EarlyLateRequest[]>([])
  const [tab, setTab] = useState<'records' | 'troubles' | 'requests' | 'photos' | 'chat'>('records')
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; photo_type: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const [facilities, setFacilities] = useState<Facility[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedFacility, setSelectedFacility] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')

  // 内覧・是正
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [evFacility, setEvFacility] = useState('')
  const [evRoom, setEvRoom] = useState('')
  const [evType, setEvType] = useState<'内覧' | '是正'>('内覧')
  const [evDate, setEvDate] = useState(new Date().toISOString().split('T')[0])
  const [evStart, setEvStart] = useState('')
  const [evEnd, setEvEnd] = useState('')
  const [evNote, setEvNote] = useState('')
  const [evSaving, setEvSaving] = useState(false)

  // 依頼タブの展開日付
  const [expandedReqDates, setExpandedReqDates] = useState<Set<string>>(new Set())
  const toggleReqDate = (date: string) => setExpandedReqDates(prev => {
    const next = new Set(prev)
    next.has(date) ? next.delete(date) : next.add(date)
    return next
  })

  // 依頼作成フォーム
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [reqFacility, setReqFacility] = useState('')
  const [reqRoom, setReqRoom] = useState('')
  const [reqType, setReqType] = useState<'early_checkin' | 'late_checkout'>('early_checkin')
  const [reqDate, setReqDate] = useState(new Date().toISOString().split('T')[0])
  const [reqTime, setReqTime] = useState('')
  const [reqMessage, setReqMessage] = useState('')
  const [reqSaving, setReqSaving] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const today = new Date().toISOString().split('T')[0]

      const [recordsRes, troublesRes, photosRes, facilitiesRes, roomsRes, requestsRes, eventsRes] = await Promise.all([
        supabase
          .from('cleaning_records')
          .select('id, scheduled_date, status, started_at, completed_at, notes, room_id, rooms(room_number, facility_id, facilities(name, area)), cleaners(name, cleaning_companies(name))')
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
        supabase
          .from('early_late_requests')
          .select('id, type, status, request_date, requested_time, message, created_at, responded_at, rooms(room_number, facilities(name, area))')
          .order('request_date', { ascending: false })
          .limit(100),
        supabase
          .from('room_events')
          .select('id, facility_id, room_id, event_type, event_date, start_time, end_time, note, rooms(room_number), facilities(name, area)')
          .order('event_date', { ascending: false })
          .limit(100),
      ])

      const rawRecords = (recordsRes.data as unknown as Record_[]) || []
      const seenRooms = new Map<string, Record_>()
      for (const r of rawRecords) { if (!seenRooms.has(r.room_id)) seenRooms.set(r.room_id, r) }
      setRecords(Array.from(seenRooms.values()))
      setTroubles((troublesRes.data as unknown as TroubleReport[]) || [])
      setPhotos(photosRes.data || [])
      const facilityList = (facilitiesRes.data as Facility[]) || []
      setFacilities(facilityList)
      setRooms((roomsRes.data as Room[]) || [])
      const reqData = (requestsRes.data as unknown as EarlyLateRequest[]) || []
      setRequests(reqData)
      setRoomEvents((eventsRes.data as unknown as RoomEvent[]) || [])
      // 今日・未来の日付は最初から展開
      const today2 = new Date().toISOString().split('T')[0]
      const futureDates = new Set([
        ...reqData.filter(r => r.request_date && r.request_date >= today2).map(r => r.request_date as string),
        ...((eventsRes.data as unknown as RoomEvent[]) || []).filter(e => e.event_date >= today2).map(e => e.event_date),
      ])
      setExpandedReqDates(futureDates)
      setLoading(false)

      // 管理者の未読カウント（清掃員からのメッセージで未読のもの）
      if (facilityList.length > 0) {
        const { data: reads } = await supabase
          .from('message_reads')
          .select('facility_id, last_read_at')
          .eq('reader', 'admin')
          .in('facility_id', facilityList.map(f => f.id))

        const readMap: Record<string, string> = {}
        for (const r of reads || []) readMap[r.facility_id] = r.last_read_at

        const counts: Record<string, number> = {}
        await Promise.all(facilityList.map(async f => {
          const lastRead = readMap[f.id] || '1970-01-01'
          const { count } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('facility_id', f.id)
            .eq('type', 'note')
            .neq('sender_name', '管理者')
            .gt('created_at', lastRead)
          if (count && count > 0) counts[f.id] = count
        }))
        setUnreadCounts(counts)
      }

      // リアルタイム: 清掃状況の更新
      const recChannel = supabase
        .channel('admin:cleaning_records')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'cleaning_records',
        }, payload => {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        })
        .subscribe()

      // リアルタイム: 依頼への回答
      const reqChannel = supabase
        .channel('admin:early_late_requests')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'early_late_requests',
        }, payload => {
          setRequests(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        })
        .subscribe()

      return () => {
        supabase.removeChannel(recChannel)
        supabase.removeChannel(reqChannel)
      }
    }
    init()
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const createEvent = async () => {
    if (!evFacility || !evDate || !evStart || !evEnd) return
    setEvSaving(true)
    await supabase.from('room_events').insert({
      facility_id: evFacility,
      room_id: evRoom || null,
      event_type: evType,
      event_date: evDate,
      start_time: evStart,
      end_time: evEnd,
      note: evNote.trim() || null,
    })
    const { data } = await supabase
      .from('room_events')
      .select('id, facility_id, room_id, event_type, event_date, start_time, end_time, note, rooms(room_number), facilities(name, area)')
      .order('event_date', { ascending: false }).limit(100)
    setRoomEvents((data as unknown as RoomEvent[]) || [])

    const fac = facilities.find(f => f.id === evFacility)
    const room = evRoom ? rooms.find(r => r.id === evRoom) : null
    const roomText = room ? `${room.room_number}号室` : '施設全体'
    const dateLabel = new Date(evDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
    const icon = evType === '内覧' ? '👀' : '🔧'

    // Slack通知（fire-and-forget）
    fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'room_event',
        facilityId: evFacility,
        facilityName: fac?.name || '',
        area: fac?.area || '',
        roomNumber: room?.room_number || null,
        eventType: evType,
        eventDate: evDate,
        startTime: evStart,
        endTime: evEnd,
        note: evNote.trim() || null,
      }),
    })

    // 施設のチャットに通知
    const chatContent = `${icon} ${evType}のお知らせ：${roomText}\n📅 ${dateLabel} ${evStart}〜${evEnd}${evNote.trim() ? '\n📝 ' + evNote.trim() : ''}`
    await supabase.from('chat_messages').insert({
      facility_id: evFacility,
      type: 'system',
      content: chatContent,
      cleaning_record_id: null,
      early_late_request_id: null,
      sender_id: null,
      sender_name: '管理者',
    })

    setShowEventForm(false)
    setEvFacility(''); setEvRoom(''); setEvType('内覧'); setEvDate(new Date().toISOString().split('T')[0])
    setEvStart(''); setEvEnd(''); setEvNote('')
    setEvSaving(false)
  }

  const deleteEvent = async (id: string) => {
    if (!confirm('このイベントを削除しますか？')) return
    await supabase.from('room_events').delete().eq('id', id)
    setRoomEvents(prev => prev.filter(e => e.id !== id))
  }

  const resolveTrouble = async (id: string) => {
    await supabase.from('trouble_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    setTroubles(prev => prev.filter(t => t.id !== id))
  }

  const createRequest = async () => {
    if (!reqRoom || !reqType || !reqDate || !reqTime) return
    setReqSaving(true)

    // 内覧・是正との時間衝突チェック
    const reqTimeMin = parseInt(reqTime.split(':')[0]) * 60 + parseInt(reqTime.split(':')[1])
    const conflictingEvents = roomEvents.filter(ev => {
      if (ev.event_date !== reqDate) return false
      // 施設全体 or 同一部屋のイベント
      if (ev.room_id && ev.room_id !== reqRoom) return false
      const evStartMin = parseInt(ev.start_time.slice(0,2)) * 60 + parseInt(ev.start_time.slice(3,5))
      return evStartMin < reqTimeMin
    })
    if (conflictingEvents.length > 0) {
      const evLabels = conflictingEvents.map(ev => `${ev.event_type}（${ev.start_time.slice(0,5)}〜${ev.end_time.slice(0,5)}）`).join('、')
      alert(`🚫 依頼できません\n\nこの日時には ${evLabels} が登録されているため、アーリー/レイト依頼は送れません。\n\n内覧・是正の時間帯を変更するか、依頼時間を調整してください。`)
      setReqSaving(false)
      return
    }

    // 同じ部屋・日付・タイプの依頼が既にあるか確認
    const { data: existing } = await supabase
      .from('early_late_requests')
      .select('id, status')
      .eq('room_id', reqRoom)
      .eq('type', reqType)
      .eq('request_date', reqDate)
      .limit(1)

    if (existing && existing.length > 0) {
      const statusLabel: Record<string, string> = { pending: '未回答', accepted: '承認済み', declined: '拒否済み', hold: '保留中' }
      alert(`この部屋・日付・タイプの依頼は既に存在します（${statusLabel[existing[0].status] || existing[0].status}）`)
      setReqSaving(false)
      return
    }

    const room = rooms.find(r => r.id === reqRoom)
    const facility = facilities.find(f => f.id === reqFacility)

    const { data } = await supabase.from('early_late_requests').insert({
      room_id: reqRoom,
      type: reqType,
      requested_time: reqDate && reqTime ? `${reqDate} ${reqTime}` : reqDate || reqTime || null,
      request_date: reqDate || null,
      message: reqMessage || null,
      status: 'pending',
    }).select('id').single()

    if (data) {
      // チャットメッセージとして施設に通知
      const typeLabel = reqType === 'early_checkin' ? 'アーリーチェックイン' : 'レイトチェックアウト'
      const dateTimeText = reqDate && reqTime ? `（${reqDate} ${reqTime}）` : reqDate ? `（${reqDate}）` : reqTime ? `（${reqTime}）` : ''
      const timeText = dateTimeText
      const content = `📨 ${typeLabel}依頼${timeText}：${room?.room_number}号室${reqMessage ? '\n' + reqMessage : ''}`

      await supabase.from('chat_messages').insert({
        facility_id: reqFacility,
        type: 'early_late_request',
        content,
        cleaning_record_id: null,
        early_late_request_id: data.id,
        sender_id: null,
        sender_name: '管理者',
      })

      // 清掃員全員にプッシュ通知
      fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `📨 ${typeLabel}依頼`,
          body: `${facility?.name} ${room?.room_number}号室${reqDate && reqTime ? `（${reqDate} ${reqTime}）` : ''}`,
          url: `/cleaner`,
        }),
      })

      // Slack通知
      fetch('/api/slack-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'request',
          facilityName: facility?.name || '',
          roomNumber: room?.room_number || '',
          area: facility?.area || '',
          requestType: typeLabel,
          requestTime: reqDate && reqTime ? `${reqDate} ${reqTime}` : reqDate || reqTime,
          message: reqMessage,
        }),
      })

      // リスト更新
      const newReq = await supabase
        .from('early_late_requests')
        .select('id, type, status, requested_time, message, created_at, responded_at, rooms(room_number, facilities(name))')
        .eq('id', data.id)
        .single()
      if (newReq.data) setRequests(prev => [newReq.data as unknown as EarlyLateRequest, ...prev])
    }

    setReqSaving(false)
    setShowRequestForm(false)
    setReqRoom('')
    setReqDate(new Date().toISOString().split('T')[0])
    setReqTime('')
    setReqMessage('')
    setTab('requests')
  }

  const areas = [...new Set(facilities.map(f => f.area).filter(Boolean))].sort()
  const filteredFacilities = selectedArea ? facilities.filter(f => f.area === selectedArea) : facilities
  const filteredRooms = selectedFacility ? rooms.filter(r => r.facility_id === selectedFacility) : []

  const filteredRecords = records.filter(r => {
    const area = r.rooms?.facilities?.area || ''
    const facilityId = r.rooms?.facility_id || ''
    const roomNumber = r.rooms?.room_number || ''
    if (selectedArea && area !== selectedArea) return false
    if (selectedFacility) {
      const fac = facilities.find(f => f.id === selectedFacility)
      if (fac && r.rooms?.facilities?.name !== fac.name) return false
    }
    if (selectedRoom) {
      const room = rooms.find(r2 => r2.id === selectedRoom)
      if (room && roomNumber !== room.room_number) return false
    }
    return true
  })

  const reqFilteredRooms = reqFacility ? rooms.filter(r => r.facility_id === reqFacility) : []

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
    low: 'bg-blue-100 text-blue-600', medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
  }
  const priorityLabel: Record<string, string> = { low: '低', medium: '中', high: '高', urgent: '緊急' }
  const reqStatusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    hold: 'bg-gray-100 text-gray-600',
  }
  const reqStatusLabel: Record<string, string> = {
    pending: '回答待ち', accepted: '受ける', declined: '受けれない', hold: '保留'
  }

  const summary = {
    total: filteredRecords.length,
    completed: filteredRecords.filter(r => r.status === 'completed').length,
    inProgress: filteredRecords.filter(r => r.status === 'in_progress').length,
    scheduled: filteredRecords.filter(r => r.status === 'scheduled').length,
  }

  const pendingRequests = requests.filter(r => r.status === 'pending').length

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">管理者ダッシュボード</h1>
        <div className="flex gap-2">
          <button onClick={() => router.push('/admin/facilities')} className="text-sm bg-gray-700 px-3 py-1 rounded-lg">🏠 施設管理</button>
          <button onClick={() => router.push('/admin/companies')} className="text-sm bg-gray-700 px-3 py-1 rounded-lg">🏢 会社管理</button>
          <button onClick={logout} className="text-sm bg-gray-700 px-3 py-1 rounded-lg">ログアウト</button>
        </div>
      </header>

      {/* フィルター */}
      <div className="bg-white border-b px-4 py-3 flex gap-3 flex-wrap">
        <select value={selectedArea} onChange={e => { setSelectedArea(e.target.value); setSelectedFacility(''); setSelectedRoom('') }}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px]">
          <option value="">エリア（全て）</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={selectedFacility} onChange={e => { setSelectedFacility(e.target.value); setSelectedRoom('') }}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]" disabled={!selectedArea}>
          <option value="">物件（全て）</option>
          {filteredFacilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-28" disabled={!selectedFacility}>
          <option value="">号室（全て）</option>
          {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.room_number}号室</option>)}
        </select>
        {(selectedArea || selectedFacility || selectedRoom) && (
          <button onClick={() => { setSelectedArea(''); setSelectedFacility(''); setSelectedRoom('') }}
            className="text-sm text-gray-500 border rounded-lg px-3 py-2">リセット</button>
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
        {(['records', 'troubles', 'requests', 'photos', 'chat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
            {t === 'records' ? '清掃状況' :
             t === 'troubles' ? `トラブル(${troubles.length})` :
             t === 'requests' ? `依頼${pendingRequests > 0 ? `(${pendingRequests})` : ''}` :
             t === 'photos' ? '写真' : '💬 チャット'}
          </button>
        ))}
        <button onClick={() => router.push('/admin/calendar')}
          className="px-4 py-2 text-sm font-medium text-gray-500">
          📅 カレンダー
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* 清掃状況タブ */}
        {tab === 'records' && (() => {
          if (filteredRecords.length === 0) return <p className="text-center text-gray-400 mt-8">該当するタスクがありません</p>
          const byArea: Record<string, typeof filteredRecords> = {}
          for (const r of filteredRecords) {
            const area = r.rooms?.facilities?.area || 'その他'
            if (!byArea[area]) byArea[area] = []
            byArea[area].push(r)
          }
          return Object.entries(byArea).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([area, recs]) => (
            <div key={area}>
              <p className="text-xs font-bold text-gray-400 px-1 py-1">{area}</p>
              {recs.map(record => (
                <div key={record.id} className="bg-white rounded-xl shadow-sm p-4 mb-2">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-800">{record.rooms?.facilities?.name}</p>
                      <p className="text-sm text-gray-500">{record.rooms?.room_number}号室</p>
                      <p className="text-xs text-gray-400">{record.cleaners?.name}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[record.status]}`}>
                      {statusLabel[record.status]}
                    </span>
                  </div>
                  {record.started_at && <p className="text-xs text-gray-400">開始: {new Date(record.started_at).toLocaleTimeString('ja-JP')}</p>}
                  {record.completed_at && <p className="text-xs text-gray-400">完了: {new Date(record.completed_at).toLocaleTimeString('ja-JP')}</p>}
                </div>
              ))}
            </div>
          ))
        })()}

        {/* トラブルタブ */}
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
            <button onClick={() => resolveTrouble(trouble.id)}
              className="w-full text-sm bg-green-500 text-white py-2 rounded-lg mt-2">解決済みにする</button>
          </div>
        ))}

        {/* 依頼タブ */}
        {tab === 'requests' && (
          <>
            {/* ボタン行 */}
            <div className="flex gap-2">
              <button onClick={() => { setShowEventForm(!showEventForm); setShowRequestForm(false) }}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl text-sm font-medium">
                🏠 内覧・是正を登録
              </button>
              <button onClick={() => { setShowRequestForm(!showRequestForm); setShowEventForm(false) }}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium">
                ＋ アーリー/レイト依頼
              </button>
            </div>

            {/* 内覧・是正登録フォーム */}
            {showEventForm && (
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-purple-200">
                <p className="font-medium text-gray-800">内覧・是正を登録</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['内覧', '是正'] as const).map(t => (
                    <button key={t} onClick={() => setEvType(t)}
                      className={`py-2 rounded-lg text-sm font-medium border ${evType === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600'}`}>
                      {t === '内覧' ? '👀 内覧' : '🔧 是正'}
                    </button>
                  ))}
                </div>
                <select value={evFacility} onChange={e => { setEvFacility(e.target.value); setEvRoom('') }}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">施設を選択（必須）</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.area} / {f.name}</option>)}
                </select>
                <select value={evRoom} onChange={e => setEvRoom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!evFacility}>
                  <option value="">施設全体（号室指定なし）</option>
                  {rooms.filter(r => r.facility_id === evFacility).map(r => <option key={r.id} value={r.id}>{r.room_number}号室</option>)}
                </select>
                <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">開始時間</label>
                    <input type="time" value={evStart} onChange={e => setEvStart(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">終了時間</label>
                    <input type="time" value={evEnd} onChange={e => setEvEnd(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <textarea value={evNote} onChange={e => setEvNote(e.target.value)}
                  placeholder="備考（任意）"
                  className="w-full border rounded-lg px-3 py-2 text-sm h-16 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowEventForm(false)}
                    className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">キャンセル</button>
                  <button onClick={createEvent} disabled={evSaving || !evFacility || !evDate || !evStart || !evEnd}
                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {evSaving ? '登録中...' : '登録する'}
                  </button>
                </div>
              </div>
            )}

            {/* 依頼作成フォーム */}
            {showRequestForm && (
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <p className="font-medium text-gray-800">新しい依頼</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setReqType('early_checkin')}
                    className={`py-2 rounded-lg text-sm font-medium border ${reqType === 'early_checkin' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                    🌅 アーリーチェックイン
                  </button>
                  <button onClick={() => setReqType('late_checkout')}
                    className={`py-2 rounded-lg text-sm font-medium border ${reqType === 'late_checkout' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                    🌙 レイトチェックアウト
                  </button>
                </div>
                <select value={reqFacility} onChange={e => { setReqFacility(e.target.value); setReqRoom('') }}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">物件を選択</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select value={reqRoom} onChange={e => setReqRoom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!reqFacility}>
                  <option value="">号室を選択</option>
                  {reqFilteredRooms.map(r => <option key={r.id} value={r.id}>{r.room_number}号室</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">希望日付</label>
                    <input type="date" value={reqDate} onChange={e => setReqDate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">希望時間</label>
                    <input type="time" value={reqTime} onChange={e => setReqTime(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <textarea value={reqMessage} onChange={e => setReqMessage(e.target.value)}
                  placeholder="メッセージ（任意）"
                  className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowRequestForm(false)}
                    className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">キャンセル</button>
                  <button onClick={createRequest} disabled={!reqRoom || reqSaving}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {reqSaving ? '送信中...' : '送信する'}
                  </button>
                </div>
              </div>
            )}

            {/* 依頼一覧（日付→エリア→施設でグループ化） */}
            {requests.length === 0 && roomEvents.length === 0 && !showRequestForm && !showEventForm && (
              <p className="text-center text-gray-400 mt-8">依頼・イベントはまだありません</p>
            )}
            {(() => {
              const today2 = new Date().toISOString().split('T')[0]
              // 全日付を収集
              const allDates = new Set([
                ...requests.map(r => r.request_date || r.created_at.split('T')[0]),
                ...roomEvents.map(e => e.event_date),
              ])

              return [...allDates].sort((a, b) => b.localeCompare(a)).map(date => {
                const isOpen = expandedReqDates.has(date)
                const isPast = date < today2
                const dateReqs = requests.filter(r => (r.request_date || r.created_at.split('T')[0]) === date)
                const dateEvents = roomEvents.filter(e => e.event_date === date)
                const pendingCount = dateReqs.filter(r => r.status === 'pending').length
                const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

                // エリア→施設でグループ化（依頼）
                const byArea: Record<string, Record<string, EarlyLateRequest[]>> = {}
                for (const req of dateReqs) {
                  const area = req.rooms?.facilities?.area || 'その他'
                  const fname = req.rooms?.facilities?.name || '不明'
                  if (!byArea[area]) byArea[area] = {}
                  if (!byArea[area][fname]) byArea[area][fname] = []
                  byArea[area][fname].push(req)
                }

                // エリア→施設でグループ化（イベント）
                const evByArea: Record<string, Record<string, RoomEvent[]>> = {}
                for (const ev of dateEvents) {
                  const area = ev.facilities?.area || 'その他'
                  const fname = ev.facilities?.name || '不明'
                  if (!evByArea[area]) evByArea[area] = {}
                  if (!evByArea[area][fname]) evByArea[area][fname] = []
                  evByArea[area][fname].push(ev)
                }

                const allAreas = [...new Set([...Object.keys(byArea), ...Object.keys(evByArea)])].sort((a, b) => a.localeCompare(b, 'ja'))

                return (
                  <div key={date} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <button onClick={() => toggleReqDate(date)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold text-sm ${isPast ? 'text-gray-400' : 'text-gray-800'}`}>{dateLabel}</span>
                        {dateEvents.length > 0 && (
                          <span className="bg-purple-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
                            {dateEvents.map(e => e.event_type).filter((v, i, a) => a.indexOf(v) === i).join('・')}あり
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="bg-yellow-400 text-white text-xs font-bold rounded-full px-1.5 py-0.5">{pendingCount}件未回答</span>
                        )}
                      </div>
                      <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t">
                        {allAreas.map(area => {
                          const areaReqFacs = byArea[area] || {}
                          const areaEvFacs = evByArea[area] || {}
                          const allFacNames = [...new Set([...Object.keys(areaReqFacs), ...Object.keys(areaEvFacs)])].sort((a, b) => a.localeCompare(b, 'ja'))
                          return (
                            <div key={area}>
                              <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-400">{area}</div>
                              {allFacNames.map(fname => {
                                const facReqs = areaReqFacs[fname] || []
                                const facEvents = areaEvFacs[fname] || []
                                return (
                                  <div key={fname} className="border-t px-4 py-3">
                                    <p className="text-xs font-bold text-gray-600 mb-2">{fname}</p>

                                    {/* 内覧・是正イベント */}
                                    {facEvents.map(ev => (
                                      <div key={ev.id} className="flex items-start justify-between gap-2 mb-2 bg-purple-50 rounded-lg px-3 py-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                              {ev.event_type === '内覧' ? '👀 内覧' : '🔧 是正'}
                                            </span>
                                            {ev.rooms ? <span className="text-xs text-gray-600">{ev.rooms.room_number}号室</span> : <span className="text-xs text-gray-400">施設全体</span>}
                                            <span className="text-xs text-purple-600 font-medium">{ev.start_time.slice(0,5)}〜{ev.end_time.slice(0,5)}</span>
                                          </div>
                                          {ev.note && <p className="text-xs text-gray-400 mt-0.5">{ev.note}</p>}
                                        </div>
                                        <button onClick={() => deleteEvent(ev.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                                      </div>
                                    ))}

                                    {/* アーリーレイト依頼 */}
                                    <div className="space-y-2">
                                      {facReqs.map(req => {
                                        const rt = req.requested_time || ''
                                        const timeStr = rt ? (rt.includes(' ') ? rt.split(' ')[1].slice(0, 5) : rt.slice(0, 5)) : null
                                        // 時間衝突チェック
                                        const reqTimeH = timeStr ? parseInt(timeStr.split(':')[0]) * 60 + parseInt(timeStr.split(':')[1]) : null
                                        const conflict = facEvents.some(ev => {
                                          const evStartH = parseInt(ev.start_time.slice(0,2)) * 60 + parseInt(ev.start_time.slice(3,5))
                                          return reqTimeH !== null && evStartH < reqTimeH
                                        })
                                        return (
                                          <div key={req.id} className={`flex items-start justify-between gap-2 ${conflict ? 'bg-red-50 rounded-lg px-2 py-1' : ''}`}>
                                            <div className="flex-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-sm">{req.type === 'early_checkin' ? '🌅' : '🌙'}</span>
                                                <span className="text-sm text-gray-700">{req.rooms?.room_number}号室</span>
                                                {timeStr && <span className="text-sm font-medium text-blue-600">{timeStr}</span>}
                                                {conflict && <span className="text-xs text-red-600 font-bold">⚠ 時間衝突</span>}
                                              </div>
                                              {req.message && <p className="text-xs text-gray-400 mt-0.5">{req.message}</p>}
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${reqStatusColor[req.status]}`}>
                                              {reqStatusLabel[req.status]}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </>
        )}

        {/* チャットタブ */}
        {tab === 'chat' && (() => {
          const chatByArea: Record<string, typeof facilities> = {}
          for (const f of facilities) {
            const area = f.area || 'その他'
            if (!chatByArea[area]) chatByArea[area] = []
            chatByArea[area].push(f)
          }
          return (
            <div className="space-y-1">
              {Object.entries(chatByArea).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([area, facs]) => (
                <div key={area}>
                  <div className="px-1 py-1.5 text-xs font-bold text-gray-400 tracking-wide">{area}</div>
                  {facs.map(f => {
                    const facRecs = records.filter(r => r.rooms?.facility_id === f.id)
                    const total = facRecs.length
                    const completed = facRecs.filter(r => r.status === 'completed').length
                    const inProgress = facRecs.filter(r => r.status === 'in_progress').length
                    const allDone = total > 0 && completed === total
                    const hasProgress = inProgress > 0
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setUnreadCounts(prev => { const n = { ...prev }; delete n[f.id]; return n })
                          router.push(`/admin/chat/${f.id}`)
                        }}
                        className="w-full bg-white border-b px-4 py-3 flex items-center gap-3 text-left active:bg-gray-50"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                          allDone ? 'bg-green-100' : hasProgress ? 'bg-yellow-100' : 'bg-gray-100'
                        }`}>
                          {allDone ? '✅' : hasProgress ? '🧹' : '🏠'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">{f.name}</p>
                          {total > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {completed}/{total}部屋完了
                              {inProgress > 0 && <span className="text-yellow-600 ml-1">・清掃中 {inProgress}部屋</span>}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          {total > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              allDone ? 'bg-green-100 text-green-700' :
                              hasProgress ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {allDone ? '完了' : hasProgress ? '清掃中' : '未開始'}
                            </span>
                          )}
                          {unreadCounts[f.id] > 0 ? (
                            <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                              {unreadCounts[f.id] > 99 ? '99+' : unreadCounts[f.id]}
                            </span>
                          ) : (
                            <span className="text-gray-300">›</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })()}

        {/* 写真タブ */}
        {tab === 'photos' && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-4">施設・日付・号室ごとに写真を管理できます</p>
            <button
              onClick={() => router.push('/admin/photos')}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl font-medium"
            >
              📷 写真管理を開く
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
