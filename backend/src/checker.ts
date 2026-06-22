import targetsConfig from './check-targets.json';

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
};

type Env = {
  DB: any;
  ESTAT_APP_ID?: string;
};

const targets = targetsConfig.targets as TargetConfig[];

const saveResult = async (env: Env, result: CheckResult) => {
  await env.DB.prepare(
    `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    result.target,
    result.status,
    result.statusCode ?? null,
    result.responseTimeMs ?? null,
    result.error ?? null
  ).run();
};

const checkTarget = async (env: Env, target: TargetConfig): Promise<CheckResult> => {
  const lastChecked = new Date().toISOString();

  try {
    if (target.type === 'estat-api' && !env.ESTAT_APP_ID) {
      throw new Error('ESTAT_APP_ID is not set in env');
    }

    const url = target.url.replace(
      '{ESTAT_APP_ID}',
      encodeURIComponent(env.ESTAT_APP_ID ?? '')
    );
    const start = Date.now();
    const response = await fetch(url);
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
    return result;
  } catch (err: any) {
    const result: CheckResult = {
      target: target.name,
      status: 'down',
      lastChecked,
      error: err instanceof Error ? err.message : String(err)
    };
    await saveResult(env, result);
    return result;
  }
};

export const checkEndpoints = async (env: Env): Promise<CheckResult[]> =>
  Promise.all(targets.map((target) => checkTarget(env, target)));
