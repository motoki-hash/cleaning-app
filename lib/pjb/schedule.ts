import type { ScheduleKind } from './types'
import { breakDaysInRange } from './holidays'

// バーの色（ゼロ工程表の色分けに合わせる）
export const BAR_COLORS: Record<string, { label: string; cls: string; swatch: string }> = {
  blue:      { label: '企画・設計・契約', cls: 'bg-sky-200 text-sky-950',         swatch: 'bg-sky-200' },
  green:     { label: '工事',             cls: 'bg-emerald-200 text-emerald-950', swatch: 'bg-emerald-200' },
  darkgreen: { label: '是正',             cls: 'bg-emerald-400 text-emerald-950', swatch: 'bg-emerald-400' },
  pink:      { label: 'OPEN準備',         cls: 'bg-rose-200 text-rose-950',       swatch: 'bg-rose-200' },
  red:       { label: '内覧・検査',       cls: 'bg-rose-400 text-rose-950',       swatch: 'bg-rose-400' },
  orange:    { label: 'マイルストーン',   cls: 'bg-amber-400 text-amber-950',     swatch: 'bg-amber-400' },
  gray:      { label: 'その他',           cls: 'bg-slate-300 text-slate-900',     swatch: 'bg-slate-300' },
}

export const CATEGORY_COLOR: Record<string, string> = {
  '企画・設計': 'blue', '予算・契約': 'blue', '工事': 'green', '是正': 'darkgreen',
  'OPEN準備': 'pink', '検査': 'red', '搬入': 'pink', '撮影': 'pink', '営業': 'pink', '運営': 'pink', 'インフラ': 'blue', '清掃': 'pink',
}
export const CATEGORY_OPTIONS = ['企画・設計', '予算・契約', '工事', 'OPEN準備', 'インフラ', '搬入', '検査', '清掃', '運営', '撮影', '営業', '是正', 'OPEN']
export const colorForCategory = (c: string) => CATEGORY_COLOR[c] || 'gray'

export const WEEKS_PER_MONTH = 4
export const ROUGH_MONTHS = 12
export const DEFAULT_MONTHS = 12
export const MONTH_OPTIONS = [6, 9, 12, 15, 18, 21, 24, 30, 36]
export const DEFAULT_OPEN_WEEK = 46

type TemplateBar = { start: number; len: number; label: string; color: string }
export type RoughTemplateTask = { category: string; name: string; bars: TemplateBar[] }

// ゼロ工程表_雛形（概算スケジュール）の初期データ。start は 0 始まりの週番号（1ヶ月=4週）
export const ROUGH_TEMPLATE: RoughTemplateTask[] = [
  { category: '企画・設計', name: 'デザイン', bars: [
    { start: 0, len: 6, label: 'デザイン期間（パース作成・サンプル取り寄せ）', color: 'blue' },
    { start: 6, len: 1, label: 'パース提出', color: 'orange' },
  ] },
  { category: '企画・設計', name: '実施図・施工図', bars: [
    { start: 6, len: 3, label: '施工図面作成期間', color: 'blue' },
    { start: 21, len: 2, label: '解体後図面修正期間', color: 'blue' },
  ] },
  { category: '企画・設計', name: '施工店 現場調査', bars: [{ start: 8, len: 1, label: '施工店現場調査', color: 'blue' }] },
  { category: '予算・契約', name: '工事見積', bars: [{ start: 9, len: 2, label: '施工店見積り期間', color: 'blue' }] },
  { category: '予算・契約', name: 'VE・見積修正', bars: [{ start: 11, len: 3, label: 'VE期間・見積修正', color: 'blue' }] },
  { category: '企画・設計', name: 'VE後 図面・パース修正', bars: [{ start: 12, len: 2, label: 'VE後パース修正', color: 'blue' }] },
  { category: '予算・契約', name: '工事契約', bars: [
    { start: 10, len: 4, label: '工事契約ドラフトチェック期間', color: 'blue' },
    { start: 14, len: 1, label: '工事契約期間', color: 'blue' },
  ] },
  { category: '工事', name: '解体工事', bars: [{ start: 15, len: 4, label: '解体工事', color: 'green' }] },
  { category: '工事', name: '内装工事', bars: [
    { start: 19, len: 20, label: '内装工事 工事期間', color: 'green' },
    { start: 39, len: 2, label: '是正期間', color: 'darkgreen' },
  ] },
  { category: '工事', name: '外構・共用部工事', bars: [
    { start: 29, len: 10, label: 'ファサード・共用部工事', color: 'green' },
    { start: 39, len: 2, label: '是正期間', color: 'darkgreen' },
  ] },
  { category: 'OPEN準備', name: 'FFE・備品 搬入設置', bars: [{ start: 41, len: 1, label: '搬入設置', color: 'pink' }] },
  { category: 'OPEN準備', name: '運営準備', bars: [{ start: 42, len: 2, label: '運営準備', color: 'pink' }] },
  { category: 'OPEN準備', name: '写真撮影', bars: [{ start: 44, len: 1, label: '撮影期間', color: 'pink' }] },
  { category: 'OPEN準備', name: '内覧・最終確認', bars: [{ start: 45, len: 1, label: '内覧期間', color: 'red' }] },
]

