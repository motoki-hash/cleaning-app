-- ============================================================================
-- PJ予算管理アプリ パッチ 019
-- 内容: 事業の「illi Stays」「illi Hotels」を「illi Stays & Hotels」にまとめる
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

UPDATE pjb_projects SET business = 'illi Stays & Hotels' WHERE business IN ('illi Stays', 'illi Hotels');
