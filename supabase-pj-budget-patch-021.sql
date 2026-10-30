-- ============================================================================
-- PJ予算管理アプリ パッチ 021
-- 内容: コンストラクション事業部のリソース管理（人員の負荷予測）用
--   1. pjb_staff            … 担当者（適正FTE・在籍期間）
--   2. pjb_assignments      … 案件への割り当て（案件×人×役割。複数名OK、負荷割合は空欄＝均等割り）
--   3. pjb_resource_settings… 役割×フェーズの係数表、色の閾値、採用リードタイムなど（1行だけ）
--   4. pjb_projects に、案件別調整係数・ステイ期間（任意）を追加
--   5. 今ある進行管理・品質管理の名前を、担当者と割り当てに自動で取り込む
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- 何度実行しても重複しません。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  capacity_fte NUMERIC(4,2) NOT NULL DEFAULT 3.0,   -- 適正担当FTE（社内の負荷を比べるための管理指標）
  joined_on DATE,                                   -- 在籍の開始日（空欄＝以前から）
  left_on DATE,                                     -- 退職・異動の日（空欄＝在籍中）
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pjb_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES pjb_staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('進行管理', '品質管理', 'デザイン')),
  share NUMERIC(5,2),                               -- 負荷割合（1.0＝100%）。空欄＝同じ役割の人で均等割り
  start_on DATE,                                    -- 途中交代などの期間（空欄＝案件の全期間）
  end_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, staff_id, role)
);
CREATE INDEX IF NOT EXISTS idx_pjb_assignments_project ON pjb_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_pjb_assignments_staff ON pjb_assignments(staff_id);

CREATE TABLE IF NOT EXISTS pjb_resource_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phase_coefs JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"進行管理":{"plan":1,...},"品質管理":{...},"デザイン":{...}}
  th_spare NUMERIC(4,2) NOT NULL DEFAULT 0.8,       -- 適正FTEのこの割合を下回ると「余力あり」
  th_warn NUMERIC(4,2) NOT NULL DEFAULT 1.0,        -- これを超えると「注意」
  th_danger NUMERIC(4,2) NOT NULL DEFAULT 1.2,      -- これを超えると「重大」
  hire_lead_months INT NOT NULL DEFAULT 3,          -- 採用リードタイム（か月）
  structural_months INT NOT NULL DEFAULT 3,         -- この月数以上つづく不足を「構造的」とみなす
  new_hire_fte NUMERIC(4,2) NOT NULL DEFAULT 3.0,   -- 新しく採用する人の適正FTE（採用人数の目安に使う）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pjb_resource_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS load_factor NUMERIC(4,2);   -- 案件別調整係数（空欄＝1.0）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS stay_start DATE;            -- ステイ期間の開始月（任意・その月の1日）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS stay_end DATE;              -- ステイ期間の終了月（任意・その月の1日）

ALTER TABLE pjb_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_resource_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON pjb_staff;
DROP POLICY IF EXISTS "authenticated full access" ON pjb_assignments;
DROP POLICY IF EXISTS "authenticated full access" ON pjb_resource_settings;
CREATE POLICY "authenticated full access" ON pjb_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_resource_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 今ある進行管理・品質管理の名前を、担当者と割り当てに取り込む
INSERT INTO pjb_staff (name)
SELECT DISTINCT btrim(n) FROM (
  SELECT pm_name AS n FROM pjb_projects UNION ALL SELECT qa_name FROM pjb_projects
) x
WHERE n IS NOT NULL AND btrim(n) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO pjb_assignments (project_id, staff_id, role)
SELECT p.id, s.id, '進行管理' FROM pjb_projects p JOIN pjb_staff s ON s.name = btrim(p.pm_name)
WHERE p.pm_name IS NOT NULL AND btrim(p.pm_name) <> ''
ON CONFLICT (project_id, staff_id, role) DO NOTHING;

INSERT INTO pjb_assignments (project_id, staff_id, role)
SELECT p.id, s.id, '品質管理' FROM pjb_projects p JOIN pjb_staff s ON s.name = btrim(p.qa_name)
WHERE p.qa_name IS NOT NULL AND btrim(p.qa_name) <> ''
ON CONFLICT (project_id, staff_id, role) DO NOTHING;

NOTIFY pgrst, 'reload schema';
