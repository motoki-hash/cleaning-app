'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Facility = { id: string; name: string; area: string }
type Photo = {
  id: string
  photo_url: string
  photo_type: string
  created_at: string
  cleaning_record_id: string
  cleaning_records: {
    scheduled_date: string
    rooms: { room_number: string; facility_id: string } | null
  } | null
}

export default function AdminPhotosPage() {
  const router = useRouter()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dates, setDates] = useState<string[]>([])

  useEffect(() => {
    supabase.from('facilities').select('id, name, area').order('area').order('name')
      .then(({ data }) => { setFacilities(data || []); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!selectedFacility) { setDates([]); setSelectedDate(null); setPhotos([]); return }
    supabase
      .from('cleaning_photos')
      .select('cleaning_records(scheduled_date, rooms(facility_id))')
      .then(({ data }) => {
        const facDates = new Set<string>()
        for (const p of (data || []) as unknown as Photo[]) {
          if (p.cleaning_records?.rooms?.facility_id === selectedFacility.id) {
            facDates.add(p.cleaning_records.scheduled_date)
          }
        }
        setDates(Array.from(facDates).sort().reverse())
        setSelectedDate(null)
        setPhotos([])
      })
  }, [selectedFacility])

  useEffect(() => {
    if (!selectedFacility || !selectedDate) { setPhotos([]); return }
    supabase
      .from('cleaning_photos')
      .select('id, photo_url, photo_type, created_at, cleaning_record_id, cleaning_records(scheduled_date, rooms(room_number, facility_id))')
      .then(({ data }) => {
        const filtered = ((data || []) as unknown as Photo[]).filter(p =>
          p.cleaning_records?.rooms?.facility_id === selectedFacility.id &&
          p.cleaning_records?.scheduled_date === selectedDate
        )
        filtered.sort((a, b) => {
          const ra = a.cleaning_records?.rooms?.room_number || ''
          const rb = b.cleaning_records?.rooms?.room_number || ''
          return ra.localeCompare(rb, 'ja', { numeric: true })
        })
        setPhotos(filtered)
      })
  }, [selectedFacility, selectedDate])

  const flatPhotos = photos

  const goNext = useCallback(() => {
    if (lightboxIndex === null) return
    setLightboxIndex((lightboxIndex + 1) % flatPhotos.length)
  }, [lightboxIndex, flatPhotos.length])

  const goPrev = useCallback(() => {
    if (lightboxIndex === null) return
    setLightboxIndex((lightboxIndex - 1 + flatPhotos.length) % flatPhotos.length)
  }, [lightboxIndex, flatPhotos.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, goNext, goPrev])

  const deletePhoto = async () => {
    if (lightboxIndex === null) return
    const photo = flatPhotos[lightboxIndex]
    if (!confirm('この写真を削除しますか？')) return
    setDeleting(true)
    // Storage削除
    const urlPath = new URL(photo.photo_url).pathname
    const storagePath = urlPath.split('/cleaning-photos/')[1]
    if (storagePath) await supabase.storage.from('cleaning-photos').remove([storagePath])
    // DB削除
    await supabase.from('cleaning_photos').delete().eq('id', photo.id)
    const newPhotos = photos.filter(p => p.id !== photo.id)
    setPhotos(newPhotos)
    if (newPhotos.length === 0) {
      setLightboxIndex(null)
    } else {
      setLightboxIndex(Math.min(lightboxIndex, newPhotos.length - 1))
    }
    setDeleting(false)
  }

  // 号室ごとにグループ化
  const grouped: Record<string, Photo[]> = {}
  for (const p of photos) {
    const room = p.cleaning_records?.rooms?.room_number || '不明'
    if (!grouped[room]) grouped[room] = []
    grouped[room].push(p)
  }

  const typeLabel = (t: string) => t === 'after' ? '清掃後' : t === 'issue' ? '問題' : t === 'before' ? '清掃前' : t

  const currentPhoto = lightboxIndex !== null ? flatPhotos[lightboxIndex] : null

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin')} className="text-white text-2xl leading-none">‹</button>
        <h1 className="font-bold">写真管理</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* 施設選択 */}
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2">施設</p>
          <div className="flex flex-wrap gap-2">
            {facilities.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFacility(selectedFacility?.id === f.id ? null : f)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selectedFacility?.id === f.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* 日付選択 */}
        {selectedFacility && (
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">日付</p>
            {dates.length === 0 ? (
              <p className="text-sm text-gray-400">写真がありません</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dates.map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(selectedDate === d ? null : d)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedDate === d
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 写真一覧（号室ごと） */}
        {selectedDate && Object.keys(grouped).length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">この日の写真はありません</p>
        )}
        {Object.entries(grouped).map(([room, roomPhotos]) => (
          <div key={room}>
            <p className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">{room}号室</p>
            <div className="grid grid-cols-3 gap-2">
              {roomPhotos.map(photo => {
                const idx = flatPhotos.findIndex(p => p.id === photo.id)
                return (
                  <div key={photo.id} className="relative aspect-square cursor-pointer" onClick={() => setLightboxIndex(idx)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.photo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    <span className={`absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                      photo.photo_type === 'issue' ? 'bg-red-500 text-white' : 'bg-black/50 text-white'
                    }`}>
                      {typeLabel(photo.photo_type)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ライトボックス */}
      {currentPhoto && lightboxIndex !== null && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              currentPhoto.photo_type === 'issue' ? 'bg-red-500 text-white' : 'bg-white/20 text-white'
            }`}>
              {typeLabel(currentPhoto.photo_type)} · {currentPhoto.cleaning_records?.rooms?.room_number}号室
            </span>
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm">{lightboxIndex + 1} / {flatPhotos.length}</span>
              <button
                onClick={deletePhoto}
                disabled={deleting}
                className="text-red-400 text-sm px-3 py-1 border border-red-400/50 rounded-lg disabled:opacity-50"
              >
                {deleting ? '削除中...' : '🗑 削除'}
              </button>
              <button onClick={() => setLightboxIndex(null)} className="text-white text-2xl leading-none">×</button>
            </div>
          </div>

          {/* 写真 + 矢印 */}
          <div className="flex-1 flex items-center justify-center relative">
            {flatPhotos.length > 1 && (
              <button
                onClick={goPrev}
                className="absolute left-2 z-10 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white text-xl"
              >
                ‹
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.photo_url}
              alt=""
              className="max-w-full max-h-full object-contain px-14"
            />
            {flatPhotos.length > 1 && (
              <button
                onClick={goNext}
                className="absolute right-2 z-10 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white text-xl"
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
