-- ============================================================================
-- PJ予算管理アプリ パッチ 017
-- 内容: 案件に「事業」（illi Stays / illi Hotels / Kyo Residence / Setup Office）を持たせる
--       （案件一覧の絞り込み・並べ替え・事業別の売上／原価／利益の分析に使う）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_projects ADD COLUMN IF NOT EXISTS business TEXT;
CREATE INDEX IF NOT EXISTS idx_pjb_projects_business ON pjb_projects(business);

NOTIFY pgrst, 'reload schema';
