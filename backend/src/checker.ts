export interface CheckResult {
  target: string;
  status: 'up' | 'down';
  statusCode?: number;
  responseTimeMs?: number;
  lastChecked: string;
  error?: string;
}

const ESTAT_WEB_URL = 'https://www.e-stat.go.jp/';

export const checkEndpoints = async (env: { DB: any; ESTAT_APP_ID: string }) => {
  const ESTAT_API_URL = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList?appId=${env.ESTAT_APP_ID}&statsNameList=Y`;
  
  const results = { web: null as any, api: null as any };

  try {
    const start = Date.now();
    const res = await fetch(ESTAT_WEB_URL);
    const end = Date.now();
    results.web = {
      target: 'e-Stat Web',
      status: res.status === 200 ? 'up' : 'down',
      statusCode: res.status,
      responseTimeMs: end - start,
      lastChecked: new Date().toISOString()
    };
    await env.DB.prepare(
      `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(results.web.target, results.web.status, results.web.statusCode, results.web.responseTimeMs, null).run();
  } catch (err: any) {
    results.web = {
      target: 'e-Stat Web',
      status: 'down',
      statusCode: null,
      lastChecked: new Date().toISOString(),
      error: err.message
    };
    await env.DB.prepare(
      `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(results.web.target, results.web.status, null, null, results.web.error).run();
  }

  try {
    if (!env.ESTAT_APP_ID) {
      throw new Error('ESTAT_APP_ID is not set in env');
    }
    const start = Date.now();
    const res = await fetch(ESTAT_API_URL);
    const end = Date.now();
    const data: any = await res.json();
    results.api = {
      target: 'e-Stat API',
      status: data?.GET_STATS_LIST?.RESULT?.STATUS === 0 ? 'up' : 'down',
      statusCode: res.status,
      responseTimeMs: end - start,
      lastChecked: new Date().toISOString(),
      error: data?.GET_STATS_LIST?.RESULT?.STATUS !== 0 ? data?.GET_STATS_LIST?.RESULT?.ERROR_MSG : undefined
    };
    await env.DB.prepare(
      `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(results.api.target, results.api.status, results.api.statusCode, results.api.responseTimeMs, results.api.error || null).run();
  } catch (err: any) {
    results.api = {
      target: 'e-Stat API',
      status: 'down',
      statusCode: null,
      lastChecked: new Date().toISOString(),
      error: err.message
    };
    await env.DB.prepare(
      `INSERT INTO logs (target, status, statusCode, responseTimeMs, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(results.api.target, results.api.status, null, null, results.api.error).run();
  }

  return results;
};
