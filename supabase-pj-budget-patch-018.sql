-- ============================================================================
-- PJ予算管理アプリ パッチ 018
-- 内容:
--   1. 案件の担当者（進行管理／品質管理／設計会社／施工会社）を追加（クライアントは既存の client_name を使う）
--   2. 売上計上月（sales_month）を追加 → 2026年度（4月〜翌3月）の「今期売上」の判定と年度ダッシュボードに使う
--   3. 年度ダッシュボードの月別計画（事業ごとの売上・原価の計画）を入れる pjb_fy_plans を追加
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS pm_name TEXT;               -- 進行管理
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS qa_name TEXT;               -- 品質管理
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS design_company TEXT;        -- 設計会社
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS contractor_company TEXT;    -- 施工会社
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS sales_month DATE;           -- 売上計上月（その月の1日）

CREATE TABLE IF NOT EXISTS pjb_fy_plans (
  fiscal_year INT NOT NULL,                  -- 年度（2026年度 = 2026年4月〜2027年3月）
  business TEXT NOT NULL,                    -- 事業名（'全体' も使える）
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),   -- 1=4月 … 12=3月
  sales NUMERIC(14,0) NOT NULL DEFAULT 0,    -- 売上の計画（円）
  cost NUMERIC(14,0) NOT NULL DEFAULT 0,     -- 原価の計画（円）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fiscal_year, business, month)
);

ALTER TABLE pjb_fy_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_fy_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
