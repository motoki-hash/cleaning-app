-- ============================================================================
-- PJ予算管理アプリ 029
-- 内容: FFE・OSE発注リストに「サイトで確認した金額（税込の単価）」と「確認日」を追加
--   ・URLの先のサイトで見た金額を入れておくと、シートの単価と違うときに印が付きます
--   既存のデータには影響しません（何度実行しても安全です）。
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS checked_price NUMERIC;   -- サイトで確認した単価（税込）。空＝未確認
ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS checked_at DATE;          -- 確認した日

NOTIFY pgrst, 'reload schema';
