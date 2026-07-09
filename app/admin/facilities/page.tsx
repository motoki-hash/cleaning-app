'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Facility = { id: string; name: string; area: string }
type Room = { id: string; room_number: string; facility_id: string }

const AREAS = ['港区', '渋谷区', '新宿区', '世田谷区', '台東区', '中野区', '品川区', '墨田区', '大阪府', 'その他']

export default function FacilitiesPage() {
  const router = useRouter()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null)

  // 施設追加フォーム
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newAreaCustom, setNewAreaCustom] = useState('')
  const [roomInputs, setRoomInputs] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // 号室追加（既存施設）
  const [addRoomInput, setAddRoomInput] = useState('')
  const [addingRoom, setAddingRoom] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [facRes, roomRes] = await Promise.all([
      supabase.from('facilities').select('id, name, area').order('area').order('name'),
      supabase.from('rooms').select('id, room_number, facility_id').order('room_number'),
    ])
    setFacilities((facRes.data || []) as Facility[])
    setRooms((roomRes.data || []) as Room[])
    setLoading(false)
  }

  const addFacility = async () => {
    const name = newName.trim()
    const area = newArea === 'その他' ? newAreaCustom.trim() : newArea
    if (!name || !area) { setSaveMsg('❌ 施設名とエリアは必須です'); return }

    const validRooms = roomInputs.map(r => r.trim()).filter(Boolean)
    if (validRooms.length === 0) { setSaveMsg('❌ 号室を1つ以上入力してください'); return }

    setSaving(true)
    setSaveMsg('')

    const { data: facData, error: facErr } = await supabase
      .from('facilities')
      .insert({ name, area })
      .select('id')
      .single()

    if (facErr || !facData) {
      setSaveMsg('❌ 施設の登録に失敗しました')
      setSaving(false)
      return
    }

    const roomRows = validRooms.map(r => ({ room_number: r, facility_id: facData.id }))
    const { error: roomErr } = await supabase.from('rooms').insert(roomRows)

    if (roomErr) {
      setSaveMsg('❌ 号室の登録に失敗しました')
      setSaving(false)
      return
    }

    setSaveMsg(`✅ ${name} を登録しました（${validRooms.length}室）`)
    setNewName('')
    setNewArea('')
    setNewAreaCustom('')
    setRoomInputs([''])
    setShowAdd(false)
    setSaving(false)
    await load()
  }

  const addRoomToFacility = async (facilityId: string) => {
    const nums = addRoomInput.split(/[,、\s]+/).map(s => s.trim()).filter(Boolean)
    if (nums.length === 0) return
    setAddingRoom(true)
    await supabase.from('rooms').insert(nums.map(r => ({ room_number: r, facility_id: facilityId })))
    setAddRoomInput('')
    setAddingRoom(false)
    await load()
  }

  const deleteRoom = async (roomId: string, roomNumber: string) => {
    if (!confirm(`${roomNumber}号室を削除しますか？`)) return
    await supabase.from('rooms').delete().eq('id', roomId)
    await load()
  }

  const deleteFacility = async (facilityId: string, facilityName: string) => {
    if (!confirm(`「${facilityName}」を削除しますか？\n全ての号室データも削除されます。`)) return
    await supabase.from('rooms').delete().eq('facility_id', facilityId)
    await supabase.from('facilities').delete().eq('id', facilityId)
    if (selectedFacility === facilityId) setSelectedFacility(null)
    await load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  const grouped = facilities.reduce<Record<string, Facility[]>>((acc, f) => {
    const area = f.area || 'その他'
    if (!acc[area]) acc[area] = []
    acc[area].push(f)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin')} className="text-white text-2xl leading-none">‹</button>
        <h1 className="font-bold flex-1">施設管理</h1>
        <button
          onClick={() => { setShowAdd(true); setSaveMsg('') }}
          className="bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-lg"
        >
          ＋ 施設追加
        </button>
      </header>

      <div className="p-4 space-y-4">

        {/* 施設追加フォーム */}
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-blue-200">
            <p className="font-bold text-gray-800 mb-4">新しい施設を追加</p>
            <div className="space-y-3">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="施設名（必須）"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />

              <div>
                <p className="text-xs text-gray-500 mb-1.5">エリア（必須）</p>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map(a => (
                    <button
                      key={a}
                      onClick={() => setNewArea(a)}
                      className={`text-xs px-3 py-1.5 rounded-full border ${
                        newArea === a ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 border-gray-300'
                      }`}
                    >{a}</button>
                  ))}
                </div>
                {newArea === 'その他' && (
                  <input
                    type="text"
                    value={newAreaCustom}
                    onChange={e => setNewAreaCustom(e.target.value)}
                    placeholder="エリア名を入力"
                    className="mt-2 w-full border rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-500">号室（必須）</p>
                  <button
                    onClick={() => setRoomInputs([...roomInputs, ''])}
                    className="text-xs text-blue-600"
                  >＋ 追加</button>
                </div>
                <div className="space-y-2">
                  {roomInputs.map((val, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={val}
                        onChange={e => {
                          const updated = [...roomInputs]
                          updated[i] = e.target.value
                          setRoomInputs(updated)
                        }}
                        placeholder={`例: 10${i + 1}`}
                        className="flex-1 border rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                      />
                      {roomInputs.length > 1 && (
                        <button
                          onClick={() => setRoomInputs(roomInputs.filter((_, j) => j !== i))}
                          className="text-red-400 text-lg leading-none w-8 h-8 flex items-center justify-center"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">カンマ区切りで複数入力も可（例: 101, 102, 103）</p>
              </div>

              {saveMsg && <p className="text-sm">{saveMsg}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowAdd(false); setNewName(''); setNewArea(''); setRoomInputs(['']); setSaveMsg('') }}
                  className="flex-1 border rounded-xl py-2.5 text-sm text-gray-600"
                >キャンセル</button>
                <button
                  onClick={addFacility}
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                >登録する</button>
              </div>
            </div>
          </div>
        )}

        {/* 施設一覧 */}
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([area, facs]) => (
          <div key={area}>
            <p className="text-xs font-bold text-gray-400 px-1 mb-2">{area}</p>
            <div className="space-y-2">
              {facs.map(f => {
                const facRooms = rooms.filter(r => r.facility_id === f.id)
                  .sort((a, b) => a.room_number.localeCompare(b.room_number, 'ja', { numeric: true }))
                const isOpen = selectedFacility === f.id

                return (
                  <div key={f.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <button
                        onClick={() => setSelectedFacility(isOpen ? null : f.id)}
                        className="flex items-center gap-3 flex-1 text-left min-w-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 text-sm">{f.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{facRooms.length}室</p>
                        </div>
                        <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      <button
                        onClick={() => deleteFacility(f.id, f.name)}
                        className="text-red-400 text-xs border border-red-200 rounded-lg px-2 py-1 flex-shrink-0"
                      >削除</button>
                    </div>

                    {isOpen && (
                      <div className="border-t px-4 py-4 space-y-4">
                        {/* 号室一覧 */}
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2">号室一覧</p>
                          {facRooms.length === 0 ? (
                            <p className="text-xs text-gray-400">号室がありません</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {facRooms.map(r => (
                                <div key={r.id} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2.5 py-1">
                                  <span className="text-sm text-gray-700">{r.room_number}号室</span>
                                  <button
                                    onClick={() => deleteRoom(r.id, r.room_number)}
                                    className="text-gray-400 hover:text-red-500 text-xs ml-0.5"
                                  >×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 号室追加 */}
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2">号室を追加</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={addRoomInput}
                              onChange={e => setAddRoomInput(e.target.value)}
                              placeholder="例: 201, 202, 203"
                              className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={() => addRoomToFacility(f.id)}
                              disabled={addingRoom || !addRoomInput.trim()}
                              className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                            >追加</button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">カンマ区切りで複数入力可</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
