-- ============================================================================
-- PJ予算管理アプリ パッチ 009
-- 内容: スケジュールの「雛形」を、既存の案件の内容から保存できるようにする
--       （ゼロ工程表・概算スケジュール・OPEN前スケジュールの3種類。種類ごとに1つ）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_schedule_templates (
  kind TEXT PRIMARY KEY CHECK (kind IN ('zero', 'rough', 'preopen')),
  data JSONB NOT NULL,                 -- { tasks: [{category, name, assignee, bars: [...]}], open_week }
  anchor TEXT,                         -- OPEN前スケジュールのみ: 日付の基準（'open'=OPEN日 / 'start'=表示開始日）
  source_project_name TEXT,            -- 雛形のもとにした案件名
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pjb_schedule_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_schedule_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
