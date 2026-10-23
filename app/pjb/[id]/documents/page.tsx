'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Shell from '../../components/Shell'
import { SectionTitle, EmptyState } from '../../components/ui'
import { useProjectData } from '@/lib/pjb/useProjectData'
import { logActivity } from '@/lib/pjb/activity'
import { formatDateTime } from '@/lib/pjb/format'
import type { PjbDocument } from '@/lib/pjb/types'

const BUCKET = 'pjb-files'
const DOC_TYPES = ['見積書', '契約書', '請求書', '図面', 'その他'] as const
const TYPE_TONE: Record<string, string> = {
  '見積書': 'bg-sky-50 text-sky-700 border-sky-200',
  '契約書': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '請求書': 'bg-amber-50 text-amber-700 border-amber-200',
  '図面': 'bg-violet-50 text-violet-700 border-violet-200',
  'その他': 'bg-slate-50 text-slate-600 border-slate-200',
}

const fmtSize = (n: number | null) => {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>()
  const { project, orders, vendors, loading, notFound } = useProjectData(id)
  const [docs, setDocs] = useState<PjbDocument[]>([])
  const [setupError, setSetupError] = useState('')
  const [docType, setDocType] = useState<string>('見積書')
  const [orderId, setOrderId] = useState('')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<string>('すべて')
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('pjb_documents').select('*').eq('project_id', id).order('uploaded_at', { ascending: false })
    if (error) { setSetupError(error.message); return }
    setSetupError('')
    setDocs((data || []) as PjbDocument[])
  }, [id])
  useEffect(() => { load() }, [load])

  const vendorName = (vid: string | null) => vendors.find(v => v.id === vid)?.name || ''
  const orderLabel = (oid: string | null) => {
    const o = orders.find(x => x.id === oid)
    if (!o) return ''
    const v = vendorName(o.vendor_id)
    return `${o.title}${v ? `（${v}）` : ''}`
  }

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setMessage('')
    const failed: string[] = []
    for (const file of list) {
      // 保存先の名前は英数字だけにする（日本語のファイル名は、元の名前として別に記録する）
      const ext = (file.name.split('.').pop() || 'bin').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'bin'
      const path = `${id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (upErr) { failed.push(`${file.name}（${upErr.message}）`); continue }
      const { error: dbErr } = await supabase.from('pjb_documents').insert({
        project_id: id, order_id: orderId || null, doc_type: docType, file_path: path, file_name: file.name,
        content_type: file.type || null, size_bytes: file.size, note: note.trim() || null,
      })
      if (dbErr) { failed.push(`${file.name}（${dbErr.message}）`); await supabase.storage.from(BUCKET).remove([path]); continue }
      await logActivity({ projectId: id, action: 'create', entityType: 'document', entityLabel: `${docType}：${file.name}` })
    }
    setUploading(false)
    setNote('')
    if (fileRef.current) fileRef.current.value = ''
    setMessage(failed.length ? `保存できなかったファイル：${failed.join('、')}` : `${list.length}件のファイルを保存しました`)
    load()
  }

  const open = async (d: PjbDocument) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 120)
    if (error || !data) { alert(`ファイルを開けませんでした：${error?.message}`); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const remove = async (d: PjbDocument) => {
    if (!confirm(`「${d.file_name}」を削除しますか？（元に戻せません）`)) return
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([d.file_path])
    if (stErr) { alert(`削除に失敗しました：${stErr.message}`); return }
    const { error } = await supabase.from('pjb_documents').delete().eq('id', d.id)
    if (error) { alert(`削除に失敗しました：${error.message}`); return }
    await logActivity({ projectId: id, action: 'delete', entityType: 'document', entityLabel: `${d.doc_type}：${d.file_name}` })
    load()
  }

  const changeType = async (d: PjbDocument, t: string) => {
    await supabase.from('pjb_documents').update({ doc_type: t }).eq('id', d.id)
    load()
  }

  const shown = docs.filter(d => {
    if (filter !== 'すべて' && d.doc_type !== filter) return false
    if (query && !`${d.file_name} ${d.note || ''} ${orderLabel(d.order_id)}`.includes(query)) return false
    return true
  })

  if (notFound) return <div className="p-8 text-center text-slate-400 text-[14px]">プロジェクトが見つかりません</div>
  if (loading || !project) {
    return <Shell projectId={id} active="documents"><p className="text-center text-[14px] text-slate-400 py-10">読み込み中…</p></Shell>
  }

  const needsPatch = setupError && /pjb_documents|schema cache|does not exist/i.test(setupError)

  return (
    <Shell projectId={id} projectName={project.name} projectStatus={project.status} active="documents">
      <SectionTitle>書類（見積書・契約書・請求書など）</SectionTitle>
      <p className="text-[13px] text-slate-500 -mt-1 mb-3">
        見積書などのファイル（PDF・画像・Excelなど）をここに保存しておくと、案件ごとにいつでも開けます。Googleドライブを探し回る必要がなくなります。
      </p>

      {needsPatch && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-800 mb-4">
          書類の保管用の設定がまだです。Supabase の SQL Editor で <b>supabase-pj-budget-patch-012.sql</b> を実行してから、このページを再読み込みしてください。
        </div>
      )}
      {setupError && !needsPatch && <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[14px] text-rose-700 mb-4">{setupError}</div>}

      {/* アップロード */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5">
        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          <label className="grid gap-1">
            <span className="text-[12px] text-slate-500">種類</span>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-[14px] bg-white">
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[12px] text-slate-500">関連する内訳（任意）</span>
            <select value={orderId} onChange={e => setOrderId(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-[14px] bg-white">
              <option value="">指定しない</option>
              {orders.map(o => <option key={o.id} value={o.id}>{orderLabel(o.id)}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[12px] text-slate-500">メモ（任意）</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="例）第2版・値引き後" className="border border-slate-200 rounded-lg px-3 py-2 text-[14px]" />
          </label>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploading) upload(e.dataTransfer.files) }}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
          }`}
        >
          <div className="text-[14px] font-medium text-slate-700">{uploading ? '保存しています…' : 'ここにファイルをドラッグ、またはクリックして選択'}</div>
          <div className="text-[12px] text-slate-400 mt-1">複数のファイルをまとめて選べます（1ファイル50MBまで）</div>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && upload(e.target.files)} />
        </div>
        {message && <p className={`text-[13px] mt-2 ${message.startsWith('保存できなかった') ? 'text-rose-600' : 'text-emerald-700'}`}>{message}</p>}
      </div>

      {/* 一覧 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ファイル名・メモ・内訳で検索" className="w-full sm:w-72 border border-slate-200 bg-white rounded-lg px-3 py-2 text-[14px]" />
        <div className="flex gap-1.5 flex-wrap">
          {['すべて', ...DOC_TYPES].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-[13px] px-3 py-1.5 rounded-full border whitespace-nowrap ${filter === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{t}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState>{docs.length === 0 ? 'まだ書類がありません。上からファイルを保存してください。' : '該当する書類がありません'}</EmptyState>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {shown.map(d => (
            <div key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <select value={d.doc_type} onChange={e => changeType(d, e.target.value)}
                className={`text-[12px] px-2 py-0.5 rounded-full border font-medium ${TYPE_TONE[d.doc_type] || TYPE_TONE['その他']}`}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={() => open(d)} className="text-[14px] font-semibold text-slate-900 hover:underline text-left min-w-0 break-all">{d.file_name}</button>
              <span className="text-[12px] text-slate-400 whitespace-nowrap">{fmtSize(d.size_bytes)}</span>
              <span className="text-[12px] text-slate-400 whitespace-nowrap">{formatDateTime(d.uploaded_at)}</span>
              <div className="flex-1" />
              <button onClick={() => open(d)} className="text-[13px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">開く</button>
              <button onClick={() => remove(d)} className="text-slate-300 hover:text-rose-500 text-[13px]" aria-label="削除">✕</button>
              {(d.order_id || d.note) && (
                <div className="basis-full text-[12.5px] text-slate-500">
                  {d.order_id && <span className="mr-3">内訳：{orderLabel(d.order_id) || '（削除された内訳）'}</span>}
                  {d.note && <span>メモ：{d.note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
