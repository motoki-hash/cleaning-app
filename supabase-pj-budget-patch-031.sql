-- ============================================================================
-- PJ予算管理アプリ 031
-- 内容: FFE・OSE発注リストに「商品画像」を追加
--   ・pjb_ffe_items に image_url（画像のアドレス）の列を追加
--   ・画像の保存場所（Storage の ffe-images）を作る（5MBまで、jpg/png/webp/gif/avif のみ）
--   既存のデータには、一切手を加えません（何度実行しても安全です）。
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';

-- 画像の保存場所。ファイルの名前は推測できない（案件ID/品目ID/時刻）ので、アドレスを知っている人だけが見られる
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ffe-images', 'ffe-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

DROP POLICY IF EXISTS "ffe-images read" ON storage.objects;
DROP POLICY IF EXISTS "ffe-images insert" ON storage.objects;
DROP POLICY IF EXISTS "ffe-images update" ON storage.objects;
DROP POLICY IF EXISTS "ffe-images delete" ON storage.objects;
CREATE POLICY "ffe-images read" ON storage.objects FOR SELECT USING (bucket_id = 'ffe-images');
CREATE POLICY "ffe-images insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ffe-images');
CREATE POLICY "ffe-images update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ffe-images');
CREATE POLICY "ffe-images delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ffe-images');

NOTIFY pgrst, 'reload schema';
