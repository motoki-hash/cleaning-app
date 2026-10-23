-- ============================================================================
-- PJ予算管理アプリ 010
-- 内容: スケジュールを、1つの案件の中で複数の「版」（例：社内用・投資家用）に分けて持てるようにする
--   - pjb_schedules（版）を追加
--   - pjb_schedule_tasks / pjb_schedule_bars に schedule_id を追加
--   - 今あるスケジュールは、種類ごとに「標準」という名前の版にまとめる（名前はあとで変えられる）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('zero', 'rough', 'preopen')),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pjb_schedules_project ON pjb_schedules(project_id, kind, sort_order);

ALTER TABLE pjb_schedule_tasks ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES pjb_schedules(id) ON DELETE CASCADE;
ALTER TABLE pjb_schedule_bars  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES pjb_schedules(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pjb_schedule_tasks_schedule ON pjb_schedule_tasks(schedule_id);
CREATE INDEX IF NOT EXISTS idx_pjb_schedule_bars_schedule ON pjb_schedule_bars(schedule_id);

-- 今あるスケジュールを「標準」の版にまとめる
INSERT INTO pjb_schedules (project_id, kind, name, sort_order)
SELECT DISTINCT t.project_id, t.kind, '標準', 0
FROM pjb_schedule_tasks t
WHERE NOT EXISTS (SELECT 1 FROM pjb_schedules s WHERE s.project_id = t.project_id AND s.kind = t.kind);

UPDATE pjb_schedule_tasks t SET schedule_id = s.id
FROM pjb_schedules s
WHERE s.project_id = t.project_id AND s.kind = t.kind AND t.schedule_id IS NULL;

UPDATE pjb_schedule_bars b SET schedule_id = s.id
FROM pjb_schedules s
WHERE s.project_id = b.project_id AND s.kind = b.kind AND b.schedule_id IS NULL;

ALTER TABLE pjb_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
