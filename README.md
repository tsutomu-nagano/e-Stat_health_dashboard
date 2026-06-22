# e-Stat Health Check Dashboard

e-Statの稼働状況を確認するダッシュボードアプリケーションです。
バックエンドはHono、フロントエンドはReact (Vite) を使用しています。

## 監視対象の追加

[`backend/src/check-targets.json`](backend/src/check-targets.json) を編集すると、監視カードと応答時間グラフに対象を追加できます。

- `type: "http"`: 指定URLが期待するHTTPステータスを返すか確認します。ログイン画面については、画面へ到達できるかを確認する用途です。
- `type: "estat-api"`: HTTPステータスに加え、e-Stat APIの `RESULT.STATUS === 0` を確認します。URL内の `{ESTAT_APP_ID}` は環境変数で置換されます。
- `acceptableStatusCodes`: 正常とみなすHTTPステータスコードの配列です。

例:

```json
{
  "id": "example",
  "name": "Example",
  "type": "http",
  "url": "https://example.com/",
  "acceptableStatusCodes": [200]
}
```

miripo と e-Micro のログイン画面は初期設定に含まれています。これはログインページの到達性を監視するもので、実際のアカウント認証までは行いません。

## 必須要件

- docker がインストールされていること
- docker compose がインストールされていること

## セットアップ手順

### 1. バックエンドのセットアップ

1. `backend` フォルダに移動します。
2. 環境変数ファイルを作成します。`.dev.vars.example` をコピーして `.dev.vars` ファイルを作成し、e-StatのアプリケーションIDを設定してください。

```bash
cd backend
cp .dev.vars.example .dev.vars
# .dev.vars を編集し、ESTAT_APP_ID=あなたのアプリID に変更
```

### 2. docker image のビルド

```bash
docker compose build --no-cache
```

### 3. コンテナの起動

```bash
docker compose up -d
```

コンソールに表示されたURL（通常は http://localhost:5173 ）にアクセスしてください。

## Note

このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。
