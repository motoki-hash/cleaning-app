'use client'

import { useEffect, useRef, useState } from 'react'
import { BAR_COLORS } from '@/lib/pjb/schedule'

export type GanttBar = { id: string; rowId: string; start: number; len: number; label: string; color: string }
export type GanttRow = { id: string; left: React.ReactNode[] }
export type GanttCol = { top: string; sub?: string; shade?: 'sat' | 'sun' | 'open' | 'break'; note?: string; tag?: string; partial?: [number, number] }

type Props = {
  leftCols: { label: string; width: number }[]
  rows: GanttRow[]
  cols: GanttCol[]
  groups: { label: string; sub?: string; span: number }[]
  bars: GanttBar[]
  minCw: number   // 1マスの最小幅(px)。画面に余裕があれば自動で広げる
  onBarChange: (id: string, start: number, len: number) => void
  onBarClick: (id: string) => void        // バーを1回クリック＝選択（コピー・削除の対象）
  onBarOpen: (id: string) => void         // バーをダブルクリック＝内容を編集
  selectedBarId?: string | null
  selectedCell?: { rowId: string; col: number } | null   // 空きマスを1回クリック＝選択（貼り付け先）
  onSelectCell: (rowId: string, col: number) => void
  onBarCopy: (id: string, start: number, len: number) => void   // Alt(Option)を押しながらドラッグで複製
  onCreate: (rowId: string, start: number, len: number) => void
  onRowClick: (rowId: string) => void
  onReorder: (rowId: string, toIndex: number) => void
  onRowDelete: (rowId: string) => void
}

