'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Shell from '../../components/Shell'
import { supabase } from '@/lib/supabase'
import { formatYen } from '@/lib/pjb/format'
import { periodName, periodLabelOf } from '@/lib/pjb/periods'
import { isCommitEnter } from '../../components/ui'
import {
  FFE_CATEGORIES, FFE_STATUSES, FFE_ORDERERS, blankItem, counted, lineIncl, exclOf, sumItems, summarize, warningsFor, investorView,
  internalCsv, investorCsv, downloadText,
  type FfeItem, type FfeSettings, type InvestorMode,
} from '@/lib/pjb/ffe'
import { ImportDialog, CopyDialog } from './FfeDialogs'
import type { ProjectStatus } from '@/lib/pjb/types'

type ProjectLite = { id: string; name: string; status: ProjectStatus; period_no: number | null; period_label: string | null }
type NewItem = Omit<FfeItem, 'id' | 'project_id' | 'sort_order'>

const STATUS_CLS: Record<string, string> = {
  '未選定': 'bg-slate-100 text-slate-600', '選定済': 'bg-sky-100 text-sky-800', '発注済': 'bg-amber-100 text-amber-800',
  '納品済': 'bg-emerald-100 text-emerald-800', '保留': 'bg-violet-100 text-violet-800', 'キャンセル': 'bg-rose-100 text-rose-700',
}
const INPUT = 'w-full bg-transparent px-1.5 py-1 text-[13px] rounded border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white outline-none'

// ---- 入力セル（入力が終わったとき＝フォーカスが外れたときに保存する）----
function Txt({ value, onCommit, list, placeholder, className = '' }: { value: string; onCommit: (v: string) => void; list?: string; placeholder?: string; className?: string }) {
  return (
    <input
      key={value} defaultValue={value} list={list} placeholder={placeholder}
      onBlur={e => { if (e.target.value !== value) onCommit(e.target.value) }}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
      className={`${INPUT} ${className}`}
    />
  )
}
function Num({ value, onCommit, money }: { value: number; onCommit: (v: number) => void; money?: boolean }) {
  return (
    <input
      key={value} defaultValue={money ? Number(value).toLocaleString('ja-JP') : String(value)} inputMode="decimal"
      onFocus={e => e.target.select()}
      onBlur={e => {
        const n = Number(e.target.value.replace(/[¥￥,\s]/g, ''))
        if (!isFinite(n)) { e.target.value = money ? Number(value).toLocaleString('ja-JP') : String(value); return }
        if (n !== Number(value)) onCommit(n)
        else e.target.value = money ? n.toLocaleString('ja-JP') : String(n)
      }}
      onKeyDown={e => { if (isCommitEnter(e)) (e.target as HTMLInputElement).blur() }}
      className={`${INPUT} text-right tabular-nums`}
    />
  )
}
function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  return <input type="date" key={value ?? ''} defaultValue={value ?? ''} onBlur={e => { if ((e.target.value || null) !== value) onCommit(e.target.value || null) }} className={`${INPUT} text-[12.5px]`} />
}

const COLS_ALL: Array<{ k: string; label: string; w: number }> = [
  { k: 'no', label: 'No', w: 56 }, { k: 'name', label: '商品', w: 240 }, { k: 'status', label: 'ステータス', w: 104 }, { k: 'orderer', label: '発注者', w: 104 },
  { k: 'qty', label: '数量', w: 66 }, { k: 'unit', label: '単価（税込）', w: 108 }, { k: 'incl', label: '合計（税込）', w: 112 },
  { k: 'spec', label: '規格・カラー', w: 160 }, { k: 'vendor', label: '購入先', w: 116 }, { k: 'note', label: '備考', w: 180 }, { k: 'url', label: 'URL', w: 160 }, { k: 'cat', label: 'URL確認日', w: 132 },
  { k: 'staff', label: '社内発注担当', w: 96 }, { k: 'ordered_at', label: '発注日', w: 132 }, { k: 'want', label: '希望納品日', w: 132 }, { k: 'fixed', label: '確定納品日', w: 132 },
  { k: 'done', label: '完了', w: 52 }, { k: 'pay_method', label: '支払い方法', w: 108 }, { k: 'pay_month', label: '支払月', w: 90 },
  { k: 'ship_to', label: '商品発送先', w: 128 }, { k: 'invoice_set', label: '請求書セット名', w: 128 }, { k: 'investor', label: '投資家向け', w: 112 }, { k: 'ops', label: '', w: 92 },
]

