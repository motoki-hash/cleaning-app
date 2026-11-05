-- ============================================================================
-- PJ予算管理アプリ 027
-- 内容: スケジュールの「OPEN予定（週）」と「OPENの列に出す文言」を、版ごとに持てるようにする
--   （これまでは案件で1つで、ある版で日程を変えると、ほかの版にも反映されていた）
--   ・既存の版には、今の案件の設定をそのまま入れるので、見た目は変わりません
--   ・列を追加したときだけ、今の設定を各版にコピーします（2回目以降の実行では何も変わりません）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pjb_schedules' AND column_name = 'open_week'
  ) THEN
    ALTER TABLE pjb_schedules ADD COLUMN open_week INT;      -- OPEN予定の週（0始まり）。空＝未設定
    ALTER TABLE pjb_schedules ADD COLUMN open_label TEXT;    -- OPENの列に出す文言。空＝OPEN

    UPDATE pjb_schedules s
    SET open_week = CASE WHEN s.kind = 'zero' THEN p.zero_open_week ELSE p.schedule_open_week END,
        open_label = p.schedule_open_label
    FROM pjb_projects p
    WHERE p.id = s.project_id AND s.kind IN ('zero', 'rough');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
