-- ============================================================================
-- PJ予算管理アプリ パッチ 003
-- 内容: プロジェクトに「1口あたりの投資額」を追加
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,0) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
