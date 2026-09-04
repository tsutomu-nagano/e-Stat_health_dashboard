import targetsConfig from './check-targets.json';
import { sendLineNotification, type NotificationEnv } from './notifier';

export interface CheckResult {
  target: string;
  status: 'up' | 'down';
  statusCode?: number;
  responseTimeMs?: number;
  lastChecked: string;
  error?: string;
}

type TargetConfig = {
  id: string;
  name: string;
  type: 'http' | 'estat-api';
  url: string;
  acceptableStatusCodes?: number[];
  timeoutMs?: number;
};

type Env = {
  DB: any;
  ESTAT_APP_ID?: string;
  NOTIFY_FAILURE_THRESHOLD?: string;
  NOTIFY_RECOVERY_THRESHOLD?: string;
} & NotificationEnv;

type NotificationState = {
  target: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  notifiedAt: string | null;
  recoveredAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  updatedAt: string;
};

const targets = targetsConfig.targets as TargetConfig[];
const DEFAULT_CHECK_TIMEOUT_MS = 120000;

const saveResult = async (env: Env, result: CheckResult) => {
  const values = [
    result.target,
    result.status,
    result.statusCode ?? null,
    result.responseTimeMs ?? null,
    result.error ?? null
  ];

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(...values),
    env.DB.prepare(`
      INSERT INTO latest (target, status, statusCode, responseTimeMs, error, createdAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(target) DO UPDATE SET
        status = excluded.status,
        statusCode = excluded.statusCode,
        responseTimeMs = excluded.responseTimeMs,
        error = excluded.error,
        createdAt = CURRENT_TIMESTAMP
    `).bind(...values)
  ]);
};

const failureThreshold = (env: Env): number => {
  const parsed = Number(env.NOTIFY_FAILURE_THRESHOLD ?? '3');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
};

const recoveryThreshold = (env: Env): number => {
  const parsed = Number(env.NOTIFY_RECOVERY_THRESHOLD ?? '1');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const getNotificationState = async (
  env: Env,
  target: string
): Promise<NotificationState | null> => {
  const state = await env.DB.prepare(
    `SELECT * FROM notification_states WHERE target = ?`
  ).bind(target).first() as NotificationState | null;

  return state ?? null;
};

const upsertNotificationState = async (
  env: Env,
  result: CheckResult,
  consecutiveFailures: number,
  consecutiveSuccesses: number,
  notifiedAt: string | null,
  recoveredAt: string | null
) => {
  await env.DB.prepare(`
    INSERT INTO notification_states (
      target,
      consecutiveFailures,
      consecutiveSuccesses,
      notifiedAt,
      recoveredAt,
      lastStatusCode,
      lastError,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(target) DO UPDATE SET
      consecutiveFailures = excluded.consecutiveFailures,
      consecutiveSuccesses = excluded.consecutiveSuccesses,
      notifiedAt = excluded.notifiedAt,
      recoveredAt = excluded.recoveredAt,
      lastStatusCode = excluded.lastStatusCode,
      lastError = excluded.lastError,
      updatedAt = CURRENT_TIMESTAMP
  `).bind(
    result.target,
    consecutiveFailures,
    consecutiveSuccesses,
    notifiedAt,
    recoveredAt,
    result.statusCode ?? null,
    result.error ?? null
  ).run();
};

const handleNotificationState = async (env: Env, result: CheckResult) => {
  try {
    const state = await getNotificationState(env, result.target);
    const now = new Date().toISOString();

    if (result.status === 'up') {
      if (state?.notifiedAt) {
        const consecutiveSuccesses = (state.consecutiveSuccesses ?? 0) + 1;
        if (consecutiveSuccesses >= recoveryThreshold(env)) {
          const sent = await sendLineNotification(
            env,
            'recovery',
            result,
            consecutiveSuccesses
          );
          if (sent) {
            await upsertNotificationState(env, result, 0, 0, null, now);
            return;
          }
        }

        await upsertNotificationState(
          env,
          result,
          0,
          consecutiveSuccesses,
          state.notifiedAt,
          state.recoveredAt
        );
        return;
      }

      await upsertNotificationState(env, result, 0, 0, null, now);
      return;
    }

    const consecutiveFailures = (state?.consecutiveFailures ?? 0) + 1;
    let notifiedAt = state?.notifiedAt ?? null;

    if (consecutiveFailures >= failureThreshold(env) && !notifiedAt) {
      const sent = await sendLineNotification(
        env,
        'failure',
        result,
        consecutiveFailures
      );
      if (sent) {
        notifiedAt = now;
      }
    }

    await upsertNotificationState(
      env,
      result,
      consecutiveFailures,
      0,
      notifiedAt,
      state?.recoveredAt ?? null
    );
  } catch (err) {
    console.error('Failed to process notification state', err);
  }
};

const checkTarget = async (env: Env, target: TargetConfig): Promise<CheckResult> => {
  const lastChecked = new Date().toISOString();
  console.log(`[check] ${target.name} started`);
  const timeoutMs = target.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (target.type === 'estat-api' && !env.ESTAT_APP_ID) {
      throw new Error('ESTAT_APP_ID is not set in env');
    }

    const url = target.url.replace(
      '{ESTAT_APP_ID}',
      encodeURIComponent(env.ESTAT_APP_ID ?? '')
    );
    const start = Date.now();
    const response = await fetch(url, {
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - start;
    const expectedStatus = target.acceptableStatusCodes ?? [200];
    let status: CheckResult['status'] = expectedStatus.includes(response.status) ? 'up' : 'down';
    let error: string | undefined;

    if (target.type === 'estat-api') {
      const data: any = await response.json();
      if (data?.GET_STATS_LIST?.RESULT?.STATUS !== 0) {
        status = 'down';
        error = data?.GET_STATS_LIST?.RESULT?.ERROR_MSG ?? 'e-Stat API returned an error';
      }
    }

    if (status === 'down' && !error) {
      error = `Unexpected HTTP status: ${response.status}`;
    }

    const result: CheckResult = {
      target: target.name,
      status,
      statusCode: response.status,
      responseTimeMs,
      lastChecked,
      error
    };
    await saveResult(env, result);
    console.log(`[check] ${target.name} saved: ${result.status}${result.statusCode ? `(${result.statusCode})` : ''}`);
    await handleNotificationState(env, result);
    return result;
  } catch (err: any) {
    const isTimeout =
      err instanceof Error &&
      (err.name === 'AbortError' || controller.signal.aborted);
    const result: CheckResult = {
      target: target.name,
      status: 'down',
      lastChecked,
      responseTimeMs: isTimeout ? timeoutMs : undefined,
      error: isTimeout
        ? `Request timed out after ${timeoutMs} ms`
        : err instanceof Error
          ? err.message
          : String(err)
    };
    await saveResult(env, result);
    console.log(`[check] ${target.name} saved: ${result.status} error=${result.error ?? 'unknown'}`);
    await handleNotificationState(env, result);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const checkEndpoints = async (env: Env): Promise<CheckResult[]> =>
  Promise.all(targets.map((target) => checkTarget(env, target)));
