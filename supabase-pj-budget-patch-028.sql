-- ============================================================================
-- PJ予算管理アプリ 028
-- 内容: 「FFE・OSE発注リスト」（案件ごとの品目表）を追加
--   ・pjb_ffe_items    … 品目（家具・家電・客室備品・運営関係・諸経費・分離発注）
--   ・pjb_ffe_settings … 案件ごとの納品日・発注リストFIX期限・要確認事項
--   既存のテーブルには、一切手を加えません（何度実行しても安全です）。
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_ffe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT '家具',       -- 区分（家具・家電・客室備品・運営関係・諸経費・分離発注）
  section TEXT NOT NULL DEFAULT '',            -- 小見出し（テーブル&チェア など）
  sort_order INT NOT NULL DEFAULT 0,
  orderer TEXT NOT NULL DEFAULT '',            -- 発注者（BNS・デザイナー・セカイズ など）
  staff TEXT NOT NULL DEFAULT '',              -- 社内発注担当
  status TEXT NOT NULL DEFAULT '未選定',
  ordered_at DATE,                             -- 発注日
  vendor TEXT NOT NULL DEFAULT '',             -- 購入先
  name TEXT NOT NULL DEFAULT '',               -- 商品
  spec TEXT NOT NULL DEFAULT '',               -- 規格・カラー
  color TEXT NOT NULL DEFAULT '',
  pack_qty TEXT NOT NULL DEFAULT '',           -- 入数
  qty NUMERIC NOT NULL DEFAULT 1,              -- 数量
  url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC NOT NULL DEFAULT 0,       -- 単価（税込）。税別・合計は画面で計算する
  ship_to TEXT NOT NULL DEFAULT '',            -- 商品発送先
  want_date DATE,                              -- 希望納品日
  fixed_date DATE,                             -- 確定納品日
  done BOOLEAN NOT NULL DEFAULT false,         -- 完了
  pay_method TEXT NOT NULL DEFAULT '',         -- 支払い方法
  invoice_set TEXT NOT NULL DEFAULT '',        -- 請求書セット名
  pay_month TEXT NOT NULL DEFAULT '',          -- 支払月
  investor_mode TEXT NOT NULL DEFAULT 'show' CHECK (investor_mode IN ('show', 'hide', 'fixed')),   -- 投資家向け：表示／見せない／金額固定
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pjb_ffe_items_project ON pjb_ffe_items(project_id, sort_order);

CREATE TABLE IF NOT EXISTS pjb_ffe_settings (
  project_id UUID PRIMARY KEY REFERENCES pjb_projects(id) ON DELETE CASCADE,
  delivery_date DATE,                          -- 納品日
  fix_deadline DATE,                           -- 発注リストFIX期限
  notes TEXT NOT NULL DEFAULT '',              -- 要確認事項
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pjb_ffe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_ffe_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON pjb_ffe_items;
DROP POLICY IF EXISTS "authenticated full access" ON pjb_ffe_settings;
CREATE POLICY "authenticated full access" ON pjb_ffe_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_ffe_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
