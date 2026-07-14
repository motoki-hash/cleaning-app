// localStorage（通常）とcookie（PWAホーム画面）の両方からcleanerIdを取得
export function getCleanerId(): string | null {
  if (typeof window === 'undefined') return null
  const fromStorage = localStorage.getItem('cleanerId')
  if (fromStorage) return fromStorage
  const match = document.cookie.match(/(?:^|;\s*)cleanerId=([^;]+)/)
  if (match) {
    // cookieから復元できたらlocalStorageにも同期
    localStorage.setItem('cleanerId', match[1])
    return match[1]
  }
  return null
}
