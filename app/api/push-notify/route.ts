import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const vapidEmail = process.env.VAPID_EMAIL
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
  const { title, body, url, userIds, excludeUserId } = await req.json()

  let query = supabase.from('push_subscriptions').select('subscription, endpoint, user_id')
  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds)
  }
  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId)
  }
  const { data: subs, error: subsError } = await query

  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title, body, url })
  let sent = 0
  const expired: string[] = []

  await Promise.all(subs.map(async (row) => {
    try {
      const sub = JSON.parse(row.subscription)
      await webpush.sendNotification(sub, payload)
      sent++
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e && (e.statusCode === 410 || e.statusCode === 404)) {
        expired.push(row.endpoint)
      }
    }
  }))

  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired)
  }

  return NextResponse.json({ ok: true, sent })
}
