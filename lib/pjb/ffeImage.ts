import { supabase } from '@/lib/supabase'

// FFE発注リストの商品画像。貼り付け・選んだファイルの保存と、URLからの自動取得

// 画像を、長い辺が max px のJPEGにそろえる（保存する大きさを小さく、表示を速くする）
export async function toJpegBlob(file: Blob, max = 900): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を変換できませんでした')
  ctx.fillStyle = '#fff'   // 透明な部分は白にする
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', 0.85))
}

export async function uploadFfeImage(projectId: string, itemId: string, blob: Blob): Promise<{ url?: string; error?: string }> {
  const path = `${projectId}/${itemId}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('ffe-images').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) return { error: `画像を保存できませんでした：${error.message}（SQLパッチ031を実行しましたか？）` }
  return { url: supabase.storage.from('ffe-images').getPublicUrl(path).data.publicUrl }
}

// 商品ページのURLから画像を取ってくる（サーバーで取得して保存する）
export async function fetchImageFromUrl(url: string, projectId: string, itemId: string): Promise<{ url?: string; error?: string; amazon?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'ログインが切れています。ページを再読み込みしてください' }
  try {
    const res = await fetch('/api/pjb/ffe-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ url, projectId, itemId }),
    })
    const json = await res.json().catch(() => ({}))
    if (json.url) return { url: json.url }
    return { error: json.error || '画像を取得できませんでした', amazon: !!json.amazon }
  } catch {
    return { error: '通信に失敗しました。ネットワークを確認してください' }
  }
}