// OPEN前スケジュールの初期タスク（バーは日付を入れてから自分で配置する）
export const PREOPEN_TEMPLATE: Array<{ category: string; name: string; assignee: string }> = [
  { category: 'インフラ', name: 'ネット開通', assignee: 'BNS' },
  { category: 'インフラ', name: 'ガス開通', assignee: 'BNS' },
  { category: '搬入', name: 'FFE備品搬入・設置', assignee: 'BNS / 業者' },
  { category: '搬入', name: 'リネン・運営備品搬入', assignee: 'HSP' },
  { category: '検査', name: '竣工検査（設計・施工店・BNS）', assignee: 'BNS' },
  { category: '清掃', name: '竣工清掃', assignee: 'BNS' },
  { category: '運営', name: 'HSP運営準備', assignee: 'HSP' },
  { category: '撮影', name: '撮影', assignee: 'BNS' },
  { category: '営業', name: '内覧会', assignee: 'BNS' },
  { category: '是正', name: '内装是正', assignee: '施工店' },
  { category: '検査', name: '社内検査', assignee: 'BNS' },
  { category: '是正', name: '最終是正・残工事', assignee: '施工店' },
  { category: '運営', name: 'OPEN判定・最終確認', assignee: 'BNS / HSP' },
  { category: 'OPEN', name: 'OPEN', assignee: 'ALL' },
]

// ---- 日付ヘルパー（ローカル日付として扱う）----
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

export const kindLabel: Record<ScheduleKind, string> = { zero: 'ゼロ工程表', rough: '概算スケジュール', preopen: 'OPEN前スケジュール' }

// ゼロ工程表: 日付・祝日を考慮せず、1ヶ月＝4週×12ヶ月の固定グリッド
export const zeroCols = (months: number) => months * WEEKS_PER_MONTH
export const zeroWeekLabel = (i: number) => `${Math.floor(i / WEEKS_PER_MONTH) + 1}ヶ月目 第${(i % WEEKS_PER_MONTH) + 1}週`

// ---- 概算スケジュールの週（日曜始まりのカレンダー週を切れ目なく並べる）----
// 1列目＝基準日の月に属する最初の週。週は「木曜日がある月」に属する（ISOと同じ考え方）。
export function roughFirstWeekStart(base: Date): Date {
  const first = new Date(base.getFullYear(), base.getMonth(), 1)
  const toThursday = (4 - first.getDay() + 7) % 7
  return new Date(first.getFullYear(), first.getMonth(), 1 + toThursday - 4)
}
export const roughWeekStart = (base: Date, idx: number) => addDays(roughFirstWeekStart(base), idx * 7)
export const roughWeekRange = (base: Date, idx: number): [Date, Date] => {
  const s = roughWeekStart(base, idx)
  return [s, addDays(s, 6)]
}
export const fmtMd = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

