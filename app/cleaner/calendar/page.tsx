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
    facilities: { id: string; name: string } | null
  } | null
}

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

export default function CleanerCalendarPage() {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [records, setRecords] = useState<CalendarRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data } = await supabase
      .from('cleaning_records')
      .select('id, scheduled_date, status, rooms(room_number, facility_id, facilities(id, name))')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date')

    setRecords((data || []) as unknown as CalendarRecord[])
    setLoading(false)
  }, [year, month, router])

  useEffect(() => { load() }, [load])

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().split('T')[0]

  const recordsByDate: Record<string, CalendarRecord[]> = {}
  for (const r of records) {
    if (!recordsByDate[r.scheduled_date]) recordsByDate[r.scheduled_date] = []
    recordsByDate[r.scheduled_date].push(r)
  }

  const selectedRecords = selectedDate ? (recordsByDate[selectedDate] || []) : []

  const byFacility: Record<string, CalendarRecord[]> = {}
  for (const r of selectedRecords) {
    const fname = r.rooms?.facilities?.name || '不明'
    if (!byFacility[fname]) byFacility[fname] = []
    byFacility[fname].push(r)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/cleaner')} className="text-white text-2xl leading-none">‹</button>
        <h1 className="font-bold flex-1">清掃カレンダー</h1>
        {loading && <span className="text-xs text-blue-200">読み込み中...</span>}
      </header>

      {/* 月ナビゲーション */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b">
        <button
          onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-blue-600 text-xl font-bold active:bg-gray-100"
        >‹</button>
        <h2 className="font-bold text-gray-800">{year}年{month + 1}月</h2>
        <button
          onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-blue-600 text-xl font-bold active:bg-gray-100"
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
            <div key={`e${i}`} className="border-b border-r border-gray-100 h-14" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayRecs = recordsByDate[dateStr] || []
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const dow = (firstDow + i) % 7
            const completed = dayRecs.filter(r => r.status === 'completed').length
            const total = dayRecs.length

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`border-b border-r border-gray-100 h-14 flex flex-col items-center pt-1 px-0.5 transition-colors ${isSelected ? 'bg-blue-50' : 'active:bg-gray-50'}`}
              >
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                  isToday ? 'bg-blue-600 text-white' :
                  dow === 0 ? 'text-red-400' :
                  dow === 6 ? 'text-blue-500' :
                  'text-gray-700'
                }`}>{day}</span>
                {total > 0 && (
                  <div className="mt-0.5 flex flex-col items-center gap-0.5 w-full">
                    <span className="text-xs font-bold text-blue-600 leading-none">{total}部屋</span>
                    {completed > 0 && (
                      <div className="w-3/4 h-1 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(completed / total) * 100}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="px-4 py-2 flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />完了</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />清掃中</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />未開始</span>
      </div>

      {/* 選択日の詳細 */}
      {selectedDate ? (
        <div className="flex-1 p-4">
          <h3 className="text-sm font-bold text-gray-600 mb-3">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            　{selectedRecords.length}部屋
          </h3>
          {selectedRecords.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">この日の清掃はありません</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(byFacility).map(([fname, recs]) => (
                <div key={fname} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-sm font-bold text-gray-700 mb-2">{fname}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recs
                      .sort((a, b) => (a.rooms?.room_number || '').localeCompare(b.rooms?.room_number || '', 'ja', { numeric: true }))
                      .map(r => (
                        <span key={r.id} className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[r.status] || STATUS_STYLE.scheduled}`}>
                          {r.rooms?.room_number}号室
                          <span className="opacity-60 ml-1">({STATUS_LABEL[r.status] || r.status})</span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
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
