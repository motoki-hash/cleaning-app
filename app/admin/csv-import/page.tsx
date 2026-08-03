'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ParsedRow = {
  scheduled_date: string
  cleaning_type: string
  facility_name: string
  room_number: string
  guest_name: string
  checkout_time: string
  next_guest_name: string
  next_checkin_date: string
  next_checkin_time: string
  same_day_turnover: boolean
  notes: string
  // resolved
  facility_id?: string
  room_id?: string
  match_status: 'ok' | 'no_facility' | 'no_room'
}

export default function CsvImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parseDate = (s: string) => {
    if (!s) return ''
    const d = s.replace(/\//g, '-').slice(0, 10)
    // reject invalid dates like "N-A", "N/A", etc.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
    return d
  }

  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    const text = await file.text()
    const allRows = parseCsv(text)
    if (allRows.length < 2) { setError('データがありません'); return }

    const headers = allRows[0]
    const idx = (name: string) => headers.indexOf(name)

    const iDate = idx('清掃日')
    const iType = idx('清掃種類')
    const iFacility = idx('物件名')
    const iRoom = idx('部屋番号')
    const iGuest = idx('現在のゲスト名')
    const iCheckoutTime = idx('チェックアウト時間')
    const iNextGuest = idx('次のチェックイン ゲスト名')
    const iNextDate = idx('次回チェックイン日')
    const iNextTime = idx('次回のチェックイン時間')
    const iTurnover = idx('同日入替')
    const iComment = idx('コメント')

    // fetch facilities and rooms
    const [{ data: facilities }, { data: rooms }] = await Promise.all([
      supabase.from('facilities').select('id, name'),
      supabase.from('rooms').select('id, room_number, facility_id'),
    ])

    const parsed: ParsedRow[] = []
    for (let i = 1; i < allRows.length; i++) {
      const cols = allRows[i]
      const scheduled_date = parseDate(cols[iDate] || '')
      if (!scheduled_date) continue

      const facility_name = (cols[iFacility] || '').trim()
      const room_number = (cols[iRoom] || '').trim()

      // match facility (case-insensitive partial)
      const fac = facilities?.find(f =>
        f.name.toLowerCase() === facility_name.toLowerCase() ||
        facility_name.toLowerCase().includes(f.name.toLowerCase()) ||
        f.name.toLowerCase().includes(facility_name.toLowerCase())
      )
      const facility_id = fac?.id

      // match room — try multiple strategies
      const roomCandidates = facility_id ? rooms?.filter(r => r.facility_id === facility_id) ?? [] : []
      // 1. exact  2. strip leading letter+space (e.g. "b 601" → "601")  3. numeric only  4. no spaces
      const numericPart = room_number.replace(/^[a-z]\s*/i, '').replace(/\s+/g, '')
      const room = roomCandidates.find(r => {
        const rn = r.room_number.toLowerCase()
        const csv = room_number.toLowerCase()
        return rn === csv ||
          rn === numericPart.toLowerCase() ||
          rn.replace(/\s+/g, '') === csv.replace(/\s+/g, '') ||
          rn.replace(/\s+/g, '') === numericPart.toLowerCase()
      })
      const room_id = room?.id

      const match_status: ParsedRow['match_status'] =
        !facility_id ? 'no_facility' : !room_id ? 'no_room' : 'ok'

      parsed.push({
        scheduled_date,
        cleaning_type: (cols[iType] || '').trim(),
        facility_name,
        room_number,
        guest_name: (cols[iGuest] || '').trim(),
        checkout_time: (cols[iCheckoutTime] || '').trim(),
        next_guest_name: (cols[iNextGuest] || '').trim(),
        next_checkin_date: parseDate(cols[iNextDate] || ''),
        next_checkin_time: (cols[iNextTime] || '').trim(),
        same_day_turnover: (cols[iTurnover] || '').trim() === '有',
        notes: (cols[iComment] || '').replace(/^"|"$/g, '').trim(),
        facility_id,
        room_id,
        match_status,
      })
    }

    setRows(parsed)
  }

  const handleImport = async () => {
    const okRows = rows.filter(r => r.match_status === 'ok')
    if (okRows.length === 0) { setError('インポートできる行がありません'); return }
    setImporting(true)
    setError(null)

    let inserted = 0, updated = 0, skipped = 0
    let firstError: string | null = null

    // test insert with first row to catch errors early
    const testRow = okRows[0]
    const testRecord = {
      room_id: testRow.room_id!,
      scheduled_date: testRow.scheduled_date,
      cleaning_type: testRow.cleaning_type || null,
      guest_name: testRow.guest_name || null,
      checkout_time: testRow.checkout_time || null,
      next_guest_name: testRow.next_guest_name || null,
      next_checkin_date: testRow.next_checkin_date || null,
      next_checkin_time: testRow.next_checkin_time || null,
      same_day_turnover: testRow.same_day_turnover,
      notes: testRow.notes || null,
      status: 'scheduled',
    }
    const { error: testErr } = await supabase.from('cleaning_records').insert(testRecord)
    if (testErr) {
      setImporting(false)
      setError(`DBエラー: ${testErr.message} (code: ${testErr.code})`)
      return
    }
    inserted++

    for (const row of okRows.slice(1)) {
      const record = {
        room_id: row.room_id!,
        scheduled_date: row.scheduled_date,
        cleaning_type: row.cleaning_type || null,
        guest_name: row.guest_name || null,
        checkout_time: row.checkout_time || null,
        next_guest_name: row.next_guest_name || null,
        next_checkin_date: row.next_checkin_date || null,
        next_checkin_time: row.next_checkin_time || null,
        same_day_turnover: row.same_day_turnover,
        notes: row.notes || null,
        status: 'scheduled',
      }

      // check existing
      const { data: existing } = await supabase
        .from('cleaning_records')
        .select('id')
        .eq('room_id', row.room_id!)
        .eq('scheduled_date', row.scheduled_date)
        .maybeSingle()

      if (existing) {
        const { error: err } = await supabase
          .from('cleaning_records')
          .update(record)
          .eq('id', existing.id)
        if (err) { if (!firstError) firstError = err.message; skipped++; continue }
        updated++
      } else {
        const { error: err } = await supabase
          .from('cleaning_records')
          .insert(record)
        if (err) { if (!firstError) firstError = err.message; skipped++; continue }
        inserted++
      }
    }

    setImporting(false)
    if (firstError) setError(`一部エラー: ${firstError}`)
    setResult({ inserted, updated, skipped })
  }

  const okCount = rows.filter(r => r.match_status === 'ok').length
  const warnCount = rows.filter(r => r.match_status !== 'ok').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/admin')} className="text-gray-400 hover:text-white text-xl">‹</button>
        <h1 className="text-lg font-bold">清掃カレンダー CSVインポート</h1>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* アップロードエリア */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center bg-white cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
        >
          <p className="text-4xl mb-3">📂</p>
          <p className="text-gray-600 font-medium">CSVファイルをドロップ、またはクリックして選択</p>
          <p className="text-xs text-gray-400 mt-1">エアホストからエクスポートしたCSVファイル</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
            <p className="font-bold text-green-800">✅ インポート完了</p>
            <p className="text-sm text-green-700">新規追加: {result.inserted}件 / 更新: {result.updated}件 / スキップ: {result.skipped}件</p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">合計 {rows.length}行</span>
                <span className="text-sm text-green-600 font-medium">✅ マッチ: {okCount}件</span>
                {warnCount > 0 && <span className="text-sm text-red-500 font-medium">⚠️ 未マッチ: {warnCount}件（スキップ）</span>}
              </div>
              <button
                onClick={handleImport}
                disabled={importing || okCount === 0}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium text-sm disabled:opacity-50"
              >
                {importing ? 'インポート中...' : `${okCount}件をインポート`}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">状態</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">清掃日</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">種類</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">物件名</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">部屋</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">ゲスト</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">CO時間</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">次ゲスト</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">次CI</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">同日</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, i) => (
                      <tr key={i} className={row.match_status !== 'ok' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2">
                          {row.match_status === 'ok' && <span className="text-green-500">✅</span>}
                          {row.match_status === 'no_facility' && <span className="text-red-500" title="施設未マッチ">施設×</span>}
                          {row.match_status === 'no_room' && <span className="text-orange-500" title="号室未マッチ">号室×</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.scheduled_date}</td>
                        <td className="px-3 py-2 text-gray-600">{row.cleaning_type}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{row.facility_name}</td>
                        <td className="px-3 py-2 text-gray-700">{row.room_number}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[100px] truncate">{row.guest_name}</td>
                        <td className="px-3 py-2 text-gray-600">{row.checkout_time}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[100px] truncate">{row.next_guest_name}</td>
                        <td className="px-3 py-2 text-gray-600">{row.next_checkin_date} {row.next_checkin_time}</td>
                        <td className="px-3 py-2">{row.same_day_turnover ? '有' : '無'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Full CSV parser that handles multi-line quoted fields
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') {
        row.push(field); field = ''
        if (row.some(c => c.trim())) rows.push(row)
        row = []
      } else if (ch === '\r') { /* skip */ }
      else { field += ch }
    }
  }
  row.push(field)
  if (row.some(c => c.trim())) rows.push(row)
  return rows
}