const ROW_H = 40
const GROUP_H = 40
const COL_H = 48
const HEAD_H = GROUP_H + COL_H
const HANDLE_W = 24
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// 週/日を1マスとした簡易ガントチャート。バーはドラッグで移動・両端でリサイズ、空きマスのドラッグで新規作成。
export default function Gantt({ leftCols, rows, cols, groups, bars, minCw, onBarChange, onBarClick, onBarOpen, selectedBarId, selectedCell, onSelectCell, onBarCopy, onCreate, onRowClick, onReorder, onRowDelete }: Props) {
  const [drag, setDrag] = useState<{ id: string; start: number; len: number; copy: boolean } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 })
  // 同じ場所を350ミリ秒以内に2回クリックしたら、ダブルクリックとみなす
  const isDouble = (key: string) => {
    const now = Date.now()
    const dbl = lastClick.current.key === key && now - lastClick.current.t < 350
    lastClick.current = dbl ? { key: '', t: 0 } : { key, t: now }
    return dbl
  }
  const [rowDrag, setRowDrag] = useState<{ id: string; from: number; to: number } | null>(null)
  const [creating, setCreating] = useState<{ rowId: string; a: number; b: number } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const leftW = HANDLE_W + leftCols.reduce((s, c) => s + c.width, 0)
  // 画面幅に余裕があるときは、マスの幅を広げて表をいっぱいに使う（足りないときは横スクロール）
  const cw = Math.max(minCw, avail > 0 ? Math.floor((avail - leftW - 2) / cols.length) : minCw)
  const compact = cw < 34
  const trackW = cols.length * cw
  const lines = `repeating-linear-gradient(to right, transparent 0, transparent ${cw - 1}px, #e2e8f0 ${cw - 1}px, #e2e8f0 ${cw}px)`

  const startBarDrag = (e: React.PointerEvent, bar: GanttBar, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    const copy = e.altKey && mode === 'move'
    const rect = rowsRef.current?.getBoundingClientRect()
    const fromRow = rows.findIndex(r => r.id === bar.rowId)
    let moved = false
    // バーの移動は、最初に動いた方向で「横（日付の移動）」か「縦（行の入れ替え）」かが決まる
    let axis: 'h' | 'v' | null = mode === 'move' ? null : 'h'
    let toRow = fromRow
    let cur = { start: bar.start, len: bar.len }
    const onMove = (ev: PointerEvent) => {
      const rawDx = ev.clientX - x0
      const rawDy = ev.clientY - y0
      if (!axis && (Math.abs(rawDx) > 5 || Math.abs(rawDy) > 5)) axis = !copy && Math.abs(rawDy) > Math.abs(rawDx) && rect ? 'v' : 'h'
      if (axis === 'v' && rect) {
        moved = true
        toRow = clamp(Math.floor((ev.clientY - rect.top) / ROW_H), 0, rows.length - 1)
        setRowDrag({ id: bar.rowId, from: fromRow, to: toRow })
        return
      }
      if (Math.abs(rawDx) > 3) moved = true
      const dx = Math.round(rawDx / cw)
      let s = bar.start, l = bar.len
      if (mode === 'move') s = clamp(bar.start + dx, 0, cols.length - bar.len)
      else if (mode === 'r') l = clamp(bar.len + dx, 1, cols.length - bar.start)
      else { s = clamp(bar.start + dx, 0, bar.start + bar.len - 1); l = bar.len - (s - bar.start) }
      cur = { start: s, len: l }
      if (moved) setDrag({ id: bar.id, ...cur, copy })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrag(null)
      setRowDrag(null)
      if (axis === 'v') { if (toRow !== fromRow) onReorder(bar.rowId, toRow); return }
      if (!moved) { if (isDouble(`bar:${bar.id}`)) onBarOpen(bar.id); else onBarClick(bar.id) }
      else if (cur.start !== bar.start || cur.len !== bar.len) (copy ? onBarCopy : onBarChange)(bar.id, cur.start, cur.len)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 行の並べ替え：左端のつまみを掴んで上下にドラッグ
  const startRowDrag = (e: React.PointerEvent, rowId: string, from: number) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = rowsRef.current?.getBoundingClientRect()
    if (!rect) return
    let to = from
    setRowDrag({ id: rowId, from, to })
    const onMove = (ev: PointerEvent) => {
      to = clamp(Math.floor((ev.clientY - rect.top) / ROW_H), 0, rows.length - 1)
      setRowDrag({ id: rowId, from, to })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setRowDrag(null)
      if (to !== from) onReorder(rowId, to)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startCreate = (e: React.PointerEvent<HTMLDivElement>, rowId: string) => {
    if (e.target !== e.currentTarget || e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const idxAt = (x: number) => clamp(Math.floor((x - rect.left) / cw), 0, cols.length - 1)
    const a = idxAt(e.clientX)
    let b = a
    setCreating({ rowId, a, b })
    const onMove = (ev: PointerEvent) => { b = idxAt(ev.clientX); setCreating({ rowId, a, b }) }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setCreating(null)
      if (a !== b) { onCreate(rowId, Math.min(a, b), Math.abs(b - a) + 1); return }
      // ドラッグしないでクリックしたとき：1回＝マスを選択（貼り付け先）、ダブルクリック＝その場所に新しいバーを作る
      if (isDouble(`cell:${rowId}:${a}`)) onCreate(rowId, a, 1)
      else onSelectCell(rowId, a)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={wrapRef} className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm print:overflow-visible print:shadow-none">
      <div className="relative" style={{ width: leftW + trackW, minWidth: '100%' }}>
        {/* ヘッダー */}
        <div className="flex sticky top-0 z-20">
          <div className="sticky left-0 z-30 flex bg-slate-700 text-white text-[12.5px] font-semibold" style={{ width: leftW, height: HEAD_H }}>
            <div style={{ width: HANDLE_W }} />
            {leftCols.map(c => (
              <div key={c.label} className="flex items-end px-2 pb-1.5 truncate" style={{ width: c.width }}>{c.label}</div>
            ))}
          </div>
          <div style={{ width: trackW }}>
            <div className="flex bg-slate-700 text-white text-[13px] font-semibold" style={{ height: GROUP_H }}>
              {groups.map((g, i) => (
                <div key={i} className="flex flex-col items-center justify-center border-l border-slate-500 leading-tight overflow-hidden whitespace-nowrap" style={{ width: g.span * cw }}>
                  <span>{g.label}</span>
                  {g.sub && <span className="text-[10.5px] font-medium text-slate-300">{g.sub}</span>}
                </div>
              ))}
            </div>
            <div className="flex bg-slate-100 text-slate-600 text-[11.5px]" style={{ height: COL_H }}>
              {cols.map((c, i) => (
                <div
                  key={i}
                  title={c.note}
                  className={`relative flex flex-col items-center justify-center border-l border-slate-200 leading-tight ${
                    c.shade === 'open' ? 'bg-cyan-300 text-cyan-950 font-bold' : c.shade === 'break' ? `${c.partial ? '' : 'bg-amber-200'} text-amber-900 font-semibold` : c.shade === 'sat' ? 'bg-sky-100 text-sky-700' : c.shade === 'sun' ? 'bg-rose-100 text-rose-700' : ''
                  }`}
                  style={{ width: cw }}
                >
                  {c.partial && c.shade === 'break' && (
                    <span className="absolute top-0 bottom-0 bg-amber-200" style={{ left: `${c.partial[0] * 100}%`, width: `${(c.partial[1] - c.partial[0]) * 100}%` }} />
                  )}
                  <span className={`relative ${compact ? 'text-[10px]' : ''}`}>{c.top}</span>
                  {c.sub && !(compact && c.sub.startsWith('(')) && <span className={`relative ${compact ? 'text-[8.5px]' : 'text-[10px]'} whitespace-nowrap opacity-80`}>{c.sub}</span>}
                  {c.tag && <span className="relative text-[8.5px] whitespace-nowrap font-semibold text-amber-800">{c.tag}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 背景（土日・OPEN日・月の区切り） */}
        <div className="absolute pointer-events-none" style={{ left: leftW, top: HEAD_H, bottom: 0, width: trackW }}>
          {cols.map((c, i) => c.shade && (
            <div
              key={i}
              className={`absolute top-0 bottom-0 ${c.shade === 'open' ? 'bg-cyan-200/70' : c.shade === 'break' ? 'bg-amber-100' : c.shade === 'sat' ? 'bg-sky-50' : 'bg-rose-50'}`}
              style={c.partial && c.shade === 'break'
                ? { left: i * cw + c.partial[0] * cw, width: (c.partial[1] - c.partial[0]) * cw }
                : { left: i * cw, width: cw }}
            />
          ))}
          {(() => {
            let acc = 0
            return groups.slice(0, -1).map((g, i) => {
              acc += g.span
              return <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: acc * cw }} />
            })
          })()}
        </div>

        {/* 行 */}
        <div ref={rowsRef} className="relative">
        {rowDrag && rowDrag.to !== rowDrag.from && (
          <div className="absolute left-0 right-0 z-30 h-0.5 bg-blue-500 pointer-events-none" style={{ top: (rowDrag.to > rowDrag.from ? rowDrag.to + 1 : rowDrag.to) * ROW_H - 1 }} />
        )}
        {rows.map((row, ri) => {
          const rowBars = bars.filter(b => b.rowId === row.id)
          return (
            <div key={row.id} className={`flex border-b border-slate-200 last:border-0 ${rowDrag?.id === row.id ? 'opacity-40' : ''}`} style={{ height: ROW_H }}>
              <div
                className="group relative sticky left-0 z-10 flex items-center bg-white text-[13px] cursor-pointer hover:bg-blue-50"
                style={{ width: leftW }}
                onClick={() => onRowClick(row.id)}
              >
                <div
                  onPointerDown={e => startRowDrag(e, row.id, ri)}
                  onClick={e => e.stopPropagation()}
                  title="ドラッグして行を並べ替え"
                  className="flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing select-none"
                  style={{ width: HANDLE_W, height: '100%', touchAction: 'none' }}
                >
                  ⋮⋮
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onRowDelete(row.id) }}
                  onPointerDown={e => e.stopPropagation()}
                  title="この行を削除"
                  aria-label="この行を削除"
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded text-[13px] leading-none text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-40 print:hidden"
                >
                  ×
                </button>
                {row.left.map((cell, i) => (
                  <div key={i} className={`px-2 truncate ${i === leftCols.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-600'}`} style={{ width: leftCols[i].width }}>{cell}</div>
                ))}
              </div>
              <div
                className="relative cursor-crosshair"
                style={{ width: trackW, backgroundImage: lines }}
                onPointerDown={e => startCreate(e, row.id)}
              >
                {selectedCell && selectedCell.rowId === row.id && !creating && (
                  <div className="absolute top-0 bottom-0 border-2 border-slate-700 pointer-events-none z-[3]" style={{ left: selectedCell.col * cw, width: cw }} />
                )}
                {creating && creating.rowId === row.id && (
                  <div className="absolute top-1.5 bottom-1.5 rounded bg-blue-300/60 border border-blue-500 pointer-events-none"
                    style={{ left: Math.min(creating.a, creating.b) * cw, width: (Math.abs(creating.b - creating.a) + 1) * cw }} />
                )}
                {rowBars.map(b => {
                  const cur = drag && drag.id === b.id ? { start: drag.start, len: drag.len } : { start: b.start, len: b.len }
                  const w = cur.len * cw
                  const color = BAR_COLORS[b.color]?.cls || BAR_COLORS.gray.cls
                  // 同じ行の次のバーにぶつからない範囲までラベルを表示する（超える分は…で省略）
                  const next = rowBars.filter(o => o.id !== b.id && o.start >= cur.start + cur.len).sort((x, y) => x.start - y.start)[0]
                  const maxLabel = next ? (next.start - cur.start) * cw - 10 : undefined
                  const isCopying = !!drag && drag.id === b.id && drag.copy
                  return (
                    <div key={b.id}>
                    {isCopying && (
                      <div className={`absolute top-1.5 bottom-1.5 rounded-md ${color} opacity-60`} style={{ left: b.start * cw, width: b.len * cw }} />
                    )}
                    <div className="absolute top-1.5 bottom-1.5" style={{ left: cur.start * cw, width: w, touchAction: 'none' }}>
                      <div
                        onPointerDown={e => startBarDrag(e, b, 'move')}
                        className={`h-full rounded-md ${color} ${selectedBarId === b.id ? 'ring-2 ring-slate-800' : ''} shadow-sm cursor-grab active:cursor-grabbing flex items-center px-1.5 text-[12px] font-medium whitespace-nowrap`}
                        title={b.label}
                      >
                        {/* バーより長いラベルは右側の空きマスにはみ出して表示する */}
                        <span className="pointer-events-none relative z-[1] block shrink-0 overflow-hidden text-ellipsis" style={{ maxWidth: maxLabel }}>{b.label}</span>
                      </div>
                      <div onPointerDown={e => startBarDrag(e, b, 'l')} className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" />
                      <div onPointerDown={e => startBarDrag(e, b, 'r')} className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" />
                    </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        </div>
        {rows.length === 0 && <div style={{ height: ROW_H }} />}
      </div>
    </div>
  )
}