// 今日の日付（日本時間の端末の日付）。URLを開いた日として記録する
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const catRank = (c: string) => { const i = (FFE_CATEGORIES as readonly string[]).indexOf(c); return i < 0 ? 99 : i }
const sortItems = (list: FfeItem[]) => [...list].sort((a, b) => catRank(a.category) - catRank(b.category) || a.sort_order - b.sort_order)
const groupByCategory = (list: FfeItem[]) => {
  const out: Array<{ category: string; items: FfeItem[] }> = []
  for (const it of list) {
    const g = out.find(x => x.category === it.category)
    if (g) g.items.push(it); else out.push({ category: it.category, items: [it] })
  }
  return out
}
const isMissingTable = (m: string) => /pjb_ffe_|does not exist|schema cache/i.test(m)

export default function FfePage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectLite | null>(null)
  const [items, setItems] = useState<FfeItem[]>([])
  const [settings, setSettings] = useState<FfeSettings>({ project_id: id, delivery_date: null, fix_deadline: null, notes: '' })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [needPatch, setNeedPatch] = useState(false)
  const [view, setView] = useState<'internal' | 'investor'>('internal')
  const [cat, setCat] = useState('all')
  const [orderer, setOrderer] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [q, setQ] = useState('')
  const [warnOnly, setWarnOnly] = useState(false)
  const [dialog, setDialog] = useState<'import' | 'copy' | null>(null)
  const [trash, setTrash] = useState<FfeItem | null>(null)
  const [msg, setMsg] = useState('')

  const say = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(cur => (cur === m ? '' : cur)), 5000) }, [])

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('pjb_projects').select('id, name, status, period_no, period_label').eq('id', id).maybeSingle()
    if (!p) { setNotFound(true); setLoading(false); return }
    setProject(p as ProjectLite)
    const r = await supabase.from('pjb_ffe_items').select('*').eq('project_id', id).order('sort_order')
    if (r.error) { if (isMissingTable(r.error.message)) setNeedPatch(true); else alert(`読み込みに失敗しました：${r.error.message}`); setLoading(false); return }
    setItems((r.data || []) as FfeItem[])
    const s = await supabase.from('pjb_ffe_settings').select('*').eq('project_id', id).maybeSingle()
    if (s.data) setSettings(s.data as FfeSettings)
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const ordered = useMemo(() => sortItems(items), [items])
  const numberOf = useMemo(() => new Map(ordered.map((it, i) => [it.id, i + 1])), [ordered])
  const warnings = useMemo(() => warningsFor(items), [items])
  const summary = useMemo(() => summarize(items), [items])
  const iv = useMemo(() => investorView(ordered), [ordered])

  const lists = useMemo(() => {
    const uniq = (f: (i: FfeItem) => string) => Array.from(new Set(items.map(f).map(s => s.trim()).filter(Boolean)))
    return {
      orderers: Array.from(new Set([...FFE_ORDERERS, ...uniq(i => i.orderer)])),
      vendors: uniq(i => i.vendor), staff: uniq(i => i.staff), pay: uniq(i => i.pay_method), ship: uniq(i => i.ship_to),
    }
  }, [items])

  const filtered = useMemo(() => ordered.filter(it => {
    if (cat !== 'all' && it.category !== cat) return false
    if (orderer !== 'all' && it.orderer !== orderer) return false
    if (statusF !== 'all' && it.status !== statusF) return false
    if (warnOnly && !warnings.has(it.id)) return false
    if (q.trim()) {
      const hay = `${it.name} ${it.spec} ${it.vendor} ${it.note} ${it.section}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  }), [ordered, cat, orderer, statusF, warnOnly, q, warnings])

  // ---- 保存系 ----
  const patch = async (itemId: string, p: Partial<FfeItem>) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...p } : i))
    const { error } = await supabase.from('pjb_ffe_items').update({ ...p, updated_at: new Date().toISOString() }).eq('id', itemId)
    if (error) { alert(`保存に失敗しました：${error.message}`); load() }
  }

  const nextSort = () => items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1

  const addItem = async (category: string, section: string) => {
    const row = blankItem(id, category, section, nextSort(), orderer !== 'all' ? orderer : 'BNS')
    // 同じ区分の末尾に入れる（小見出しの途中ではなく、その小見出しの最後に）
    const sameCat = items.filter(i => i.category === category)
    const lastOfSection = [...sameCat].reverse().find(i => i.section === section)
    if (lastOfSection) {
      // 後ろの行を1つずつ後ろへずらして、場所をあける
      const after = items.filter(i => i.sort_order > lastOfSection.sort_order)
      row.sort_order = lastOfSection.sort_order + 1
      if (after.length) {
        await Promise.all(after.map(i => supabase.from('pjb_ffe_items').update({ sort_order: i.sort_order + 1 }).eq('id', i.id)))
        setItems(prev => prev.map(i => i.sort_order > lastOfSection.sort_order ? { ...i, sort_order: i.sort_order + 1 } : i))
      }
    }
    const { data, error } = await supabase.from('pjb_ffe_items').insert(row).select().single()
    if (error) { alert(`追加に失敗しました：${error.message}`); return }
    setItems(prev => [...prev, data as FfeItem])
  }

  const addSection = async (category: string) => {
    const name = prompt('小見出しの名前（例：テーブル&チェア）')?.trim()
    if (!name) return
    await addItem(category, name)
  }

  const renameSection = async (category: string, from: string, to: string) => {
    const next = to.trim()
    if (next === from) return
    setItems(prev => prev.map(i => i.category === category && i.section === from ? { ...i, section: next } : i))
    const { error } = await supabase.from('pjb_ffe_items').update({ section: next }).eq('project_id', id).eq('category', category).eq('section', from)
    if (error) { alert(`保存に失敗しました：${error.message}`); load() }
  }

  const removeItem = async (it: FfeItem) => {
    if (!confirm(`「${it.name || '（商品名なし）'}」を削除しますか？`)) return
    setItems(prev => prev.filter(i => i.id !== it.id))
    const { error } = await supabase.from('pjb_ffe_items').delete().eq('id', it.id)
    if (error) { alert(`削除に失敗しました：${error.message}`); load(); return }
    setTrash(it)
    setTimeout(() => setTrash(cur => (cur?.id === it.id ? null : cur)), 10000)
  }
  const undoRemove = async () => {
    if (!trash) return
    const { error } = await supabase.from('pjb_ffe_items').insert(trash)
    if (error) { alert(`元に戻せませんでした：${error.message}`); return }
    setItems(prev => [...prev, trash])
    setTrash(null)
  }

  const move = async (it: FfeItem, dir: -1 | 1) => {
    const same = ordered.filter(i => i.category === it.category)
    const k = same.findIndex(i => i.id === it.id)
    const other = same[k + dir]
    if (!other) return
    setItems(prev => prev.map(i => i.id === it.id ? { ...i, sort_order: other.sort_order } : i.id === other.id ? { ...i, sort_order: it.sort_order } : i))
    const r = await Promise.all([
      supabase.from('pjb_ffe_items').update({ sort_order: other.sort_order }).eq('id', it.id),
      supabase.from('pjb_ffe_items').update({ sort_order: it.sort_order }).eq('id', other.id),
    ])
    if (r.some(x => x.error)) { alert('並べ替えの保存に失敗しました'); load() }
  }

  // 取り込み・コピー共通：末尾に追加する
  const bulkInsert = async (list: NewItem[], replaceAll = false): Promise<string | null> => {
    if (replaceAll) {
      if (!confirm(`この案件の品目 ${items.length}件を、すべて削除してから取り込みます。よろしいですか？\n（削除したものは元に戻せません）`)) return '取り込みをやめました'
      const { error } = await supabase.from('pjb_ffe_items').delete().eq('project_id', id)
      if (error) return `削除に失敗しました：${error.message}`
      setItems([])
    }
    let sort = replaceAll ? 1 : nextSort()
    const rows = list.map(it => ({ ...it, project_id: id, sort_order: sort++ }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('pjb_ffe_items').insert(rows.slice(i, i + 200))
      if (error) { await load(); return `追加に失敗しました：${error.message}（途中まで追加されている場合があります）` }
    }
    await load()
    say(`${rows.length}品目を追加しました`)
    return null
  }

  const saveSettings = async (p: Partial<FfeSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    const { error } = await supabase.from('pjb_ffe_settings').upsert({ ...next, project_id: id, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    if (error) alert(`保存に失敗しました：${error.message}`)
  }

  const exportCsv = () => {
    const nm = project ? periodName(project.name, periodLabelOf(project)) : 'FFE'
    if (view === 'internal') downloadText(`FFE発注リスト_${nm}_社内用.csv`, internalCsv(ordered))
    else downloadText(`FFE発注リスト_${nm}_投資家用.csv`, investorCsv(ordered, iv))
  }

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) return <Shell projectId={id} active="ffe" wide><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  const projName = periodName(project.name, periodLabelOf(project))
  // URL確認日の列は、SQLパッチ029が済んでいるときだけ出す
  const hasCheck = items.length === 0 || 'checked_at' in items[0]
  const COLS = hasCheck ? COLS_ALL : COLS_ALL.filter(c => c.k !== 'cat')

  if (needPatch) {
    return (
      <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="ffe" wide>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-[14px] text-amber-900 leading-relaxed">
          <div className="font-semibold mb-1">先に、データベースの準備（SQLパッチ028）が必要です</div>
          Supabase の SQL Editor で、<code className="px-1 bg-white rounded">supabase-pj-budget-patch-028.sql</code> の内容を実行してから、この画面を再読み込みしてください。
        </div>
      </Shell>
    )
  }

  const catCounts = (c: string) => items.filter(i => i.category === c).length
  const cats = Array.from(new Set([...FFE_CATEGORIES, ...items.map(i => i.category)]))
  const warnCount = warnings.size
  const iMap = new Map(iv.lines.map(l => [l.id, l]))

  // ---- 表（社内用）----
  const renderInternal = () => {
    const groups = groupByCategory(filtered)
    return (
      <div className="overflow-auto max-h-[72vh] rounded-xl border border-slate-300 bg-white shadow-sm">
        <table className="text-[13px] border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: COLS.reduce((s, c) => s + c.w, 0) }}>
          <colgroup>{COLS.map(c => <col key={c.k} style={{ width: c.w }} />)}</colgroup>
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.k} className={`sticky top-0 bg-slate-700 text-white text-[12px] font-semibold text-left px-2 py-2 whitespace-nowrap ${c.k === 'no' ? 'left-0 z-[4]' : c.k === 'name' ? 'left-[56px] z-[4]' : 'z-[3]'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const all = ordered.filter(i => i.category === g.category)
              const sub = sumItems(all)
              let prevSection: string | null = null
              return (
                <Fragment key={g.category}>
                  <tr>
                    <td colSpan={COLS.length} className="bg-amber-500 text-white font-semibold px-2 py-1.5">
                      <div className="sticky left-2 inline-flex items-center gap-3 flex-wrap">
                        <span className="text-[14px]">{g.category}</span>
                        <span className="text-[12px] font-normal opacity-90">{all.filter(counted).length}品目 ／ 税込 {formatYen(sub.incl)} ／ 税別 {formatYen(sub.excl)}</span>
                        <button onClick={() => addSection(g.category)} className="text-[12px] px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 font-normal">＋ 小見出し</button>
                      </div>
                    </td>
                  </tr>
                  {g.items.map(it => {
                    const showSection = it.section !== prevSection && !(prevSection === null && it.section === '')
                    prevSection = it.section
                    const warn = warnings.get(it.id)
                    const dead = it.status === 'キャンセル'
                    const bg = warn ? 'bg-amber-50' : 'bg-white'
                    const incl = lineIncl(it)
                    return (
                      <Fragment key={it.id}>
                        {showSection && (
                          <tr>
                            <td colSpan={COLS.length} className="bg-sky-100 px-2 py-1 border-b border-slate-200">
                              <div className="sticky left-2 inline-flex items-center gap-2">
                                <Txt value={it.section} onCommit={v => renameSection(it.category, it.section, v)} placeholder="（小見出しなし）" className="!w-56 !font-semibold !text-sky-900" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className={`${dead ? 'opacity-50' : ''} group`}>
                          <td className={`sticky left-0 z-[1] ${bg} border-b border-slate-200 px-2 text-center text-slate-500 text-[12px]`}>
                            <span title={warn?.join('\n')} className={warn ? 'text-amber-600 font-bold cursor-help' : ''}>{warn ? '⚠ ' : ''}{numberOf.get(it.id)}</span>
                          </td>
                          <td className={`sticky left-[56px] z-[1] ${bg} border-b border-slate-200 border-r`}><Txt value={it.name} onCommit={v => patch(it.id, { name: v })} placeholder="商品名" className={`font-medium ${dead ? 'line-through' : ''}`} /></td>
                          <td className={`${bg} border-b border-slate-200 px-1`}>
                            <select value={it.status} onChange={e => patch(it.id, { status: e.target.value })} className={`w-full text-[12px] rounded-full px-2 py-1 border-0 ${STATUS_CLS[it.status] ?? 'bg-slate-100 text-slate-700'}`}>
                              {[...FFE_STATUSES, ...(FFE_STATUSES as readonly string[]).includes(it.status) ? [] : [it.status]].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.orderer} list="ffe-orderers" onCommit={v => patch(it.id, { orderer: v.trim() })} /></td>
                          <td className={`${bg} border-b border-slate-200 ${Number(it.qty) <= 0 && Number(it.unit_price) > 0 ? '!bg-rose-50' : ''}`}><Num value={it.qty} onCommit={v => patch(it.id, { qty: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Num money value={it.unit_price} onCommit={v => patch(it.id, { unit_price: v })} /></td>
                          <td className={`${bg} border-b border-slate-200 px-2 text-right tabular-nums font-semibold ${dead ? 'line-through' : ''}`} title={`税別 ${formatYen(exclOf(incl))}`}>{formatYen(incl)}</td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.spec} onCommit={v => patch(it.id, { spec: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.vendor} list="ffe-vendors" onCommit={v => patch(it.id, { vendor: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.note} onCommit={v => patch(it.id, { note: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}>
                            <div className="flex items-center">
                              <Txt value={it.url} onCommit={v => patch(it.id, { url: v.trim() })} className="text-blue-700" />
                              {/^https?:\/\//.test(it.url) && <a href={it.url} target="_blank" rel="noreferrer" onClick={() => { if (hasCheck) patch(it.id, { checked_at: todayYmd() }) }} className="px-1 text-blue-600 shrink-0" title="URLを開く（開いた日が「URL確認日」に入ります）">↗</a>}
                            </div>
                          </td>
                          {hasCheck && (
                            <td className={`${bg} border-b border-slate-200`}><DateCell value={it.checked_at ?? null} onCommit={v => patch(it.id, { checked_at: v })} /></td>
                          )}
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.staff} list="ffe-staff" onCommit={v => patch(it.id, { staff: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><DateCell value={it.ordered_at} onCommit={v => patch(it.id, { ordered_at: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><DateCell value={it.want_date} onCommit={v => patch(it.id, { want_date: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><DateCell value={it.fixed_date} onCommit={v => patch(it.id, { fixed_date: v })} /></td>
                          <td className={`${bg} border-b border-slate-200 text-center`}><input type="checkbox" checked={it.done} onChange={e => patch(it.id, { done: e.target.checked })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.pay_method} list="ffe-pay" onCommit={v => patch(it.id, { pay_method: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.pay_month} onCommit={v => patch(it.id, { pay_month: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.ship_to} list="ffe-ship" onCommit={v => patch(it.id, { ship_to: v })} /></td>
                          <td className={`${bg} border-b border-slate-200`}><Txt value={it.invoice_set} onCommit={v => patch(it.id, { invoice_set: v })} /></td>
                          <td className={`${bg} border-b border-slate-200 px-1`}>
                            <select value={it.investor_mode} onChange={e => patch(it.id, { investor_mode: e.target.value as InvestorMode })}
                              title="見せない＝投資家用では表示せず、その金額を他の品目の単価に上乗せします。固定＝表示するが、上乗せは受けません"
                              className={`w-full text-[12px] rounded px-1.5 py-1 border ${it.investor_mode === 'hide' ? 'bg-slate-800 text-white border-slate-800' : it.investor_mode === 'fixed' ? 'bg-violet-50 border-violet-200' : 'border-slate-200 bg-white'}`}>
                              <option value="show">表示</option><option value="hide">見せない</option><option value="fixed">固定</option>
                            </select>
                          </td>
                          <td className={`${bg} border-b border-slate-200 text-center whitespace-nowrap`}>
                            <button onClick={() => move(it, -1)} className="px-1 text-slate-400 hover:text-slate-700" title="上へ">↑</button>
                            <button onClick={() => move(it, 1)} className="px-1 text-slate-400 hover:text-slate-700" title="下へ">↓</button>
                            <button onClick={() => removeItem(it)} className="px-1 text-slate-400 hover:text-rose-600" title="削除">×</button>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                  <tr>
                    <td colSpan={COLS.length} className="bg-white border-b border-slate-300 px-2 py-1">
                      <div className="sticky left-2 inline-block">
                        <button onClick={() => addItem(g.category, all[all.length - 1]?.section ?? '')} className="text-[12.5px] px-2.5 py-1 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">＋ {g.category}に品目を追加</button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-slate-400">該当する品目がありません</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  // ---- 表（投資家用・読み取り専用）----
  const renderInvestor = () => {
    const vis = ordered.filter(i => iMap.has(i.id))
    const groups = groupByCategory(vis)
    return (
      <div className="overflow-auto max-h-[72vh] rounded-xl border border-slate-300 bg-white shadow-sm">
        <table className="w-full text-[13px] border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-700 text-white text-[12px]">
              {['No', '商品', '規格・カラー', '数量', '単価（税込）', '合計（税込）', '合計（税別）'].map((h, i) => <th key={h} className={`sticky top-0 bg-slate-700 px-2 py-2 font-semibold ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const sub = g.items.reduce((s, i) => ({ incl: s.incl + (iMap.get(i.id)?.incl ?? 0), excl: s.excl + (iMap.get(i.id)?.excl ?? 0) }), { incl: 0, excl: 0 })
              let prev: string | null = null
              return (
                <Fragment key={g.category}>
                  <tr><td colSpan={7} className="bg-amber-500 text-white font-semibold px-2 py-1.5">{g.category}<span className="ml-3 text-[12px] font-normal opacity-90">税込 {formatYen(sub.incl)} ／ 税別 {formatYen(sub.excl)}</span></td></tr>
                  {g.items.map(it => {
                    const l = iMap.get(it.id)!
                    const showSection = it.section !== prev && !(prev === null && it.section === '')
                    prev = it.section
                    return (
                      <Fragment key={it.id}>
                        {showSection && <tr><td colSpan={7} className="bg-sky-100 px-2 py-1 font-semibold text-sky-900 text-[12.5px]">{it.section || '（小見出しなし）'}</td></tr>}
                        <tr>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-slate-500 text-center w-14">{numberOf.get(it.id)}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 font-medium">{it.name}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-slate-600">{[it.spec, it.color].filter(Boolean).join(' ')}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-right tabular-nums">{it.qty}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-right tabular-nums">{formatYen(l.unit)}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-right tabular-nums font-semibold">{formatYen(l.incl)}</td>
                          <td className="px-2 py-1.5 border-b border-slate-200 text-right tabular-nums text-slate-500">{formatYen(l.excl)}</td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const Card = ({ title, m, sub }: { title: string; m: { incl: number; excl: number }; sub?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[12.5px] text-slate-500">{title}</div>
      <div className="text-[22px] font-bold tabular-nums text-slate-900 leading-tight">{formatYen(m.incl)}<span className="text-[11.5px] font-normal text-slate-400 ml-1">税込</span></div>
      <div className="text-[13px] tabular-nums text-slate-500">{formatYen(m.excl)} <span className="text-[11.5px] text-slate-400">税別</span></div>
      {sub && <div className="text-[11.5px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )

  const printGroups = groupByCategory(view === 'internal' ? ordered : ordered.filter(i => iMap.has(i.id)))
  const ymd = (d: string | null) => (d ? d.replaceAll('-', '/') : '未定')

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="ffe" wide onQuickAdded={load}>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: #fff !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <datalist id="ffe-orderers">{lists.orderers.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ffe-vendors">{lists.vendors.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ffe-staff">{lists.staff.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ffe-pay">{lists.pay.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="ffe-ship">{lists.ship.map(v => <option key={v} value={v} />)}</datalist>

      <div className="print:hidden">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h1 className="text-[20px] font-bold text-slate-900 mr-auto">FFE・OSE発注リスト</h1>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden bg-white text-[13.5px]">
            <button onClick={() => setView('internal')} className={`px-3.5 py-2 ${view === 'internal' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>社内用</button>
            <button onClick={() => setView('investor')} className={`px-3.5 py-2 ${view === 'investor' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>投資家用</button>
          </div>
          <button onClick={() => setDialog('import')} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">スプレッドシートから取り込む</button>
          <button onClick={() => setDialog('copy')} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">他の案件からコピー</button>
          <button onClick={exportCsv} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">CSV出力</button>
          <button onClick={() => window.print()} className="text-[13.5px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">印刷／PDF</button>
        </div>

        {!hasCheck && <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[13px] px-3 py-2">「URL確認日」の欄を使うには、<code className="px-1 bg-white rounded">supabase-pj-budget-patch-029.sql</code> を Supabase で実行してください。</div>}
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] px-3 py-2">{msg}</div>}
        {trash && (
          <div className="mb-3 rounded-lg bg-slate-800 text-white text-[13px] px-3 py-2 flex items-center gap-3">
            「{trash.name || '（商品名なし）'}」を削除しました
            <button onClick={undoRemove} className="underline">元に戻す</button>
          </div>
        )}

        {/* 納品日・FIX期限・要確認事項 */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 mb-3 grid gap-3 md:grid-cols-[auto_auto_1fr] items-start">
          <label className="text-[12.5px] text-slate-500">納品日
            <input type="date" key={settings.delivery_date ?? ''} defaultValue={settings.delivery_date ?? ''} onBlur={e => { if ((e.target.value || null) !== settings.delivery_date) saveSettings({ delivery_date: e.target.value || null }) }} className="block mt-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-900" />
          </label>
          <label className="text-[12.5px] text-slate-500">発注リストFIX期限
            <input type="date" key={settings.fix_deadline ?? ''} defaultValue={settings.fix_deadline ?? ''} onBlur={e => { if ((e.target.value || null) !== settings.fix_deadline) saveSettings({ fix_deadline: e.target.value || null }) }} className="block mt-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[14px] text-slate-900" />
          </label>
          <label className="text-[12.5px] text-slate-500">要確認事項（社内メモ。印刷には、社内用のときだけ載ります）
            <textarea key={settings.notes} defaultValue={settings.notes} rows={2} onBlur={e => { if (e.target.value !== settings.notes) saveSettings({ notes: e.target.value }) }} placeholder="例）ECサイト品の家具は倉庫保管が必要か確認" className="block mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-[13.5px] text-slate-900" />
          </label>
        </div>

        {view === 'internal' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
              <Card title="原価合計" m={summary.total} sub={`${items.filter(counted).length}品目（キャンセルを除く）`} />
              <Card title="BNS手配FFE" m={summary.bns} />
              <Card title="デザイナー手配" m={summary.designer} sub="発注者が「デザイナー」の品目" />
              <Card title="分離発注" m={summary.separate} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 mb-3 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-[13px] font-semibold text-slate-700 mb-1">BNS手配FFEの内訳</div>
                <table className="w-full text-[13px]">
                  <thead><tr className="text-slate-400 text-[12px]"><th className="text-left font-normal">区分</th><th className="text-right font-normal">品目</th><th className="text-right font-normal">税別</th><th className="text-right font-normal">税込</th></tr></thead>
                  <tbody>
                    {summary.categories.map(c => (
                      <tr key={c.category} className="border-t border-slate-100"><td className="py-1">{c.category}</td><td className="text-right tabular-nums">{c.count}</td><td className="text-right tabular-nums">{formatYen(c.excl)}</td><td className="text-right tabular-nums">{formatYen(c.incl)}</td></tr>
                    ))}
                    <tr className="border-t border-slate-300 font-semibold"><td className="py-1">計</td><td /><td className="text-right tabular-nums">{formatYen(summary.bns.excl)}</td><td className="text-right tabular-nums">{formatYen(summary.bns.incl)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-700 mb-1">進み具合</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {FFE_STATUSES.map(s => {
                    const n = items.filter(i => i.status === s).length
                    return <button key={s} onClick={() => setStatusF(statusF === s ? 'all' : s)} className={`text-[12.5px] px-2.5 py-1 rounded-full ${STATUS_CLS[s]} ${statusF === s ? 'ring-2 ring-slate-700' : ''}`}>{s} {n}</button>
                  })}
                </div>
                <button onClick={() => setWarnOnly(w => !w)} className={`text-[13px] px-3 py-1.5 rounded-lg border ${warnCount > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500'} ${warnOnly ? 'ring-2 ring-amber-400' : ''}`}>
                  {warnCount > 0 ? `⚠ 要確認 ${warnCount}件（押すと、その行だけ表示）` : '要確認の行はありません'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="mb-3 grid gap-2.5 lg:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-[13px] text-slate-600 leading-relaxed">
              社内の金額は一切変わりません。「見せない」にした品目（{ordered.filter(i => i.investor_mode === 'hide' && counted(i)).length}件・計 {formatYen(iv.hiddenTotal)}）は表に出さず、その金額を「表示」の品目の単価に、金額の大きさに応じて上乗せしています。
              {iv.noAbsorber && <div className="mt-1 text-rose-700 font-medium">上乗せを受ける品目（「表示」で金額のある品目）がないため、合計が社内と合いません。</div>}
              {!iv.noAbsorber && iv.remainder !== 0 && <div className="mt-1 text-rose-700 font-medium">端数 {formatYen(iv.remainder)} を、単価に割り振れませんでした（数量が2以上の品目だけのため）。</div>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 min-w-[260px]">
              <div className="text-[12.5px] text-slate-500">投資家に見せる合計</div>
              <div className="text-[22px] font-bold tabular-nums">{formatYen(iv.investorTotal)}<span className="text-[11.5px] font-normal text-slate-400 ml-1">税込</span></div>
              <div className="text-[13px] tabular-nums text-slate-500">{formatYen(iv.excl)} <span className="text-[11.5px] text-slate-400">税別</span></div>
              <div className={`text-[12.5px] mt-1 font-medium ${iv.investorTotal === iv.internalTotal ? 'text-emerald-700' : 'text-rose-700'}`}>
                {iv.investorTotal === iv.internalTotal ? `✓ 社内の合計（${formatYen(iv.internalTotal)}）と一致` : `社内の合計 ${formatYen(iv.internalTotal)} と ${formatYen(iv.investorTotal - iv.internalTotal)} 違います`}
              </div>
            </div>
          </div>
        )}

        {view === 'internal' && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCat('all')} className={`text-[13px] px-3 py-1.5 rounded-full border ${cat === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>すべて {items.length}</button>
              {cats.map(c => (
                <button key={c} onClick={() => setCat(c)} className={`text-[13px] px-3 py-1.5 rounded-full border ${cat === c ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>{c} {catCounts(c)}</button>
              ))}
            </div>
            <select value={orderer} onChange={e => setOrderer(e.target.value)} className="text-[13px] border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
              <option value="all">発注者：すべて</option>
              {lists.orderers.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} className="text-[13px] border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
              <option value="all">ステータス：すべて</option>
              {FFE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="商品名・購入先などで検索" className="text-[13px] border border-slate-300 rounded-lg px-3 py-1.5 bg-white w-60" />
            {(cat !== 'all' || orderer !== 'all' || statusF !== 'all' || q || warnOnly) && (
              <button onClick={() => { setCat('all'); setOrderer('all'); setStatusF('all'); setQ(''); setWarnOnly(false) }} className="text-[13px] text-blue-600 underline">絞り込みを解除</button>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-[14px] text-slate-500">
            まだ品目がありません。<br />
            <span className="text-[13px]">上の「スプレッドシートから取り込む」「他の案件からコピー」、または下の ＋ から追加してください。</span>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {FFE_CATEGORIES.map(c => <button key={c} onClick={() => addItem(c, '')} className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">＋ {c}</button>)}
            </div>
          </div>
        ) : view === 'internal' ? renderInternal() : renderInvestor()}
        <p className="text-[12px] text-slate-400 mt-2">金額は税込の単価を入力します。税別は「合計（税込）÷1.1」を1行ずつ四捨五入、全体の合計は行の合計を足し上げています。キャンセルの品目は合計に入りません。URLの「↗」を押すと、その日が「URL確認日」に自動で入ります。サイトで見た最新の金額は、そのまま「単価」に入力してください。</p>
      </div>

      {/* 印刷／PDF */}
      <div className="hidden print:block text-slate-900 text-[10px]">
        <div className="bg-[#1b3350] text-white px-3 py-2 text-[16px] font-bold">FFE・OSE発注リスト｜{projName}{view === 'internal' ? '（社内用）' : ''}</div>
        <div className="flex gap-6 px-1 py-1.5 text-[10.5px]">
          <span>納品日：{ymd(settings.delivery_date)}</span><span>発注リストFIX期限：{ymd(settings.fix_deadline)}</span>
          <span className="ml-auto font-semibold">合計 税込 {formatYen(view === 'internal' ? summary.total.incl : iv.investorTotal)} ／ 税別 {formatYen(view === 'internal' ? summary.total.excl : iv.excl)}</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-200 text-[9.5px]">
              {(view === 'internal'
                ? ['No', '商品', '規格・カラー', '数量', '単価（税込）', '合計（税込）', '発注者', '購入先', 'ステータス', '納品日', '備考']
                : ['No', '商品', '規格・カラー', '数量', '単価（税込）', '合計（税込）', '合計（税別）']
              ).map(h => <th key={h} className="border border-slate-400 px-1 py-0.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {printGroups.map(g => {
              const span = view === 'internal' ? 11 : 7
              const sub = view === 'internal' ? sumItems(g.items) : g.items.reduce((s, i) => ({ incl: s.incl + (iMap.get(i.id)?.incl ?? 0), excl: s.excl + (iMap.get(i.id)?.excl ?? 0) }), { incl: 0, excl: 0 })
              let prev: string | null = null
              return (
                <Fragment key={g.category}>
                  <tr className="bg-amber-100"><td colSpan={span} className="border border-slate-400 px-1.5 py-0.5 font-bold">{g.category}　<span className="font-normal">税込 {formatYen(sub.incl)} ／ 税別 {formatYen(sub.excl)}</span></td></tr>
                  {g.items.map(it => {
                    const sec = it.section !== prev && !(prev === null && it.section === '')
                    prev = it.section
                    const l = iMap.get(it.id)
                    const incl = lineIncl(it)
                    return (
                      <Fragment key={it.id}>
                        {sec && <tr className="bg-sky-50"><td colSpan={span} className="border border-slate-300 px-1.5 py-0.5 font-semibold">{it.section || '（小見出しなし）'}</td></tr>}
                        <tr style={{ breakInside: 'avoid' }}>
                          <td className="border border-slate-300 px-1 text-center">{numberOf.get(it.id)}</td>
                          <td className="border border-slate-300 px-1 font-medium">{it.name}</td>
                          <td className="border border-slate-300 px-1">{[it.spec, it.color].filter(Boolean).join(' ')}</td>
                          <td className="border border-slate-300 px-1 text-right">{it.qty}</td>
                          {view === 'internal' ? (
                            <>
                              <td className="border border-slate-300 px-1 text-right">{formatYen(it.unit_price)}</td>
                              <td className="border border-slate-300 px-1 text-right font-semibold">{counted(it) ? formatYen(incl) : '—'}</td>
                              <td className="border border-slate-300 px-1">{it.orderer}</td>
                              <td className="border border-slate-300 px-1">{it.vendor}</td>
                              <td className="border border-slate-300 px-1">{it.status}</td>
                              <td className="border border-slate-300 px-1">{it.fixed_date ? ymd(it.fixed_date) : it.want_date ? `${ymd(it.want_date)}（希望）` : ''}</td>
                              <td className="border border-slate-300 px-1">{it.note}</td>
                            </>
                          ) : (
                            <>
                              <td className="border border-slate-300 px-1 text-right">{formatYen(l?.unit)}</td>
                              <td className="border border-slate-300 px-1 text-right font-semibold">{formatYen(l?.incl)}</td>
                              <td className="border border-slate-300 px-1 text-right">{formatYen(l?.excl)}</td>
                            </>
                          )}
                        </tr>
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {view === 'internal' && settings.notes.trim() && (
          <div className="mt-2 border border-slate-300 bg-slate-50 px-2 py-1.5 whitespace-pre-wrap"><b>要確認事項</b>{'\n'}{settings.notes}</div>
        )}
      </div>

      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} onImport={bulkInsert} />}
      {dialog === 'copy' && <CopyDialog projectId={id} onClose={() => setDialog(null)} onCopied={items => bulkInsert(items)} />}
    </Shell>
  )
}
