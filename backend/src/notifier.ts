import type { CheckResult } from './checker';

export type NotificationEnv = {
  DB: any;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  DASHBOARD_URL?: string;
};

type NotificationKind = 'failure' | 'recovery';

const isLineEnabled = (env: NotificationEnv): boolean =>
  Boolean(env.LINE_CHANNEL_ACCESS_TOKEN);

const buildMessage = (
  kind: NotificationKind,
  result: CheckResult,
  consecutiveFailures: number,
  dashboardUrl?: string
): string => {
  const title = kind === 'failure' ? '障害検知' : '復旧検知';
  const lines = [
    `[e-Stat Health] ${title}`,
    '',
    kind === 'failure'
      ? `${result.target} で連続失敗が閾値に達しました。`
      : `${result.target} が復旧しました。`,
    '',
    `対象: ${result.target}`,
    `状態: ${result.status}`,
    `HTTPステータス: ${result.statusCode ?? 'N/A'}`,
    `連続失敗回数: ${consecutiveFailures}`,
    `確認時刻: ${result.lastChecked}`,
  ];

  if (result.responseTimeMs !== undefined) {
    lines.push(`応答時間: ${result.responseTimeMs} ms`);
  }

  if (result.error) {
    lines.push(`エラー: ${result.error}`);
  }

  if (dashboardUrl) {
    lines.push('', `Dashboard: ${dashboardUrl}`);
  }

  return lines.join('\n');
};

export const sendLineNotification = async (
  env: NotificationEnv,
  kind: NotificationKind,
  result: CheckResult,
  consecutiveFailures: number
): Promise<boolean> => {
  if (!isLineEnabled(env)) {
    return false;
  }

  const subscriberRows = await env.DB.prepare(`
    SELECT lineId
    FROM line_subscribers
    WHERE active = 1
    ORDER BY followedAt
  `).all();
  const results = (subscriberRows.results ?? []) as { lineId: string }[];

  if (!results.length) {
    return false;
  }

  const text = buildMessage(
    kind,
    result,
    consecutiveFailures,
    env.DASHBOARD_URL
  );

  await Promise.all(results.map(async ({ lineId }) => {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: lineId,
        messages: [
          {
            type: 'text',
            text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LINE Messaging API returned ${response.status}: ${body}`);
    }
  }));

  return true;
};
