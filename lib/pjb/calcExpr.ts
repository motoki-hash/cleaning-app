// 金額の入力欄で、スプレッドシートのように計算式を入れられるようにするための、安全な計算機。
// 使える書き方：数字・+ − × ÷ * / ( ) ・ % ・ 万 億 千（例：150万+30万 / 1200000*1.1 / (500+300)*1.1 / 1億2000万）
// 先頭の「=」は、あってもなくても構いません。eval は使わず、文字を1つずつ読んで計算します。

const FULL_TO_HALF: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '＋': '+', '－': '-', '−': '-', 'ー': '-', '×': '*', '＊': '*', 'x': '*', 'X': '*', '÷': '/', '／': '/',
  '（': '(', '）': ')', '．': '.', '％': '%', '＝': '=', '，': ',', '、': ',',
}

export function normalizeExpr(input: string): string {
  return input
    .split('')
    .map(ch => FULL_TO_HALF[ch] ?? ch)
    .join('')
    .replace(/[\s¥￥円,]/g, '')
    .replace(/^=/, '')
}

// 数字とカンマだけ（と、先頭のマイナス）なら、計算式ではなく、ふつうの数字として扱う
export const isPlainNumber = (normalized: string, allowNegative = false) =>
  (allowNegative ? /^-?\d*$/ : /^\d*$/).test(normalized)

const UNITS: Record<string, number> = { '千': 1e3, '万': 1e4, '億': 1e8 }

export function evaluateExpr(input: string): number | null {
  // 途中まで打った式（末尾が演算子）でも、そこまでの結果を出す
  const src = normalizeExpr(input).replace(/[+\-*/]+$/, '')
  if (src === '') return null
  let pos = 0
  const peek = () => src[pos]

  // 数字の塊：1億2000万 のように、単位つきの数字が続くときは足し合わせる
  const literal = (): number | null => {
    let total = 0
    let read = false
    for (;;) {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(pos))
      if (!m) break
      pos += m[0].length
      read = true
      const unit = UNITS[src[pos]]
      if (unit) { total += parseFloat(m[0]) * unit; pos++ } else { total += parseFloat(m[0]); break }
    }
    return read ? total : null
  }

  const primary = (): number | null => {
    if (peek() === '(') {
      pos++
      const v = expr()
      if (v === null || peek() !== ')') return null
      pos++
      return v
    }
    return literal()
  }
  const factor = (): number | null => {
    let sign = 1
    while (peek() === '-' || peek() === '+') { if (peek() === '-') sign = -sign; pos++ }
    let v = primary()
    if (v === null) return null
    while (peek() === '%') { v /= 100; pos++ }
    return sign * v
  }
  const term = (): number | null => {
    let v = factor()
    if (v === null) return null
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++]
      const r = factor()
      if (r === null) return null
      if (op === '*') v *= r
      else { if (r === 0) return null; v /= r }
    }
    return v
  }
  const expr = (): number | null => {
    let v = term()
    if (v === null) return null
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++]
      const r = term()
      if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  const result = expr()
  if (result === null || pos !== src.length || !isFinite(result)) return null
  return result
}
