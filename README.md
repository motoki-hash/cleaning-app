# 清掃管理システム

民泊施設の清掃管理Webアプリケーション

## 機能概要

- 施設27件、客室約100室の管理
- 清掃会社3社による清掃記録
- 清掃前後の写真アップロード
- トラブル報告と追跡
- PWA対応（スマホのホーム画面に追加可能）

## 技術スタック

- **フロントエンド**: Next.js 14, TypeScript, Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL, Auth, Storage)
- **PWA**: Service Worker, Web Manifest

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. Supabaseのセットアップ

`supabase-schema.sql` をSupabaseのSQL Editorで実行してテーブルを作成します。

#### 手順:
1. [Supabase Dashboard](https://app.supabase.com) にログイン
2. プロジェクト選択: `https://ilurxcoxajeoxujattar.supabase.co`
3. 左メニューから「SQL Editor」を選択
4. 「New query」をクリック
5. `supabase-schema.sql` の内容をコピー&ペースト
6. 「Run」をクリックして実行

#### ストレージバケットの作成:
1. 左メニューから「Storage」を選択
2. 「Create a new bucket」をクリック
3. Bucket name: `cleaning-photos`
4. Public bucket: `ON` (公開)
5. 「Create bucket」をクリック

### 3. 環境変数の設定

`.env.local` ファイルは既に設定済みです。

```
NEXT_PUBLIC_SUPABASE_URL=https://ilurxcoxajeoxujattar.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## データベース設計

### テーブル一覧

- **facilities** - 施設マスタ
- **rooms** - 客室マスタ
- **cleaning_companies** - 清掃会社マスタ
- **cleaners** - 清掃員マスタ
- **cleaning_records** - 清掃記録
- **cleaning_photos** - 清掃写真
- **trouble_reports** - トラブル報告

詳細は `supabase-schema.sql` を参照してください。

## ディレクトリ構成

```
cleaning-app/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx           # トップページ
│   └── globals.css        # グローバルスタイル
├── lib/                   # ユーティリティ
│   └── supabase.ts        # Supabase クライアント設定
├── public/                # 静的ファイル
│   ├── manifest.json      # PWA マニフェスト
│   └── sw.js             # Service Worker
├── supabase-schema.sql   # データベーススキーマ
├── .env.local            # 環境変数
├── next.config.js        # Next.js 設定
├── tailwind.config.ts    # Tailwind CSS 設定
└── tsconfig.json         # TypeScript 設定
```

## PWA としてインストール

### iOS (Safari)
1. Safariでアプリを開く
2. 共有ボタン(□↑)をタップ
3. 「ホーム画面に追加」を選択

### Android (Chrome)
1. Chromeでアプリを開く
2. メニュー(⋮)をタップ
3. 「ホーム画面に追加」を選択

## 今後の実装予定

- [ ] 認証機能（ログイン/ログアウト）
- [ ] 施設・客室の一覧・詳細・登録画面
- [ ] 清掃記録の登録・更新画面
- [ ] 写真アップロード機能
- [ ] トラブル報告の作成・管理画面
- [ ] ダッシュボード（統計情報）
- [ ] プッシュ通知
- [ ] オフライン対応

## ライセンス

Private
