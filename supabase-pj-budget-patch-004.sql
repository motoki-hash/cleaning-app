-- ============================================================================
-- PJ予算管理アプリ パッチ 004
-- 内容: スケジュール管理（概算スケジュール / OPEN前スケジュール）
--   - pjb_projects にスケジュール用の項目を追加
--   - pjb_schedule_tasks（工程の行）と pjb_schedule_bars（行ごとのバー）を追加
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS schedule_base_date DATE;      -- 概算スケジュールの1ヶ月目の開始日
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS schedule_open_week INT;       -- 概算スケジュールのOPEN週（0始まり、1ヶ月=4週）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS open_date DATE;               -- 基準OPEN日（OPEN前スケジュール）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS preopen_start_date DATE;      -- OPEN前スケジュールの表示開始日
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS schedule_notes TEXT
  DEFAULT E'※ 本工程は概算スケジュールです。設計・行政協議・施工条件等により変更となる場合があります。\n※ 本工事はゼロ工程にあたるため、土日祝日を考慮していません。カレンダーにより工期が伸びる可能性がございます。';

CREATE TABLE pjb_schedule_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rough', 'preopen')),
  sort_order INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',   -- 区分
  name TEXT NOT NULL,                  -- 工程 / タスク
  assignee TEXT NOT NULL DEFAULT '',   -- 担当（OPEN前スケジュール）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pjb_schedule_bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pjb_schedule_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rough', 'preopen')),
  start_week INT,        -- 概算: 0始まりの週番号（1ヶ月=4週）
  length_weeks INT,      -- 概算: 期間（週）
  start_date DATE,       -- OPEN前: 開始日
  end_date DATE,         -- OPEN前: 終了日（含む）
  label TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pjb_schedule_tasks_project ON pjb_schedule_tasks(project_id, kind, sort_order);
CREATE INDEX idx_pjb_schedule_bars_project ON pjb_schedule_bars(project_id, kind);
CREATE INDEX idx_pjb_schedule_bars_task ON pjb_schedule_bars(task_id);

ALTER TABLE pjb_schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pjb_schedule_bars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_schedule_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON pjb_schedule_bars FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
