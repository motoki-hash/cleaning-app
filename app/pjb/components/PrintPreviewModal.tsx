'use client'

import { useEffect, useRef, useState } from 'react'
import { PAPER_W, PrintPreviewContext } from './FitToPage'

type View = 'fit' | 1 | 1.5

// 印刷／PDFになる用紙（A3横）を、画面いっぱいに大きく見るためのプレビュー。children は印刷用のシート
export default function PrintPreviewModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [view, setView] = useState<View>('fit')

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBoxW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fit = boxW > 0 ? Math.max(0.2, (boxW - 48) / PAPER_W) : 0.5
  const zoom = view === 'fit' ? fit : view

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-600 print:hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white">
        <div className="text-[14px] font-semibold">印刷プレビュー（A3横）</div>
        <div className="flex gap-0.5 rounded-lg bg-slate-700 p-0.5 text-[13px] ml-4">
          {([['fit', '画面に合わせる'], [1, '100%'], [1.5, '150%']] as const).map(([k, label]) => (
            <button key={String(k)} onClick={() => setView(k)}
              className={`px-3 py-1 rounded-md ${view === k ? 'bg-white text-slate-900 font-medium' : 'text-slate-200 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <span className="text-[12px] text-slate-300 hidden md:inline">{Math.round(zoom * 100)}%表示</span>
        <button onClick={() => window.print()} className="ml-auto text-[13.5px] px-3 py-1.5 rounded-lg bg-white text-slate-900 font-medium hover:bg-slate-100">印刷／PDF</button>
        <button onClick={onClose} className="text-[13.5px] px-3 py-1.5 rounded-lg border border-slate-500 text-slate-100 hover:bg-slate-700">閉じる</button>
      </div>
      <div ref={boxRef} className="flex-1 overflow-auto p-6">
        <div className="mx-auto" style={{ width: PAPER_W * zoom }}>
          <div style={{ zoom }}>
            <PrintPreviewContext.Provider value={true}>{children}</PrintPreviewContext.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}
