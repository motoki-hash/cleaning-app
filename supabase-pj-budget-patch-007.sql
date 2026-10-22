-- ============================================================================
-- PJ予算管理アプリ パッチ 007
-- 内容: PINだけでログインするための、ログイン失敗の記録テーブル
--       （サーバー側だけが読み書きする。RLSを有効にして、ポリシーは作らない）
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

CREATE TABLE IF NOT EXISTS pjb_login_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pjb_login_attempts_ip ON pjb_login_attempts(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pjb_login_attempts_created ON pjb_login_attempts(created_at DESC);

-- ポリシーを作らないので、ブラウザ（anon / authenticated）からは一切読み書きできない。
-- サーバーが使う service_role だけが操作できる。
ALTER TABLE pjb_login_attempts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
