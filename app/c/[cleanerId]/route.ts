import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  const { cleanerId } = params

  // クライアントへのレスポンスにSet-Cookieヘッダーを付与（最も確実な方法）
  // cleanerIdをURLパラメータとして渡す（PWAでも確実に取得できる）
  const response = NextResponse.redirect(new URL(`/cleaner-entry?id=${cleanerId}`, request.url))
  response.cookies.set('cleanerId', cleanerId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  })

  return response
}
