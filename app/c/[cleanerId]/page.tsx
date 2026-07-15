import { cookies } from 'next/headers'
import CleanerEntryClient from './client'

export default async function CleanerEntryPage({
  params,
}: {
  params: { cleanerId: string }
}) {
  const { cleanerId } = params

  if (cleanerId) {
    // サーバーサイドでcookieを設定（PWAでも確実に動作）
    const cookieStore = cookies()
    cookieStore.set('cleanerId', cleanerId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false, // クライアントからも読めるようにする
    })
  }

  return <CleanerEntryClient cleanerId={cleanerId} />
}
