-- ============================================================================
-- PJ予算管理アプリ パッチ 022
-- 内容: 1つの案件の中に「期」（1期・2期…）を持てるようにする
--   ・期ごとに、予算・発注・売上計上月・スケジュール・担当を別々に持つ
--   ・同じ案件の期は group_id でひとまとめにする（期なしの案件は group_id が空のまま）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- 何度実行しても重複しません。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS group_id UUID;        -- 同じ案件の期をまとめるID（期なし＝空）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS period_no INT;        -- 期の並び順（1, 2, …）
ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS period_label TEXT;    -- 期の名前（例：1期、2期）
CREATE INDEX IF NOT EXISTS idx_pjb_projects_group ON pjb_projects(group_id);

NOTIFY pgrst, 'reload schema';
