import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /cleaner以下へのアクセスにcookieチェックを適用
  if (pathname.startsWith('/cleaner')) {
    const cleanerId = request.cookies.get('cleanerId')?.value
    if (!cleanerId) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // cookieがあればリクエストを通す（クライアント側でlocalStorageにも同期される）
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/cleaner/:path*'],
}
