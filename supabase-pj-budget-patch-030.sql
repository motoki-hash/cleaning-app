-- ============================================================================
-- PJ予算管理アプリ 030
-- 内容: 案件のステータスに「未着手」を追加（まだ動いていない案件。売上などの集計には入れない）
--   ・案件ステータスの許可リストを「未着手・進行中・完了・保留」に広げる
--   ・既存の案件のステータスは、一切変わりません（何度実行しても安全です）。
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

-- いまの、ステータスの許可リスト（CHECK制約）を外す（名前が違っていても見つけて外します）
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pjb_projects'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE pjb_projects DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

ALTER TABLE pjb_projects
  ADD CONSTRAINT pjb_projects_status_check CHECK (status IN ('未着手', '進行中', '完了', '保留'));

NOTIFY pgrst, 'reload schema';
