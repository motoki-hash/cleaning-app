'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Facility = { id: string; name: string; area: string }
type CleaningRecord = {
  id: string
  status: string
  rooms: { room_number: string; facility_id: string } | null
}

export default function CleanerHome() {
  const router = useRouter()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [records, setRecords] = useState<CleaningRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [cleanerId, setCleanerId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cleaner } = await supabase
        .from('cleaners').select('id').eq('user_id', user.id).single()
      if (!cleaner) { setLoading(false); return }
      setCleanerId(cleaner.id)

      const today = new Date().toISOString().split('T')[0]
      const [facRes, recRes] = await Promise.all([
        supabase.from('facilities').select('id, name, area').order('area').order('name'),
        supabase.from('cleaning_records')
          .select('id, status, rooms(room_number, facility_id)')
          .eq('cleaner_id', cleaner.id)
          .eq('scheduled_date', today),
      ])
      setFacilities((facRes.data as Facility[]) || [])
      setRecords((recRes.data as unknown as CleaningRecord[]) || [])
      setLoading(false)
    }
    init()
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getFacilityStats = (facilityId: string) => {
    const facRecords = records.filter(r => r.rooms?.facility_id === facilityId)
    const total = facRecords.length
    const completed = facRecords.filter(r => r.status === 'completed').length
    const inProgress = facRecords.filter(r => r.status === 'in_progress').length
    return { total, completed, inProgress }
  }

  const todayFacilities = facilities.filter(f => {
    const stats = getFacilityStats(f.id)
    return stats.total > 0
  })

  const areas = [...new Set(todayFacilities.map(f => f.area).filter(Boolean))].sort()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">今日の清掃</h1>
          <p className="text-xs text-blue-200">{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
        </div>
        <button onClick={logout} className="text-sm bg-blue-700 px-3 py-1 rounded-lg">ログアウト</button>
      </header>

      {/* サマリー */}
      <div className="bg-white border-b px-4 py-3 flex gap-4 text-center">
        {[
          { label: '合計', value: records.length, color: 'text-gray-700' },
          { label: '完了', value: records.filter(r => r.status === 'completed').length, color: 'text-green-600' },
          { label: '清掃中', value: records.filter(r => r.status === 'in_progress').length, color: 'text-yellow-600' },
          { label: '未開始', value: records.filter(r => r.status === 'scheduled').length, color: 'text-gray-400' },
        ].map(item => (
          <div key={item.label} className="flex-1">
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 施設リスト */}
      <div className="flex-1 overflow-y-auto">
        {todayFacilities.length === 0 ? (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-4xl mb-3">🏠</p>
            <p>今日の清掃タスクはありません</p>
          </div>
        ) : (
          areas.map(area => (
            <div key={area}>
              <div className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-500 sticky top-[72px]">
                {area}
              </div>
              {todayFacilities.filter(f => f.area === area).map(facility => {
                const stats = getFacilityStats(facility.id)
                const allDone = stats.completed === stats.total
                const hasProgress = stats.inProgress > 0

                return (
                  <button
                    key={facility.id}
                    onClick={() => router.push(`/cleaner/chat/${facility.id}`)}
                    className="w-full bg-white border-b px-4 py-4 flex items-center gap-3 text-left active:bg-gray-50"
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                      allDone ? 'bg-green-100' : hasProgress ? 'bg-yellow-100' : 'bg-blue-100'
                    }`}>
                      {allDone ? '✅' : hasProgress ? '🧹' : '🏠'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{facility.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {stats.completed}/{stats.total}部屋完了
                        {stats.inProgress > 0 && <span className="text-yellow-600 ml-2">清掃中 {stats.inProgress}</span>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {allDone ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">完了</span>
                      ) : hasProgress ? (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">清掃中</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未開始</span>
                      )}
                      <span className="text-gray-300 text-lg">›</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
