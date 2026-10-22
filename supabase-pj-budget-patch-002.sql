-- ============================================================================
-- PJ予算管理アプリ パッチ 002
-- 内容: 発注書（PO）の下書き・保存データを格納する pjb_purchase_order_docs を追加
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE pjb_purchase_order_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES pjb_orders(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,

  quote_number TEXT,
  issue_date DATE,

  vendor_zip TEXT,
  vendor_address TEXT,

  issuer_name TEXT,
  issuer_zip TEXT,
  issuer_address TEXT,
  issuer_tel TEXT,
  issuer_email TEXT,
  issuer_contact TEXT,

  delivery_date DATE,
  delivery_place TEXT,
  notes TEXT,

  line_items JSONB NOT NULL DEFAULT '[]',   -- [{content, reducedTax, qty, unit, unitPrice, taxRate}]
  subtotal NUMERIC(14,0) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,0) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,0) NOT NULL DEFAULT 0,  -- 税込合計。保存時にこの金額を pjb_orders に反映する

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pjb_po_docs_project ON pjb_purchase_order_docs(project_id);

ALTER TABLE pjb_purchase_order_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_purchase_order_docs FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
