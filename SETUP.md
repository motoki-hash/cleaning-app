# セットアップ手順

## 1. 依存パッケージのインストール

プロジェクトディレクトリで以下を実行:

```bash
cd /Users/motokiisaka/cleaning-app
npm install
```

## 2. Supabase データベースのセットアップ

### テーブル作成

1. Supabase Dashboard にアクセス
   - URL: https://app.supabase.com
   
2. プロジェクトを選択
   - Project URL: https://ilurxcoxajeoxujattar.supabase.co

3. SQL Editor を開く
   - 左メニューから「SQL Editor」を選択
   - 「New query」をクリック

4. `supabase-schema.sql` の内容を実行
   - ファイルの内容をコピー
   - SQL Editorに貼り付け
   - 「Run」または「F5」で実行

### ストレージバケットの作成

1. 左メニューから「Storage」を選択

2. 新しいバケットを作成
   - 「Create a new bucket」をクリック
   - Bucket name: `cleaning-photos`
   - Public bucket: **ON** (チェックを入れる)
   - 「Create bucket」をクリック

3. バケットのポリシー設定
   - 作成したバケット `cleaning-photos` を選択
   - 「Policies」タブを開く
   - 「New Policy」をクリック
   - 以下のポリシーを追加:

#### アップロードポリシー (INSERT):
```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cleaning-photos');
```

#### 読み取りポリシー (SELECT):
```sql
CREATE POLICY "Allow public access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'cleaning-photos');
```

## 3. 環境変数の確認

`.env.local` ファイルが正しく設定されているか確認:

```
NEXT_PUBLIC_SUPABASE_URL=https://ilurxcoxajeoxujattar.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

## 5. 初期データの投入（オプション）

テスト用の初期データを投入する場合は、以下のSQLを実行:

```sql
-- 清掃会社の登録
INSERT INTO cleaning_companies (name, contact_person, phone, email) VALUES
('清掃会社A', '山田太郎', '03-1234-5678', 'yamada@company-a.jp'),
('清掃会社B', '佐藤花子', '03-2345-6789', 'sato@company-b.jp'),
('清掃会社C', '鈴木一郎', '03-3456-7890', 'suzuki@company-c.jp');

-- 施設の登録
INSERT INTO facilities (name, address, contact_phone) VALUES
('グランドホテル東京', '東京都千代田区丸の内1-1-1', '03-0000-0001'),
('シティアパートメント渋谷', '東京都渋谷区渋谷2-2-2', '03-0000-0002'),
('リゾートヴィラ箱根', '神奈川県箱根町強羅3-3-3', '0460-00-0003');

-- 客室の登録（例: グランドホテル東京の10室）
INSERT INTO rooms (facility_id, room_number, room_type, floor) 
SELECT 
  f.id,
  '10' || generate_series(1, 10)::text,
  CASE WHEN generate_series % 3 = 0 THEN 'suite' 
       WHEN generate_series % 2 = 0 THEN 'double' 
       ELSE 'single' END,
  (generate_series - 1) / 10 + 1
FROM facilities f
WHERE f.name = 'グランドホテル東京';
```

## トラブルシューティング

### npm install でエラーが出る場合

npmキャッシュの権限問題の可能性があります:

```bash
# キャッシュをクリア
npm cache clean --force

# または、キャッシュディレクトリの権限を修正
sudo chown -R $(whoami) ~/.npm
```

### Supabaseに接続できない場合

1. `.env.local` の設定を確認
2. Supabase Dashboard でプロジェクトが正しく選択されているか確認
3. API Keyが正しいか確認 (Settings > API)

### PWAとしてインストールできない場合

1. HTTPSで配信されているか確認（開発環境はlocalhost可）
2. manifest.jsonが正しく読み込まれているか確認
3. Service Workerが登録されているか確認

## 次のステップ

セットアップが完了したら、以下の機能を実装していきます:

1. 認証機能の実装
2. 施設・客室管理画面の作成
3. 清掃記録の登録・一覧画面
4. 写真アップロード機能
5. トラブル報告機能
6. ダッシュボード

## PJ予算管理アプリ（/pjb）のセットアップ

清掃管理とは別ドメインの「PJ予算管理アプリ」を同じ Next.js アプリ内に `/pjb` 以下として追加しています。
同じ Supabase プロジェクトを使い回しつつ、テーブル名は `pjb_` プレフィックスで分離しています。

1. Supabase Dashboard の SQL Editor で `supabase-pj-budget-schema.sql` の内容を実行する
2. `/pjb` にアクセスし、PIN（6桁）を入力してログインする（メールアドレス・パスワードは不要。下の「PINログインの設定」を先に行う）
3. 「＋ 新規案件」からプロジェクトを作成すると、Excelを踏襲した予算カテゴリーのひな形が自動生成される

現時点（Phase 1）ではログイン済みユーザーは全操作が可能です。Admin/Manager/PM/Viewerの権限分離は
`pjb_user_roles` テーブルを土台に Phase 2 で実装します。

### PINログインの設定（全員共通の6桁PIN）

`/pjb` は、メールアドレスやパスワードではなく **6桁のPINだけ** で入ります。PINの照合はサーバー側
（`app/api/pjb/login/route.ts`）で行い、正しいときだけ共有アカウントでSupabaseにログインします。

1. Supabase の SQL Editor で `supabase-pj-budget-patch-007.sql` を実行する（ログイン失敗の記録テーブル）
2. 次の環境変数を、**ローカルの `.env.local`** と **Vercel の Environment Variables** の両方に設定する
   | 名前 | 内容 |
   |---|---|
   | `PJB_LOGIN_PIN` | 全員で使う6桁の数字（例：自分で決める） |
   | `PJB_SESSION_SECRET` | 長いランダムな文字列（`openssl rand -hex 32` で作る）。共有アカウントのパスワードを作るために使う。一度決めたら変えない |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API の `service_role` キー（誰にも見せない） |
3. 環境変数を変えたら、ローカルは開発サーバーを再起動、Vercel は再デプロイする
4. 初めて正しいPINが入力されたとき、共有アカウント（`pjb-shared@barenotestudio.com`）が自動で作られる

仕様:
- 失敗は、同じ場所から15分間に5回まで、全体で60分間に30回までで、いずれも超えると一時的にログインできなくなる
- 30分間操作がないと、自動でログアウトしてPIN入力に戻る
- PINを変えるときは `PJB_LOGIN_PIN` を書き換えて再デプロイする（配り直しが必要）
- 誰が操作したかは記録されない（共通PINのため）。メンバー別にしたい場合は別途対応が必要
