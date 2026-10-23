-- ============================================================================
-- PJ予算管理アプリ パッチ 008
-- 内容: BNS予算（PJ全体）の「売上・原価・利益」の予算を入れる欄を追加
--       （項目ごとではなく、PJ全体で1つずつ）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS bns_budget_sales  NUMERIC(14,0) NOT NULL DEFAULT 0;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS bns_budget_cost   NUMERIC(14,0) NOT NULL DEFAULT 0;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS bns_budget_profit NUMERIC(14,0) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
