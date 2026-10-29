-- ============================================================================
-- PJ予算管理アプリ パッチ 020
-- 内容: 「BNSキャッシュ持ち出し」（売上にならず、BNSが補填する費用）を管理する pjb_cash_outs を追加
--   売上・原価・利益・予算の計算には含めない（別枠で管理する）
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_cash_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,   -- 持ち出した日（年度の判定に使う）
  content TEXT NOT NULL DEFAULT '',                 -- 内容
  amount NUMERIC(14,0) NOT NULL DEFAULT 0,          -- 金額（税別）
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pjb_cash_outs_project ON pjb_cash_outs(project_id);

ALTER TABLE pjb_cash_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_cash_outs FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
