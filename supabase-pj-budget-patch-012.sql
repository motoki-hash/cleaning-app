-- ============================================================================
-- PJ予算管理アプリ パッチ 012
-- 内容: 見積書・契約書・請求書などのファイルを案件ごとに保管できるようにする
--   - ファイルの置き場所（Storage の pjb-files バケット。非公開）
--   - 保管したファイルの一覧用テーブル pjb_documents
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pjb_projects(id) ON DELETE CASCADE,
  order_id UUID REFERENCES pjb_orders(id) ON DELETE SET NULL,   -- 関連する内訳（発注）。なくてもよい
  doc_type TEXT NOT NULL DEFAULT 'その他',                       -- 見積書 / 契約書 / 請求書 / 図面 / その他
  file_path TEXT NOT NULL,                                       -- Storage 内の保存先
  file_name TEXT NOT NULL,                                       -- 元のファイル名
  content_type TEXT,
  size_bytes BIGINT,
  note TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pjb_documents_project ON pjb_documents(project_id, uploaded_at DESC);

ALTER TABLE pjb_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON pjb_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ファイルの置き場所（非公開。ログインしている人だけが読み書きできる）
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pjb-files', 'pjb-files', false, 52428800)   -- 1ファイル50MBまで
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pjb files authenticated access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'pjb-files')
  WITH CHECK (bucket_id = 'pjb-files');

NOTIFY pgrst, 'reload schema';
