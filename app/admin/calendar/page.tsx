'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CalendarRecord = {
  id: string
  scheduled_date: string
  status: string
  rooms: {
    room_number: string
    facility_id: string
    facilities: { id: string; name: string; area: string } | null
  } | null
}

type EarlyLateRequest = {
  id: string
  type: string
  status: string
  request_date: string | null
  requested_time: string | null
  message: string | null
  rooms: {
    room_number: string
    facility_id: string
    facilities: { id: string; name: string } | null
  } | null
}

type Facility = { id: string; name: string; area: string }

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  scheduled: 'bg-gray-100 text-gray-600',
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完了',
  in_progress: '清掃中',
  scheduled: '未開始',
}

const REQ_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  hold: 'bg-gray-100 text-gray-500',
}

const REQ_STATUS_LABEL: Record<string, string> = {
  pending: '未回答',
  approved: '承認',
  rejected: '拒否',
  hold: '保留',
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function AdminCalendarPage() {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [records, setRecords] = useState<CalendarRecord[]>([])
  const [requests, setRequests] = useState<EarlyLateRequest[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    supabase.from('facilities').select('id, name, area').order('area').order('name')
      .then(({ data }) => setFacilities((data || []) as Facility[]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [recRes, reqRes] = await Promise.all([
      supabase
        .from('cleaning_records')
        .select('id, scheduled_date, status, rooms(room_number, facility_id, facilities(id, name, area))')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date'),
      supabase
        .from('early_late_requests')
        .select('id, type, status, request_date, requested_time, message, rooms(room_number, facility_id, facilities(id, name))')
        .gte('request_date', startDate)
        .lte('request_date', endDate),
    ])

    setRecords((recRes.data || []) as unknown as CalendarRecord[])
    setRequests((reqRes.data || []) as unknown as EarlyLateRequest[])
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().split('T')[0]

  const filteredRecords = selectedFacilityId
    ? records.filter(r => r.rooms?.facility_id === selectedFacilityId)
    : records

  const filteredRequests = selectedFacilityId
    ? requests.filter(r => r.rooms?.facility_id === selectedFacilityId)
    : requests

  const recordsByDate: Record<string, CalendarRecord[]> = {}
  for (const r of filteredRecords) {
    if (!recordsByDate[r.scheduled_date]) recordsByDate[r.scheduled_date] = []
    recordsByDate[r.scheduled_date].push(r)
  }

  const requestsByDate: Record<string, EarlyLateRequest[]> = {}
  for (const r of filteredRequests) {
    const date = r.request_date
    if (!date) continue
    if (!requestsByDate[date]) requestsByDate[date] = []
    requestsByDate[date].push(r)
  }

  const selectedRecords = selectedDate ? (recordsByDate[selectedDate] || []) : []
  const selectedRequests = selectedDate ? (requestsByDate[selectedDate] || []) : []

  const byFacility: Record<string, CalendarRecord[]> = {}
  for (const r of selectedRecords) {
    const fname = r.rooms?.facilities?.name || '不明'
    if (!byFacility[fname]) byFacility[fname] = []
    byFacility[fname].push(r)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin')} className="text-white text-2xl leading-none">‹</button>
        <h1 className="font-bold flex-1">清掃カレンダー</h1>
        {loading && <span className="text-xs text-gray-400">読み込み中...</span>}
      </header>

      {/* 施設フィルタ */}
      <div className="bg-white border-b px-4 py-2 flex gap-2">
        <select
          value={selectedFacilityId}
          onChange={e => { setSelectedFacilityId(e.target.value); setSelectedDate(null) }}
          className="border rounded-lg px-3 py-1.5 text-sm flex-1 text-gray-700"
        >
          <option value="">全施設</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {selectedFacilityId && (
          <button onClick={() => { setSelectedFacilityId(''); setSelectedDate(null) }}
            className="text-xs text-gray-500 border rounded-lg px-3 py-1.5">リセット</button>
        )}
      </div>

      {/* 月ナビゲーション */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b">
        <button onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 text-xl font-bold active:bg-gray-100">‹</button>
        <div className="text-center">
          <h2 className="font-bold text-gray-800">{year}年{month + 1}月</h2>
          <p className="text-xs text-gray-400">{filteredRecords.length}件 / 依頼{filteredRequests.length}件</p>
        </div>
        <button onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 text-xl font-bold active:bg-gray-100">›</button>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs py-2 font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`e${i}`} className="border-b border-r border-gray-100 h-16" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayRecs = recordsByDate[dateStr] || []
            const dayReqs = requestsByDate[dateStr] || []
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const dow = (firstDow + i) % 7
            const completed = dayRecs.filter(r => r.status === 'completed').length
            const inProgress = dayRecs.filter(r => r.status === 'in_progress').length
            const total = dayRecs.length
            const pendingReqs = dayReqs.filter(r => r.status === 'pending').length

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`border-b border-r border-gray-100 h-16 flex flex-col items-center pt-1 px-0.5 transition-colors ${isSelected ? 'bg-blue-50' : 'active:bg-gray-50'}`}
              >
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                  isToday ? 'bg-gray-900 text-white' :
                  dow === 0 ? 'text-red-400' :
                  dow === 6 ? 'text-blue-500' : 'text-gray-700'
                }`}>{day}</span>
                {total > 0 && (
                  <div className="mt-0.5 w-full px-0.5">
                    <p className="text-xs font-bold text-gray-600 text-center leading-none">{total}部屋</p>
                    <div className="flex h-1 rounded-full overflow-hidden gap-px mt-0.5">
                      {completed > 0 && <div className="bg-green-500 h-full" style={{ flex: completed }} />}
                      {inProgress > 0 && <div className="bg-yellow-400 h-full" style={{ flex: inProgress }} />}
                      {(total - completed - inProgress) > 0 && <div className="bg-gray-200 h-full" style={{ flex: total - completed - inProgress }} />}
                    </div>
                  </div>
                )}
                {dayReqs.length > 0 && (
                  <span className={`text-xs leading-none mt-0.5 ${pendingReqs > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                    🔔{dayReqs.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="px-4 py-2 flex gap-3 text-xs text-gray-500 flex-wrap bg-white border-b">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />完了</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />清掃中</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" />未開始</span>
        <span className="flex items-center gap-1"><span className="text-orange-500">🔔</span>アーリー/レイト依頼</span>
      </div>

      {/* 選択日の詳細 */}
      {selectedDate ? (
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </h3>
            <span className="text-xs text-gray-500">
              清掃{selectedRecords.length}部屋 / 依頼{selectedRequests.length}件
            </span>
          </div>

          {/* アーリー/レイト依頼 */}
          {selectedRequests.length > 0 && (
            <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-orange-400">
              <p className="text-sm font-bold text-gray-700 mb-2">🔔 アーリー/レイト依頼（{selectedRequests.length}件）</p>
              <div className="space-y-2">
                {selectedRequests.map(req => {
                  const timeStr = req.requested_time
                    ? req.requested_time.slice(0, 5)
                    : null
                  const isEarly = req.type === 'early_checkin'
                  return (
                    <div key={req.id} className="text-xs border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-800 text-sm">
                          {req.rooms?.facilities?.name} {req.rooms?.room_number}号室
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${REQ_STATUS_STYLE[req.status] || 'bg-gray-100 text-gray-500'}`}>
                          {REQ_STATUS_LABEL[req.status] || req.status}
                        </span>
                      </div>
                      <div className="text-gray-500 mb-1">
                        {isEarly ? '🌅 アーリーチェックイン' : '🌙 レイトチェックアウト'}
                        {timeStr && <span className="ml-1 font-medium text-gray-700">{timeStr}</span>}
                      </div>
                      {timeStr && (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isEarly ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          🧹 清掃可能時間：{isEarly ? `${timeStr} まで` : `${timeStr} 以降`}
                        </div>
                      )}
                      {req.message && <p className="text-gray-400 mt-1 italic">"{req.message}"</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 清掃レコード */}
          {selectedRecords.length === 0 && selectedRequests.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">この日のデータはありません</p>
          ) : selectedRecords.length > 0 && (
            <div className="space-y-2">
              {Object.entries(byFacility)
                .sort(([a], [b]) => a.localeCompare(b, 'ja'))
                .map(([fname, recs]) => {
                  const doneCount = recs.filter(r => r.status === 'completed').length
                  return (
                    <div key={fname} className="bg-white rounded-xl p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-gray-700">{fname}</p>
                        <span className="text-xs text-gray-400">{doneCount}/{recs.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recs
                          .sort((a, b) => (a.rooms?.room_number || '').localeCompare(b.rooms?.room_number || '', 'ja', { numeric: true }))
                          .map(r => (
                            <span key={r.id} className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLE[r.status] || STATUS_STYLE.scheduled}`}>
                              {r.rooms?.room_number}号室
                            </span>
                          ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          日付をタップすると詳細が表示されます
        </div>
      )}
    </div>
  )
}
