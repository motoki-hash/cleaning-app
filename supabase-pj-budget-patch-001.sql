-- ============================================================================
-- PJ予算管理アプリ パッチ 001
-- 内容: pjb_budget_categories に counts_as_cost 列を追加
--       （BNS利益・PJ予備費・設計デザイン費用(社内) を「BNS原価」の集計から除外するため）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- 既に supabase-pj-budget-schema.sql を実行済みの環境に対する追加パッチです。
-- ============================================================================

ALTER TABLE pjb_budget_categories
  ADD COLUMN IF NOT EXISTS counts_as_cost BOOLEAN NOT NULL DEFAULT true;

UPDATE pjb_budget_categories
SET counts_as_cost = false
WHERE group_name = 'BNS予算'
  AND name IN ('設計デザイン費用(社内)', 'BNS利益', 'PJ予備費');

NOTIFY pgrst, 'reload schema';
