import type { CheckResult } from './checker';

type StatusReportEnv = {
  DB: any;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  DASHBOARD_URL?: string;
  LINE_STATUS_REPORT_ENABLED?: string;
};

const enabledValues = new Set(['1', 'true', 'yes', 'on']);

const isStatusReportEnabled = (env: StatusReportEnv): boolean =>
  enabledValues.has((env.LINE_STATUS_REPORT_ENABLED ?? '').toLowerCase());

const buildStatusReportMessage = (
  results: CheckResult[],
  dashboardUrl?: string
): string => {
  const checkedAt = new Date().toISOString();
  const downCount = results.filter((result) => result.status === 'down').length;
  const lines = [
    '[e-Stat Health] 定期ステータス確認',
    '',
    `確認時刻: ${checkedAt}`,
    `対象数: ${results.length}`,
    `正常: ${results.length - downCount}`,
    `異常: ${downCount}`,
    '',
    ...results.flatMap((result) => {
      const details = [
        `- ${result.target}: ${result.status.toUpperCase()}`,
        `  HTTPステータス: ${result.statusCode ?? 'N/A'}`,
      ];

      if (result.responseTimeMs !== undefined) {
        details.push(`  応答時間: ${result.responseTimeMs} ms`);
      }

      if (result.error) {
        details.push(`  エラー: ${result.error}`);
      }

      return details;
    }),
  ];

  if (dashboardUrl) {
    lines.push('', `Dashboard: ${dashboardUrl}`);
  }

  return lines.join('\n');
};

export const sendLineStatusReport = async (
  env: StatusReportEnv,
  results: CheckResult[]
): Promise<boolean> => {
  if (!isStatusReportEnabled(env) || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    return false;
  }

  const subscriberRows = await env.DB.prepare(`
    SELECT lineId
    FROM line_subscribers
    WHERE active = 1
    ORDER BY followedAt
  `).all();
  const subscribers = (subscriberRows.results ?? []) as { lineId: string }[];

  if (!subscribers.length) {
    return false;
  }

  const text = buildStatusReportMessage(results, env.DASHBOARD_URL);

  await Promise.all(subscribers.map(async ({ lineId }) => {
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
