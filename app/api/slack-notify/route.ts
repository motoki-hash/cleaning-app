import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { status, facilityName, roomNumber, area } = await req.json()

  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return NextResponse.json({ error: 'no webhook' }, { status: 500 })

  const statusLabel: Record<string, string> = {
    in_progress: '🧹 清掃開始',
    completed: '✅ 清掃完了',
  }

  const label = statusLabel[status]
  if (!label) return NextResponse.json({ ok: true })

  const text = `${label}\n📍 ${area} / ${facilityName} ${roomNumber}号室`

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) return NextResponse.json({ error: 'slack error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
