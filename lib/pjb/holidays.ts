// 大型連休（GW・お盆・シルバーウィーク・年末年始）の期間を年ごとに求める。
// 工期への影響を見るための目安で、各社の休業日とは一致しないことがある。

export type Break = { name: string; short: string; start: Date; end: Date }

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

// 秋分の日（1980〜2099年の近似式）
const autumnEquinox = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980)) - Math.floor((y - 1980) / 4)

function silverWeek(y: number): Break | null {
  // 敬老の日＝9月第3月曜。秋分の日との間が1日（国民の休日が入る）のときだけシルバーウィークとする
  const firstMonday = 1 + ((8 - d(y, 9, 1).getDay()) % 7)
  const keirou = firstMonday + 14
  const shubun = autumnEquinox(y)
  if (shubun - keirou > 2) return null
  return { name: 'シルバーウィーク', short: 'SW', start: d(y, 9, keirou - 2), end: d(y, 9, shubun) }
}

export function breaksForYear(y: number): Break[] {
  const list: Break[] = [
    { name: '年末年始', short: '年末年始', start: d(y - 1, 12, 29), end: d(y, 1, 3) },
    { name: 'ゴールデンウィーク', short: 'GW', start: d(y, 4, 29), end: d(y, 5, 5) },
    { name: 'お盆', short: 'お盆', start: d(y, 8, 13), end: d(y, 8, 16) },
    { name: '年末年始', short: '年末年始', start: d(y, 12, 29), end: d(y + 1, 1, 3) },
  ]
  const sw = silverWeek(y)
  if (sw) list.push(sw)
  return list
}

// 指定期間（両端含む）と重なる大型連休を返す
export function breakInRange(start: Date, end: Date): Break | null {
  const s = start.getTime(), e = end.getTime()
  for (const y of [start.getFullYear(), end.getFullYear()]) {
    for (const b of breaksForYear(y)) {
      if (b.start.getTime() <= e && b.end.getTime() >= s) return b
    }
  }
  return null
}

// 1週間（開始日wsから7日）と大型連休の重なりを、列の中の位置（0〜1）で返す
export function weekBreakInfo(ws: Date): { brk: Break; from: number; to: number } | null {
  const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6)
  const brk = breakInRange(ws, we)
  if (!brk) return null
  const day = 86400000
  const os = Math.max(brk.start.getTime(), ws.getTime())
  const oe = Math.min(brk.end.getTime(), we.getTime())
  return { brk, from: Math.round((os - ws.getTime()) / day) / 7, to: (Math.round((oe - ws.getTime()) / day) + 1) / 7 }
}

// 期間（両端含む）のうち、大型連休にあたる日数
export function breakDaysInRange(start: Date, end: Date): number {
  let n = 0
  for (let t = new Date(start.getFullYear(), start.getMonth(), start.getDate()); t <= end; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
    if (breakInRange(t, t)) n++
  }
  return n
}
