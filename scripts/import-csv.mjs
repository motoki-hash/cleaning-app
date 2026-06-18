import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.SUPABASE_URL || 'https://ilurxcoxajeoxujattar.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 環境変数を設定してください')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseKey)

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('使い方: node scripts/import-csv.mjs <CSVファイルのパス>')
  process.exit(1)
}

const content = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '')
const lines = content.trim().split(/\r?\n/)
const headers = lines[0].split(',')

const rows = lines.slice(1).map(line => {
  const values = []
  let current = ''
  let inQuote = false
  for (const char of line) {
    if (char === '"') { inQuote = !inQuote }
    else if (char === ',' && !inQuote) { values.push(current.trim()); current = '' }
    else { current += char }
  }
  values.push(current.trim())
  const obj = {}
  headers.forEach((h, i) => obj[h.trim()] = values[i] || '')
  return obj
})

// 施設一覧を取得
const { data: facilities } = await supabase.from('facilities').select('id, name')
const { data: rooms } = await supabase.from('rooms').select('id, room_number, facility_id')
const { data: cleaners } = await supabase.from('cleaners').select('id').limit(1)

const defaultCleanerId = cleaners?.[0]?.id

console.log('DB施設名一覧:', facilities?.map(f => f.name))
console.log('CSV施設名サンプル:', [...new Set(rows.slice(0,5).map(r => r['物件名']))])

// 重複除去（同じ施設・部屋・日付は1件だけ）
const seen = new Set()
const uniqueRows = rows.filter(row => {
  const key = `${row['物件名']}|${row['部屋番号']}|${row['清掃日']}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
console.log(`重複除去後: ${uniqueRows.length}件 (元: ${rows.length}件)`)

let inserted = 0
let skipped = 0

for (const row of uniqueRows) {
  const facilityName = row['物件名']?.trim()
  const rawRoomNumber = row['部屋番号']?.trim()
  const scheduledDate = row['清掃日']?.trim().replace(/\//g, '-')

  if (!facilityName || !rawRoomNumber || !scheduledDate) { skipped++; continue }

  // 部屋番号から数字部分だけ取り出す (例: "b 601" → "601")
  const roomNumber = rawRoomNumber.replace(/^[a-zA-Z]\s*/, '').trim()

  const facility = facilities?.find(f => facilityName.includes(f.name) || f.name.includes(facilityName))
  if (!facility) { console.log(`施設が見つかりません: ${facilityName}`); skipped++; continue }

  const room = rooms?.find(r => r.facility_id === facility.id && r.room_number === roomNumber)
  if (!room) { console.log(`部屋が見つかりません: ${facilityName} - ${roomNumber}`); skipped++; continue }

  if (!defaultCleanerId) { skipped++; continue }

  const { error } = await supabase.from('cleaning_records').insert({
    room_id: room.id,
    cleaner_id: defaultCleanerId,
    scheduled_date: scheduledDate,
    status: 'scheduled',
  })

  if (error) {
    console.log(`エラー: ${facilityName} ${roomNumber} - ${error.message}`)
    skipped++
  } else {
    inserted++
  }
}

console.log(`\n完了: ${inserted}件登録, ${skipped}件スキップ`)
