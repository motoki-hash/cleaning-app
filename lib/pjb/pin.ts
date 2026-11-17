// PINログインの補助。PINの照合そのものはサーバー（/api/pjb/login）で行う。
// ここでは「最後に操作した時刻」だけを端末（ブラウザ）に覚えておく。
// 使っている端末では入り直しの手間を減らすため、ロックまでの時間は長めにしている（使うたびに延びる）。

export const PIN_LENGTH = 6
export const AUTO_LOCK_MS = 30 * 24 * 60 * 60 * 1000   // 30日間まったく使わなかったときだけ、PINに戻る

const KEY_ACTIVE = 'pjb_active_at'

// 最後の操作から AUTO_LOCK_MS 以内なら「ログイン中」とみなす（タブをまたいで共有）
export const isUnlocked = () => {
  try {
    const ts = Number(localStorage.getItem(KEY_ACTIVE))
    return !!ts && Date.now() - ts < AUTO_LOCK_MS
  } catch { return false }
}
export const markUnlocked = () => { try { localStorage.setItem(KEY_ACTIVE, String(Date.now())) } catch { /* 保存できなくても動作は続ける */ } }
export const lockNow = () => { try { localStorage.removeItem(KEY_ACTIVE) } catch { /* 無視 */ } }
