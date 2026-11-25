'use client'

// 納品物一覧：部屋ごとに、表紙＋区分ごとの品目カード（画像・メーカー・品番・サイズ/カラー・数量）を並べる。
// 「印刷／PDF」で、そのままPDFにして、投資家に渡せる。
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Shell from '../../../components/Shell'
import { supabase } from '@/lib/supabase'
import { periodName, periodLabelOf } from '@/lib/pjb/periods'
import { FFE_CATEGORIES, FFE_ROOM_COMMON, counted, type FfeItem } from '@/lib/pjb/ffe'
import type { ProjectStatus } from '@/lib/pjb/types'

type ProjectLite = { id: string; name: string; status: ProjectStatus; period_no: number | null; period_label: string | null }

const NONE = '__none'
const ALL = '__all'
const catRank = (c: string) => { const i = (FFE_CATEGORIES as readonly string[]).indexOf(c); return i < 0 ? 99 : i }
const roomOf = (it: FfeItem) => (it.room ?? '').trim()
const roomKey = (it: FfeItem) => roomOf(it) || NONE

export default function DeliverablesPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectLite | null>(null)
  const [items, setItems] = useState<FfeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [propertyName, setPropertyName] = useState('')
  const [address, setAddress] = useState('')
  const [hasCols, setHasCols] = useState(true)       // 表紙の列（SQLパッチ033）があるか
  const [sel, setSel] = useState<string>(ALL)

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('pjb_projects').select('id, name, status, period_no, period_label').eq('id', id).maybeSingle()
    if (!p) { setNotFound(true); setLoading(false); return }
    setProject(p as ProjectLite)
    const r = await supabase.from('pjb_ffe_items').select('*').eq('project_id', id).order('sort_order')
    setItems((r.data || []) as FfeItem[])
    const s = await supabase.from('pjb_ffe_settings').select('property_name, address').eq('project_id', id).maybeSingle()
    if (s.error) setHasCols(false)
    else { setHasCols(true); setPropertyName(s.data?.property_name ?? ''); setAddress(s.data?.address ?? '') }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const saveCover = async (patch: { property_name?: string; address?: string }) => {
    const { error } = await supabase.from('pjb_ffe_settings').upsert({ project_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    if (error) alert(`保存に失敗しました：${error.message}`)
  }

  const live = useMemo(() => items.filter(counted), [items])   // キャンセルは載せない
  const hasMaker = items.length === 0 || 'maker' in items[0]

  // 部屋の一覧（部屋名 → 共通 → 未設定 の順）
  const rooms = useMemo(() => {
    const names = Array.from(new Set(live.map(roomKey))).filter(k => k !== FFE_ROOM_COMMON && k !== NONE)
      .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
    const out = [...names]
    if (live.some(i => roomKey(i) === FFE_ROOM_COMMON)) out.push(FFE_ROOM_COMMON)
    if (live.some(i => roomKey(i) === NONE)) out.push(NONE)
    return out
  }, [live])

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (!project || loading) return <div className="p-8 text-center text-slate-400 text-[14px]">読み込み中…</div>

  const baseName = propertyName.trim() || periodName(project.name, periodLabelOf(project))
  const targets = sel === ALL ? rooms : rooms.filter(r => r === sel)
  const countOf = (r: string) => live.filter(i => roomKey(i) === r).length
  const labelOf = (r: string) => (r === NONE ? '部屋が未設定' : r)
  // 表紙の大きな題：物件名＋部屋（数字の部屋は続けて、それ以外は空けて）
  const coverTitle = (r: string) => (r === NONE ? baseName : /^\d/.test(r) ? `${baseName}${r}` : `${baseName} ${r}`)

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="ffe" wide>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .dv-page { break-after: page; page-break-after: always; }
          .dv-page:last-child { break-after: auto; page-break-after: auto; }
          .dv-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* 操作（印刷には出ない） */}
      <div className="print:hidden mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Link href={`/pjb/${id}/ffe`} className="text-[13px] text-blue-600 hover:underline">← FFE・OSE発注リスト</Link>
          <h1 className="text-[20px] font-bold text-slate-900 ml-2 mr-auto">納品物一覧（PDF）</h1>
          <button onClick={() => window.print()} disabled={targets.length === 0} className="text-[13.5px] px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">印刷／PDFにする</button>
        </div>

        {!hasCols && <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[13px] px-3 py-2">表紙の物件名・住所を保存するには、<code className="px-1 bg-white rounded">supabase-pj-budget-patch-033.sql</code> を Supabase で実行してください。</div>}
        {!hasMaker && <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[13px] px-3 py-2">メーカー・品番を使うには、<code className="px-1 bg-white rounded">supabase-pj-budget-patch-033.sql</code> を Supabase で実行してください。</div>}

        <div className="grid gap-3 sm:grid-cols-2 max-w-[900px]">
          <label className="text-[13px] text-slate-600">物件名（表紙の大きな題）
            <input value={propertyName} onChange={e => setPropertyName(e.target.value)} disabled={!hasCols}
              onBlur={() => hasCols && saveCover({ property_name: propertyName.trim() })} placeholder={`例）グランメール代々木（空欄なら「${periodName(project.name, periodLabelOf(project))}」）`}
              className="block mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-900 bg-white disabled:bg-slate-100" />
          </label>
          <label className="text-[13px] text-slate-600">住所（表紙）
            <input value={address} onChange={e => setAddress(e.target.value)} disabled={!hasCols}
              onBlur={() => hasCols && saveCover({ address: address.trim() })} placeholder="例）〒151-0053 東京都渋谷区代々木4丁目"
              className="block mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-900 bg-white disabled:bg-slate-100" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-slate-600 mr-1">対象</span>
          <button onClick={() => setSel(ALL)} className={`text-[13px] px-3 py-1.5 rounded-full border ${sel === ALL ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>すべてまとめて {live.length}</button>
          {rooms.map(r => (
            <button key={r} onClick={() => setSel(r)} className={`text-[13px] px-3 py-1.5 rounded-full border ${sel === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{labelOf(r)} {countOf(r)}</button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-slate-500">
          部屋ごとに表紙を付け、「共通」の品目は、共通だけの別ページにします。キャンセルの品目は載せません。印刷の画面では、用紙を「A4・横」、「背景のグラフィック」をオンにしてください。
        </p>
        {rooms.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white text-center text-[14px] text-slate-400 py-12">品目がありません</div>}
        {live.some(i => roomKey(i) === NONE) && (
          <p className="mt-1 text-[12.5px] text-amber-700">部屋が空欄の品目が {countOf(NONE)} 件あります。FFE・OSE発注リストの「部屋」に、部屋名か「共通」を入れてください。</p>
        )}
      </div>

      {/* 本体（画面でも、そのままプレビューになる） */}
      <div className="grid gap-6 print:gap-0">
        {targets.map(r => {
          const list = live.filter(i => roomKey(i) === r)
          const cats = Array.from(new Set(list.map(i => i.category))).sort((a, b) => catRank(a) - catRank(b))
          return (
            <div key={r} className="grid gap-6 print:gap-0">
              {/* 表紙 */}
              <section className="dv-page bg-white border border-slate-200 print:border-0 rounded-xl print:rounded-none px-12 py-20 min-h-[440px] print:min-h-[190mm] flex flex-col justify-center">
                <div className="text-[22px] text-slate-600">納品物一覧</div>
                <div className="mt-8 text-[44px] leading-tight font-bold text-slate-900">{coverTitle(r)}</div>
                <div className="mt-3 h-[3px] w-full max-w-[640px] bg-rose-400" />
                {address.trim() && <div className="mt-6 text-[18px] text-slate-700">住所：{address.trim()}</div>}
                {(r === FFE_ROOM_COMMON) && <div className="mt-2 text-[15px] text-slate-500">全部屋に共通の品目</div>}
              </section>

              {/* 区分ごとのページ */}
              {cats.map(c => (
                <section key={c} className="dv-page bg-white border border-slate-200 print:border-0 rounded-xl print:rounded-none px-6 py-6 print:px-2 print:py-2">
                  <div className="mb-3">
                    <div className="text-[24px] font-bold text-slate-900">{c}</div>
                    <div className="mt-1 h-[2px] w-72 bg-slate-800" />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-x-3 gap-y-4 print:gap-y-3">
                    {list.filter(i => i.category === c).sort((a, b) => a.sort_order - b.sort_order).map(it => <ItemCard key={it.id} it={it} showMaker={hasMaker} />)}
                  </div>
                </section>
              ))}
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] border-t border-slate-300 text-[12px] print:text-[9.5px] leading-snug">
      <div className="px-1.5 py-1 text-slate-600 border-r border-slate-300">{label}</div>
      <div className="px-1.5 py-1 text-slate-900 break-words">{value || ' '}</div>
    </div>
  )
}

function ItemCard({ it, showMaker }: { it: FfeItem; showMaker: boolean }) {
  const sizeColor = [it.spec, it.color].map(s => s.trim()).filter(Boolean).join(' / ')
  return (
    <div className="dv-card border border-slate-300 bg-white overflow-hidden">
      <div className="bg-slate-100 px-2 py-1.5 text-[13px] print:text-[10.5px] font-semibold text-slate-900 leading-snug min-h-[2.4em]">{it.name}</div>
      <div className="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden border-t border-slate-300">
        {it.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={it.image_url} alt={it.name} loading="eager" className="max-w-full max-h-full object-contain" />
          : <span className="text-[11px] text-slate-300">画像なし</span>}
      </div>
      {showMaker && <Row label="メーカー" value={it.maker ?? ''} />}
      {showMaker && <Row label="品番" value={it.model_no ?? ''} />}
      <Row label="サイズ・カラー" value={sizeColor} />
      <Row label="数量" value={String(it.qty)} />
    </div>
  )
}
