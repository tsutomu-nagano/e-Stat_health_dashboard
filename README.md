# e-Stat Health Check Dashboard

e-Statの稼働状況を確認するダッシュボードアプリケーションです。
バックエンドはHono、フロントエンドはReact (Vite) を使用しています。

## 必須要件

- docker がインストールされていること
- docker compose がインストールされていること

## セットアップ手順

### 1. バックエンドのセットアップ

1. `backend` フォルダに移動します。
   ```bash
   cd backend
   ```
2. 環境変数ファイルを作成します。`.dev.vars.example` をコピーして `.dev.vars` ファイルを作成し、e-StatのアプリケーションIDを設定してください。
   ```bash
   cp .dev.vars.example .dev.vars
   # .dev.vars を編集し、ESTAT_APP_ID=あなたのアプリID に変更
   ```

### 2. docker image のビルド

1. docker compose で Build します。
   ```bash
   docker compose build --no-cache
   ```

### 3. コンテナの起動

1. docker compose で Build します。
   ```bash
   docker compose up -d
   ```
2. コンソールに表示されたURL (通常は http://localhost:5173 ) にブラウザでアクセスしてください。プレミアムなダークモードのダッシュボードが表示されます。
