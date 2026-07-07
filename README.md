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

## LINE通知

Cronチェックで一定回数連続して正常ステータスを確認できなかった場合、LINE Messaging API経由で通知できます。
通知後は同じ障害で繰り返し送信せず、復旧時に復旧通知を送ります。

`backend/.dev.vars` に以下を設定してください。

```bash
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
DASHBOARD_URL=http://localhost:5173
NOTIFY_FAILURE_THRESHOLD=3
```

- `NOTIFY_FAILURE_THRESHOLD`: 通知するまでの連続失敗回数です。初期値は `3` です。Cronは `backend/wrangler.toml` で10分ごとに実行されるため、`3` の場合は約30分連続失敗で通知します。
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Developers Consoleで作成したMessaging APIチャネルのチャネルアクセストークンです。
- `LINE_CHANNEL_SECRET`: LINE Developers ConsoleのBasic settingsで確認できるチャネルシークレットです。Webhook署名検証に使います。
- LINE Developers ConsoleのWebhook URLに `https://<backend worker domain>/api/line-webhook` を設定してください。友だち追加、メッセージ送信、ブロック、グループ参加のイベントを受け取り、通知先をD1に保存します。
- LINE通知を使わない環境では、`LINE_CHANNEL_ACCESS_TOKEN` を未設定にできます。その場合も連続失敗状態はD1に記録されます。

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
