'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// A3横（余白10mm）の印字可能な大きさ（96dpi換算）。幅は1512px、高さは1047px（少し余裕を見る）
const PAGE_W = 1512
const PAGE_H = 1020

// 画面では見えない位置に置いて高さを測り、印刷時は縮尺（CSS zoom）をかけて必ず1ページに収める。
export default function FitToPage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (window.matchMedia('print').matches) return   // 印刷中は縮尺の影響を受けるので測り直さない
      const h = el.scrollHeight
      setScale(h > PAGE_H ? Math.max(0.3, PAGE_H / h) : 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // フォントなどの読み込み後に測り直す
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current
      if (el && !window.matchMedia('print').matches) setScale(el.scrollHeight > PAGE_H ? Math.max(0.3, PAGE_H / el.scrollHeight) : 1)
    }, 400)
    return () => clearTimeout(t)
  }, [children])

  return (
    <div
      aria-hidden
      className="absolute -left-[9999px] top-0 invisible print:static print:visible print:!w-full"
      style={{ width: PAGE_W }}
    >
      <div
        ref={ref}
        className="text-slate-900 print:[zoom:var(--fit-zoom)]"
        style={{ ['--fit-zoom' as string]: String(scale) }}
      >
        <style>{`@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
        {children}
      </div>
    </div>
  )
}
