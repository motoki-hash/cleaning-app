-- ============================================================================
-- PJ予算管理アプリ パッチ 014
-- 内容: BNS予算の「売上」を、項目ごとに複数の行（内訳）で入れられるようにする
--   - 売上の内訳テーブル pjb_sales_items を追加
--   - 今、項目に直接入れている売上は、「売上（一括）」という名前の1行にして移す
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_sales_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES pjb_budget_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(14,0) NOT NULL DEFAULT 0,   -- 売上（税別）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pjb_sales_items_project ON pjb_sales_items(project_id);
CREATE INDEX IF NOT EXISTS idx_pjb_sales_items_category ON pjb_sales_items(category_id);

ALTER TABLE pjb_sales_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_sales_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 今、BNS予算の項目に直接入れている売上を、「売上（一括）」の1行として移す
INSERT INTO pjb_sales_items (project_id, category_id, title, amount)
SELECT c.project_id, c.id, '売上（一括）', c.original_budget
FROM pjb_budget_categories c
WHERE c.group_name = 'BNS予算'
  AND c.original_budget > 0
  AND NOT EXISTS (SELECT 1 FROM pjb_sales_items s WHERE s.category_id = c.id);

NOTIFY pgrst, 'reload schema';
