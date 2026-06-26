import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function postToSlack(text: string, threadTs?: string) {
  const botToken = process.env.SLACK_BOT_TOKEN
  const channelId = process.env.SLACK_CHANNEL_ID

  if (botToken && channelId) {
    const body: Record<string, string> = { channel: channelId, text }
    if (threadTs) body.thread_ts = threadTs

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data.ok ? data.ts : null
  }

  // フォールバック: Webhook
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  }
  return null
}

export async function POST(req: NextRequest) {
  const { status, facilityName, facilityId, roomNumber, area, requestType, requestTime, message } = await req.json()

  let text = ''

  if (status === 'chat') {
    // チャットメッセージはスレッドに投稿
    if (facilityId) {
      const today = new Date().toISOString().split('T')[0]

      // 今日のスレッドを取得
      const { data: thread } = await supabaseAdmin
        .from('slack_threads')
        .select('thread_ts')
        .eq('facility_id', facilityId)
        .eq('date', today)
        .single()

      if (thread) {
        // 既存スレッドに返信
        await postToSlack(`👤 ${message}`, thread.thread_ts)
      } else {
        // 新しいスレッドを作成
        const ts = await postToSlack(`💬 ${facilityName} 本日のチャット\n👤 ${message}`)
        if (ts) {
          await supabaseAdmin.from('slack_threads').insert({ facility_id: facilityId, date: today, thread_ts: ts })
        }
      }
      return NextResponse.json({ ok: true })
    }
    text = `💬 ${facilityName}にメッセージ\n👤 ${message}`
  } else if (status === 'request') {
    const timeText = requestTime ? `（${requestTime}）` : ''
    text = `📨 ${requestType}依頼${timeText}\n📍 ${area} / ${facilityName} ${roomNumber}号室`
    if (message) text += `\n💬 ${message}`
  } else {
    const statusLabel: Record<string, string> = {
      in_progress: '🧹 清掃開始',
      completed: '✅ 清掃完了',
    }
    const label = statusLabel[status]
    if (!label) return NextResponse.json({ ok: true })
    text = `${label}\n📍 ${area} / ${facilityName} ${roomNumber}号室`
  }

  await postToSlack(text)
  return NextResponse.json({ ok: true })
}
