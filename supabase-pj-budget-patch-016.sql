-- ============================================================================
-- PJ予算管理アプリ パッチ 016
-- 内容: VE/CD候補を、スプレッドシート（VE/CD表）のように、元値と変更金額で比べられるようにする
--   - 図面番号 / 元値（現状金額）/ 変更金額 / 設計会社コメント の欄を追加
--   - 今ある候補の「削減予定額」は、元値として移す（変更金額は0。想定増減金額は、今までの削減額のまま）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_ve_items ADD COLUMN IF NOT EXISTS drawing_no TEXT;
ALTER TABLE pjb_ve_items ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14,0) NOT NULL DEFAULT 0;   -- 元値（現状金額）
ALTER TABLE pjb_ve_items ADD COLUMN IF NOT EXISTS changed_amount NUMERIC(14,0) NOT NULL DEFAULT 0;    -- 変更金額
ALTER TABLE pjb_ve_items ADD COLUMN IF NOT EXISTS designer_comment TEXT;

UPDATE pjb_ve_items
SET original_amount = planned_reduction
WHERE original_amount = 0 AND changed_amount = 0 AND planned_reduction <> 0;

NOTIFY pgrst, 'reload schema';
