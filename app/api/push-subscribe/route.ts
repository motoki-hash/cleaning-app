import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { subscription, userId } = await req.json()
  if (!subscription || !userId) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  const endpoint = subscription.endpoint

  await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, subscription: JSON.stringify(subscription) }, { onConflict: 'endpoint' })

  return NextResponse.json({ ok: true })
}
