-- ============================================================================
-- PJ予算管理アプリ パッチ 006
-- 内容: ゼロ工程表・概算スケジュールの表示期間（ヶ月数）を案件ごとに変更できるようにする
--       （初期値 12ヶ月）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS schedule_months INT NOT NULL DEFAULT 12;

NOTIFY pgrst, 'reload schema';
