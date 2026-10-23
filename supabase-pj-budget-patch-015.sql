-- ============================================================================
-- PJ予算管理アプリ パッチ 015
-- 内容: 計算式で入力した金額の「式」を覚えておく（あとで開いたときに、式のまま編集できる）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_formulas (
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                 -- どの金額欄か（例: project:bns_budget_cost / order:<id>）
  expr TEXT NOT NULL,                -- 入力した計算式（例: 150万+30万）
  amount NUMERIC(14,0) NOT NULL,     -- その式の計算結果（金額が変わっていたら、式は使わない）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key)
);

ALTER TABLE pjb_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_formulas FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
