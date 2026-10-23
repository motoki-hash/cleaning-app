-- ============================================================================
-- PJ予算管理アプリ パッチ 011
-- 内容: 延床面積（坪）の入力欄を追加（ダッシュボードの坪単価の計算に使う）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS floor_area_tsubo NUMERIC(10,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
