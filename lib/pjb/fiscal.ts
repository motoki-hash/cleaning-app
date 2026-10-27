// 年度（4月始まり）の計算。2026年度 = 2026年4月〜2027年3月
export const FY_MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月']

// 日付（'YYYY-MM-DD'）が、どの年度か
export function fiscalYearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const [y, m] = dateStr.split('-').map(Number)
  if (!y || !m) return null
  return m >= 4 ? y : y - 1
}

// 年度の中で何番目の月か（4月=1 … 3月=12）
export function fiscalMonthIndex(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = Number(dateStr.split('-')[1])
  if (!m) return null
  return m >= 4 ? m - 3 : m + 9
}

// 今日が、どの年度の何番目の月か
export function currentFiscal(now = new Date()): { year: number; month: number } {
  const m = now.getMonth() + 1
  return { year: m >= 4 ? now.getFullYear() : now.getFullYear() - 1, month: m >= 4 ? m - 3 : m + 9 }
}

// 「2026-10」形式の入力（month input）を、保存用の「2026-10-01」にする
export const monthInputToDate = (v: string) => (v ? `${v}-01` : null)
export const dateToMonthInput = (d: string | null | undefined) => (d ? d.slice(0, 7) : '')
