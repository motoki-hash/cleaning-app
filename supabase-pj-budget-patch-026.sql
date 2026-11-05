-- ============================================================================
-- PJ予算管理アプリ 026
-- 内容: スケジュールの「備考欄」を、版ごとに持てるようにする
--   （これまでは案件で1つ（概算・ゼロ工程表それぞれ1つ）で、版を変えても同じ内容が出ていた）
--   ・既存の版には、今の備考欄の内容をそのまま入れるので、見た目は変わりません
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- 何度実行しても重複しません。
-- ============================================================================

ALTER TABLE pjb_schedules ADD COLUMN IF NOT EXISTS notes TEXT;   -- 版の備考欄。空＝案件の備考欄を使う

UPDATE pjb_schedules s
SET notes = CASE WHEN s.kind = 'zero' THEN p.zero_notes ELSE p.schedule_notes END
FROM pjb_projects p
WHERE p.id = s.project_id AND s.notes IS NULL AND s.kind IN ('zero', 'rough');

NOTIFY pgrst, 'reload schema';
