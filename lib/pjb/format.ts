export function formatYen(amount: number | null | undefined): string {
  const v = Math.round(amount ?? 0)
  const sign = v < 0 ? '-' : ''
  return `${sign}¥${Math.abs(v).toLocaleString('ja-JP')}`
}

export function formatSignedYen(amount: number | null | undefined): string {
  const v = Math.round(amount ?? 0)
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sign}¥${Math.abs(v).toLocaleString('ja-JP')}`
}

export function formatPercent(rate: number | null | undefined, digits = 0): string {
  if (rate === null || rate === undefined || !isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(digits)}%`
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '未定'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '未定'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const target = new Date(d)
  if (isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
