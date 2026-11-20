import dns from 'dns/promises'
import net from 'net'

// 商品ページのURLから画像を取ってくるための部品（サーバー専用）。
//  - 社内のネットワークなどに向けて使われないよう、公開されているアドレス以外には接続しない（転送先も確かめる）
//  - 大きすぎるものは読まない・時間がかかりすぎたら止める

export const MAX_HTML = 1_000_000
export const MAX_IMAGE = 5 * 1024 * 1024
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

export const isPrivateIp = (ip: string): boolean => {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    if (l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb')) return true
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return m ? isPrivateIp(m[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

export async function assertPublic(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('http・https のアドレスだけ使えます')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('このアドレスは使えません')
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) throw new Error('このアドレスは使えません')
}

// 公開アドレスだけに接続する。転送（リダイレクト）先も、そのつど確かめる
export async function safeFetch(url: string, maxBytes: number, accept: string): Promise<{ res: Response; bytes: Uint8Array; finalUrl: string }> {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(current)
    await assertPublic(u)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 10000)
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', Accept: accept }, redirect: 'manual', signal: ctl.signal })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, u).toString(); continue }
      if (!res.ok || !res.body) throw new Error(`ページを開けませんでした（${res.status}）`)
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > maxBytes) { await reader.cancel(); if (maxBytes === MAX_IMAGE) throw new Error('画像が大きすぎます（5MBまで）'); break }
        chunks.push(value)
      }
      const bytes = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
      let off = 0
      for (const c of chunks) { bytes.set(c, off); off += c.length }
      return { res, bytes, finalUrl: u.toString() }
    } finally { clearTimeout(timer) }
  }
  throw new Error('転送が多すぎます')
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"')

// ページから、商品画像の候補を、確からしい順に集める（og:image → twitter:image → 構造化データの image）
export function imageCandidates(html: string, base: string): string[] {
  const out: string[] = []
  const add = (v: string | null | undefined) => {
    if (!v) return
    try { const u = new URL(decode(v.trim()), base).toString(); if (!out.includes(u)) out.push(u) } catch { /* 読めない候補は捨てる */ }
  }
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi)) add(m[1])
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/gi)) add(m[1])
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi)) add(m[1])
  const ld = html.match(/"image"\s*:\s*\[?\s*"([^"]+)"/)
  add(ld?.[1])
  return out.slice(0, 4)
}

