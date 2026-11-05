-- ============================================================================
-- PJ予算管理アプリ 024
-- 内容: スケジュールの「表示する期間（1ヶ月目から）」を、版ごとに持てるようにする
--   （これまでは案件で1つだけで、版を切り替えたりコピーしたりすると期間が揃わなかった）
--   ・既存の版には、今の案件の期間をそのまま入れるので、見た目は変わりません
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- 何度実行しても重複しません。
-- ============================================================================

ALTER TABLE pjb_schedules ADD COLUMN IF NOT EXISTS months INT;   -- 版の表示期間（ヶ月）。空＝案件の設定を使う

UPDATE pjb_schedules s
SET months = COALESCE(p.schedule_months, 12)
FROM pjb_projects p
WHERE p.id = s.project_id AND s.months IS NULL;

NOTIFY pgrst, 'reload schema';
