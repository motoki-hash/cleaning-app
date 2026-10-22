-- ============================================================================
-- PJ予算管理アプリ パッチ 005
-- 内容: スケジュールに「ゼロ工程表」を追加（日付・祝日を考慮しない 1ヶ月＝4週のグリッド）
--   - pjb_schedule_tasks / pjb_schedule_bars の kind に 'zero' を追加
--   - pjb_projects に ゼロ工程表用のOPEN週・備考欄を追加
--   - 概算スケジュールの備考欄の初期文言を「日付・大型連休を考慮する」内容に変更
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_schedule_tasks DROP CONSTRAINT IF EXISTS pjb_schedule_tasks_kind_check;
ALTER TABLE pjb_schedule_tasks ADD CONSTRAINT pjb_schedule_tasks_kind_check CHECK (kind IN ('zero', 'rough', 'preopen'));
ALTER TABLE pjb_schedule_bars DROP CONSTRAINT IF EXISTS pjb_schedule_bars_kind_check;
ALTER TABLE pjb_schedule_bars ADD CONSTRAINT pjb_schedule_bars_kind_check CHECK (kind IN ('zero', 'rough', 'preopen'));

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS zero_open_week INT;
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS zero_notes TEXT
  DEFAULT E'※ 本工程は概算スケジュールです。設計・行政協議・施工条件等により変更となる場合があります。\n※ 本工事はゼロ工程にあたるため、土日祝日を考慮していません。カレンダーにより工期が伸びる可能性がございます。';

-- 概算スケジュール（日付あり）の備考欄: 既に初期文言のままのものを新しい文言に差し替える
UPDATE pjb_projects
SET schedule_notes = E'※ 本工程は概算スケジュールです。設計・行政協議・施工条件等により変更となる場合があります。\n※ 土日祝日・大型連休（GW・お盆・シルバーウィーク・年末年始）を考慮しています。実際の工期は業者との協議により変動します。'
WHERE schedule_notes LIKE '%ゼロ工程にあたるため%';

ALTER TABLE pjb_projects ALTER COLUMN schedule_notes SET DEFAULT
  E'※ 本工程は概算スケジュールです。設計・行政協議・施工条件等により変更となる場合があります。\n※ 土日祝日・大型連休（GW・お盆・シルバーウィーク・年末年始）を考慮しています。実際の工期は業者との協議により変動します。';

NOTIFY pgrst, 'reload schema';