export type RoughGroup = { n: number; month: number; year: number; span: number; start: number }
// 基準日の月から数えて months ヶ月分の週を、木曜日がある月ごとにまとめる
export function roughGroups(base: Date, months: number = DEFAULT_MONTHS): RoughGroup[] {
  const groups: RoughGroup[] = []
  for (let i = 0; ; i++) {
    const thu = addDays(roughWeekStart(base, i), 4)
    const monthIdx = (thu.getFullYear() - base.getFullYear()) * 12 + thu.getMonth() - base.getMonth()
    if (monthIdx >= months) break
    const last = groups[groups.length - 1]
    if (last && last.year === thu.getFullYear() && last.month === thu.getMonth()) last.span++
    else groups.push({ n: groups.length + 1, month: thu.getMonth(), year: thu.getFullYear(), span: 1, start: i })
  }
  return groups
}
export const roughCols = (base: Date, months: number) => roughGroups(base, months).reduce((s, g) => s + g.span, 0)

// 各列が「その月の何週目か」（1始まり）
export function roughWeekNumbers(base: Date, months: number = DEFAULT_MONTHS): number[] {
  const nums: number[] = []
  for (const g of roughGroups(base, months)) for (let k = 0; k < g.span; k++) nums.push(k + 1)
  return nums
}
export const fmtYmdJp = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`

// ---- バーのラベルに、期間（○週間／○ヶ月／○日間）を自動で付ける ----
const DURATION_SUFFIX = /\s*[：:]\s*[\d.]+\s*(?:ヶ月|ヵ月|か月|カ月|ケ月|週間|週|日間|日)\s*$/
export const stripDuration = (label: string) => label.replace(DURATION_SUFFIX, '').trim()

// perMonth: 1ヶ月あたりの週数。ゼロ工程表は 4週、概算スケジュール（暦の週）は 約4.34週
export const WEEKS_PER_MONTH_ZERO = 4
export const WEEKS_PER_MONTH_CALENDAR = 365 / 12 / 7

export function durationText(units: number, unit: 'week' | 'day', perMonth: number = WEEKS_PER_MONTH_ZERO): string {
  if (unit === 'day') return units % 7 === 0 ? `${units / 7}週間` : `${units}日間`
  // 4週以上は「ヶ月」で表す（0.5ヶ月刻みに丸める）。4週未満は「N週間」
  if (units >= 4) {
    const months = Math.max(0.5, Math.round((units / perMonth) * 2) / 2)
    return `${months}ヶ月`
  }
  const w = Math.round(units * 2) / 2
  return `${w}週間`
}

// 画面・PDFに表示する文字。マイルストーン（オレンジ）のバーには期間を付けない。
export function barText(label: string, color: string, units: number, unit: 'week' | 'day', perMonth: number = WEEKS_PER_MONTH_ZERO): string {
  const base = stripDuration(label)
  if (color === 'orange') return base
  if (units <= 0) return base
  const dur = durationText(units, unit, perMonth)
  return base ? `${base}：${dur}` : dur
}

// 大型連休（GW・お盆・シルバーウィーク・年末年始）の日数を除いた、バーの実質の長さ
export function roughBarWeeksExcludingBreaks(base: Date, startWeek: number, lengthWeeks: number): number {
  const from = roughWeekStart(base, startWeek)
  const to = addDays(roughWeekStart(base, startWeek + lengthWeeks), -1)
  return Math.max(0, (lengthWeeks * 7 - breakDaysInRange(from, to)) / 7)
}
export function daysExcludingBreaks(start: Date, end: Date): number {
  return Math.max(0, diffDays(start, end) + 1 - breakDaysInRange(start, end))
}
