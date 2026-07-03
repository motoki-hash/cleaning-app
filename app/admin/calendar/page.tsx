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

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function AdminCalendarPage() {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [records, setRecords] = useState<CalendarRecord[]>([])
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

    let query = supabase
      .from('cleaning_records')
      .select('id, scheduled_date, status, rooms(room_number, facility_id, facilities(id, name, area))')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date')

    const { data } = await query
    setRecords((data || []) as unknown as CalendarRecord[])
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().split('T')[0]

  // 施設フィルタ適用
  const filteredRecords = selectedFacilityId
    ? records.filter(r => r.rooms?.facility_id === selectedFacilityId)
    : records

  const recordsByDate: Record<string, CalendarRecord[]> = {}
  for (const r of filteredRecords) {
    if (!recordsByDate[r.scheduled_date]) recordsByDate[r.scheduled_date] = []
    recordsByDate[r.scheduled_date].push(r)
  }

  const selectedRecords = selectedDate ? (recordsByDate[selectedDate] || []) : []

  // 施設ごとにグループ化
  const byFacility: Record<string, CalendarRecord[]> = {}
  for (const r of selectedRecords) {
    const fname = r.rooms?.facilities?.name || '不明'
    if (!byFacility[fname]) byFacility[fname] = []
    byFacility[fname].push(r)
  }

  // エリア一覧（フィルタ用）
  const areas = [...new Set(facilities.map(f => f.area).filter(Boolean))].sort()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
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
          {facilities.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        {selectedFacilityId && (
          <button
            onClick={() => { setSelectedFacilityId(''); setSelectedDate(null) }}
            className="text-xs text-gray-500 border rounded-lg px-3 py-1.5"
          >
            リセット
          </button>
        )}
      </div>

      {/* 月ナビゲーション */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b">
        <button
          onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 text-xl font-bold active:bg-gray-100"
        >‹</button>
        <div className="text-center">
          <h2 className="font-bold text-gray-800">{year}年{month + 1}月</h2>
          <p className="text-xs text-gray-400">{filteredRecords.length}件</p>
        </div>
        <button
          onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 text-xl font-bold active:bg-gray-100"
        >›</button>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white shadow-sm">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs py-2 font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`e${i}`} className="border-b border-r border-gray-100 h-16" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayRecs = recordsByDate[dateStr] || []
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const dow = (firstDow + i) % 7
            const completed = dayRecs.filter(r => r.status === 'completed').length
            const inProgress = dayRecs.filter(r => r.status === 'in_progress').length
            const total = dayRecs.length

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`border-b border-r border-gray-100 h-16 flex flex-col items-center pt-1 px-0.5 transition-colors ${isSelected ? 'bg-blue-50' : 'active:bg-gray-50'}`}
              >
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                  isToday ? 'bg-gray-900 text-white' :
                  dow === 0 ? 'text-red-400' :
                  dow === 6 ? 'text-blue-500' :
                  'text-gray-700'
                }`}>{day}</span>
                {total > 0 && (
                  <div className="mt-0.5 w-full px-0.5 space-y-0.5">
                    <p className="text-xs font-bold text-gray-600 text-center leading-none">{total}部屋</p>
                    {/* 状態バー */}
                    <div className="flex h-1 rounded-full overflow-hidden gap-px">
                      {completed > 0 && <div className="bg-green-500 h-full" style={{ flex: completed }} />}
                      {inProgress > 0 && <div className="bg-yellow-400 h-full" style={{ flex: inProgress }} />}
                      {(total - completed - inProgress) > 0 && <div className="bg-gray-200 h-full" style={{ flex: total - completed - inProgress }} />}
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="px-4 py-2 flex gap-4 text-xs text-gray-500 bg-white border-b">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />完了</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />清掃中</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" />未開始</span>
      </div>

      {/* 選択日の詳細 */}
      {selectedDate ? (
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </h3>
            <span className="text-xs text-gray-500">
              {selectedRecords.length}部屋 / 完了{selectedRecords.filter(r => r.status === 'completed').length}
            </span>
          </div>

          {selectedRecords.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">この日の清掃はありません</p>
          ) : (
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
