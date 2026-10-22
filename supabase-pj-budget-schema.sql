-- ============================================================================
-- PJ予算管理アプリ Phase 1 スキーマ
-- 対象: ホテル開発プロジェクトの予算・発注・VE・支払・投資家請求管理
--
-- 適用方法:
--   1. Supabase Dashboard (https://app.supabase.com) にアクセス
--   2. 対象プロジェクトの SQL Editor を開く
--   3. このファイルの内容を貼り付けて実行
--
-- 備考:
--   既存の cleaning-app と同じ Supabase プロジェクトを前提としています
--   （ドメイン分離のため、テーブル名はすべて pjb_ プレフィックス）。
--   完全に独立させたい場合は、別の Supabase プロジェクトに対して
--   このファイルをそのまま実行してください。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. プロジェクト
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_budget NUMERIC(14,0) NOT NULL DEFAULT 0,      -- PJ総予算 (Excel: C3)
  target_profit NUMERIC(14,0) NOT NULL DEFAULT 0,     -- 目標利益 (Excel: E3 = 社内設計費+BNS利益)
  room_count INTEGER NOT NULL DEFAULT 0,               -- 総部屋数 (Excel: D2)
  status TEXT NOT NULL DEFAULT '進行中'
    CHECK (status IN ('進行中', '完了', '保留')),
  started_at DATE,
  completed_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. 予算カテゴリー（BNS外予算 / BNS予算の各費目）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL CHECK (group_name IN ('BNS外予算', 'BNS予算')),
  name TEXT NOT NULL,                                  -- 内装工事, 解体工事, FFE・OSE 等
  original_budget NUMERIC(14,0) NOT NULL DEFAULT 0,    -- 当初予算
  latest_budget NUMERIC(14,0) NOT NULL DEFAULT 0,      -- 最新予算（原価ベース）
  sell_amount NUMERIC(14,0) NOT NULL DEFAULT 0,        -- 投資家への請求額（BNS予算グループのみ使用。旧ExcelのN16:N20手入力欄を統合）
  counts_as_cost BOOLEAN NOT NULL DEFAULT true,        -- false: BNS利益・PJ予備費・設計デザイン費用(社内)など、
                                                        -- 「BNS原価」の集計に含めない項目（利益や未使用予備枠のため）
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_budget_categories_project ON pjb_budget_categories(project_id);

-- ----------------------------------------------------------------------------
-- 3. 業者マスタ（Excelの「To（受取者）」自由入力を正規化）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. 発注管理（見積 → 発注 → 施工・納品 → 請求 → 支払）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES pjb_budget_categories(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES pjb_vendors(id),
  title TEXT NOT NULL,                                  -- 工事項目 / 品目
  estimate_amount NUMERIC(14,0) NOT NULL DEFAULT 0,     -- 見積額
  order_amount NUMERIC(14,0) NOT NULL DEFAULT 0,        -- 発注額
  status TEXT NOT NULL DEFAULT '見積依頼中' CHECK (status IN (
    '見積依頼中', '見積受領', '発注待ち', '発注済',
    '完了', '請求書待ち', '支払待ち', '支払済'
  )),
  estimated_at DATE,
  ordered_at DATE,
  delivered_at DATE,
  invoice_received BOOLEAN NOT NULL DEFAULT false,      -- 請求書受領
  invoice_received_at DATE,
  invoice_due_date DATE,                                -- 支払期日
  payment_scheduled_at DATE,                            -- 支払予定日
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_orders_project ON pjb_orders(project_id);
CREATE INDEX idx_pjb_orders_category ON pjb_orders(category_id);

-- ----------------------------------------------------------------------------
-- 5. 追加工事
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_additional_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES pjb_budget_categories(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES pjb_vendors(id),
  title TEXT NOT NULL,                                  -- 工事項目
  content TEXT,                                         -- 内容
  amount NUMERIC(14,0) NOT NULL DEFAULT 0,
  occurred_on DATE,                                     -- 発生日
  status TEXT NOT NULL DEFAULT '検討中' CHECK (status IN (
    '検討中', '見積待ち', '承認待ち', '承認済', '発注済', '完了', '却下'
  )),
  budget_impact TEXT NOT NULL DEFAULT '増額' CHECK (budget_impact IN ('増額', '減額', '影響なし')),
  estimate_file_url TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_additional_works_project ON pjb_additional_works(project_id);
CREATE INDEX idx_pjb_additional_works_category ON pjb_additional_works(category_id);

-- ----------------------------------------------------------------------------
-- 6. VE (Value Engineering) 管理
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_ve_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  category_id UUID REFERENCES pjb_budget_categories(id),
  content TEXT NOT NULL,                                -- VE内容
  target_item TEXT,                                     -- 対象項目
  planned_reduction NUMERIC(14,0) NOT NULL DEFAULT 0,   -- 削減予定額
  confirmed_reduction NUMERIC(14,0) NOT NULL DEFAULT 0, -- 確定削減額
  status TEXT NOT NULL DEFAULT '検討中' CHECK (status IN ('検討中', '提案中', '採用', '不採用')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_ve_items_project ON pjb_ve_items(project_id);

-- ----------------------------------------------------------------------------
-- 7. 予算変更履歴（削除不可・追記のみ）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_cost_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES pjb_budget_categories(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,                             -- 例: latest_budget, 着地見込
  before_amount NUMERIC(14,0),
  after_amount NUMERIC(14,0),
  reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_cost_changes_category ON pjb_cost_changes(category_id);

-- ----------------------------------------------------------------------------
-- 8. 投資家
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_count INTEGER NOT NULL DEFAULT 0,
  investment_amount NUMERIC(14,0) NOT NULL DEFAULT 0,   -- 金額（税込）
  ratio_start NUMERIC(5,4) NOT NULL DEFAULT 0.5,        -- 着工比率（可変）
  ratio_mid NUMERIC(5,4) NOT NULL DEFAULT 0.3,          -- 中間比率（可変）
  -- 完了比率は 1 - 着工 - 中間 で常に算出（Excelの G列ロジックを踏襲）
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_investors_project ON pjb_investors(project_id);

-- ----------------------------------------------------------------------------
-- 9. 投資家別フェーズ請求
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_investor_billings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES pjb_investors(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('着工', '中間', '完了')),
  amount NUMERIC(14,0) NOT NULL DEFAULT 0,
  invoiced BOOLEAN NOT NULL DEFAULT false,
  invoiced_at DATE,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(investor_id, phase)
);

-- ----------------------------------------------------------------------------
-- 10. 添付ファイル（見積書・請求書。Phase 2 の AI-OCR 拡張を見据えた構造）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('order', 'additional_work', 've_item')),
  owner_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  ocr_status TEXT DEFAULT NULL,   -- Phase 2: 'pending' | 'done' | 'failed'
  ocr_result JSONB DEFAULT NULL,  -- Phase 2: 会社名/金額/税額/工事項目/見積日/支払期限
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_attachments_owner ON pjb_attachments(owner_type, owner_id);

-- ----------------------------------------------------------------------------
-- 11. 操作履歴（全エンティティ横断・削除不可）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  user_email TEXT,
  action TEXT NOT NULL,               -- 例: 'update', 'create'
  entity_type TEXT NOT NULL,          -- 例: 'budget_category', 'order', 've_item'
  entity_label TEXT,                  -- 例: '内装工事 着地見込'
  before_value TEXT,
  after_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pjb_activity_log_project ON pjb_activity_log(project_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 12. 権限（Phase 2 で細粒度化する前提の最小構成）
-- ----------------------------------------------------------------------------
CREATE TABLE pjb_user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager', 'pm', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Row Level Security
-- Phase 1: ログイン済みユーザーは全操作可能（Admin/Manager/PM/Viewerの
-- 細かい権限分離は Phase 2 で pjb_user_roles.role を見て絞り込む）
-- ============================================================================
ALTER TABLE pjb_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_additional_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_ve_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_cost_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_investor_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access" ON pjb_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_budget_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_additional_works FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_ve_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_investors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_investor_billings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 履歴系は追記・閲覧のみ許可し、更新・削除はできない（要件15: 履歴を削除しない）
CREATE POLICY "authenticated read" ON pjb_cost_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert" ON pjb_cost_changes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated read" ON pjb_activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert" ON pjb_activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 初期カテゴリーのひな形を投入するヘルパー（プロジェクト作成後にアプリから呼び出す想定の
-- 参考SQL。アプリ側では INSERT で同等の内容を作成します）
-- ----------------------------------------------------------------------------
-- BNS外予算: 内装工事 / 解体工事 / 追加工事 / 設計デザイン費用(社外) / PJ予備費
-- BNS予算  : FFE・OSE費用 / 追加工事 / 設計デザイン費用(社外) / 設計デザイン費用(社内) /
--            BNS利益 / PJ予備費 / 分離発注 / その他費用
-- ============================================================================
