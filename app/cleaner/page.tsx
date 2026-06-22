'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePushNotification } from '@/lib/usePushNotification'

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  usePushNotification(currentUserId)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      const { data: cleaner } = await supabase
        .from('cleaners').select('id').eq('user_id', user.id).single()
      if (!cleaner) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]
      const [facRes, recRes] = await Promise.all([
        supabase.from('facilities').select('id, name, area').order('area').order('name'),
        supabase.from('cleaning_records')
          .select('id, status, rooms(room_number, facility_id)')
          .eq('cleaner_id', cleaner.id)
          .eq('scheduled_date', today),
      ])
      const facilityList = (facRes.data as Facility[]) || []
      setFacilities(facilityList)
      setRecords((recRes.data as unknown as CleaningRecord[]) || [])
      setLoading(false)

      // 未読メッセージ数を計算
      const todayFacIds = facilityList.filter(f => {
        const facRecs = ((recRes.data as unknown as CleaningRecord[]) || []).filter(r => r.rooms?.facility_id === f.id)
        return facRecs.length > 0
      }).map(f => f.id)

      if (todayFacIds.length > 0) {
        const { data: recentMsgs } = await supabase
          .from('chat_messages')
          .select('facility_id, created_at')
          .in('facility_id', todayFacIds)
          .in('type', ['note', 'early_late_request'])
          .order('created_at', { ascending: false })

        if (recentMsgs) {
          const counts: Record<string, number> = {}
          for (const msg of recentMsgs) {
            const lastRead = localStorage.getItem(`lastRead_${msg.facility_id}`) || '1970-01-01'
            if (msg.created_at > lastRead) {
              counts[msg.facility_id] = (counts[msg.facility_id] || 0) + 1
            }
          }
          setUnreadCounts(counts)
        }
      }

      // リアルタイム: 新着メッセージでバッジを更新
      const msgChannel = supabase
        .channel('cleaner:home:messages')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        }, payload => {
          const msg = payload.new
          if (msg.type !== 'note' && msg.type !== 'early_late_request') return
          const lastRead = localStorage.getItem(`lastRead_${msg.facility_id}`) || '1970-01-01'
          if (msg.created_at > lastRead) {
            setUnreadCounts(prev => ({ ...prev, [msg.facility_id]: (prev[msg.facility_id] || 0) + 1 }))
          }
        })
        .subscribe()

      // リアルタイム: 自分の清掃レコードが更新されたら反映
      const channel = supabase
        .channel('cleaner:records')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'cleaning_records',
        }, payload => {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? { ...r, status: payload.new.status } : r))
        })
        .subscribe()

      return () => { supabase.removeChannel(channel); supabase.removeChannel(msgChannel) }
    }
    init()
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getFacilityStats = (facilityId: string) => {
    const facRecords = records.filter(r => r.rooms?.facility_id === facilityId)
    return {
      total: facRecords.length,
      completed: facRecords.filter(r => r.status === 'completed').length,
      inProgress: facRecords.filter(r => r.status === 'in_progress').length,
    }
  }

  // 今日タスクがある施設だけ表示
  const todayFacilities = facilities.filter(f => getFacilityStats(f.id).total > 0)

  // エリアでグループ化（エリアなしは「その他」にまとめる）
  const grouped: Record<string, Facility[]> = {}
  for (const f of todayFacilities) {
    const area = f.area || 'その他'
    if (!grouped[area]) grouped[area] = []
    grouped[area].push(f)
  }
  const areas = Object.keys(grouped).sort()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-600 text-white px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">今日の清掃</h1>
          <p className="text-xs text-blue-200">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/cleaner/settings')} className="text-sm bg-blue-700 px-3 py-1 rounded-lg">設定</button>
          <button onClick={logout} className="text-sm bg-blue-700 px-3 py-1 rounded-lg">ログアウト</button>
        </div>
      </header>

      {/* サマリー */}
      <div className="bg-white border-b px-4 py-3 grid grid-cols-4 text-center">
        {[
          { label: '合計', value: records.length, color: 'text-gray-700' },
          { label: '完了', value: records.filter(r => r.status === 'completed').length, color: 'text-green-600' },
          { label: '清掃中', value: records.filter(r => r.status === 'in_progress').length, color: 'text-yellow-600' },
          { label: '未開始', value: records.filter(r => r.status === 'scheduled').length, color: 'text-gray-400' },
        ].map(item => (
          <div key={item.label}>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 施設リスト（LINEのトークリスト風） */}
      <div className="flex-1 overflow-y-auto">
        {todayFacilities.length === 0 ? (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-4xl mb-3">🏠</p>
            <p>今日の清掃タスクはありません</p>
          </div>
        ) : areas.map(area => (
          <div key={area}>
            <div className="px-4 py-1.5 bg-gray-100 text-xs font-medium text-gray-500">
              {area}
            </div>
            {grouped[area].map(facility => {
              const stats = getFacilityStats(facility.id)
              const allDone = stats.total > 0 && stats.completed === stats.total
              const hasProgress = stats.inProgress > 0

              return (
                <button
                  key={facility.id}
                  onClick={() => {
                    localStorage.setItem(`lastRead_${facility.id}`, new Date().toISOString())
                    setUnreadCounts(prev => { const n = { ...prev }; delete n[facility.id]; return n })
                    router.push(`/cleaner/chat/${facility.id}`)
                  }}
                  className="w-full bg-white border-b px-4 py-3 flex items-center gap-3 text-left active:bg-gray-50"
                >
                  {/* アイコン */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${
                    allDone ? 'bg-green-100' : hasProgress ? 'bg-yellow-100' : 'bg-blue-50'
                  }`}>
                    {allDone ? '✅' : hasProgress ? '🧹' : '🏠'}
                  </div>

                  {/* 施設名・進捗 */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{facility.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {stats.completed}/{stats.total}部屋完了
                      {stats.inProgress > 0 && (
                        <span className="text-yellow-600 ml-1">・清掃中 {stats.inProgress}部屋</span>
                      )}
                    </p>
                  </div>

                  {/* ステータスバッジ */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      allDone ? 'bg-green-100 text-green-700' :
                      hasProgress ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {allDone ? '完了' : hasProgress ? '清掃中' : '未開始'}
                    </span>
                    {unreadCounts[facility.id] > 0 ? (
                      <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                        {unreadCounts[facility.id] > 99 ? '99+' : unreadCounts[facility.id]}
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
    </div>
  )
}
