import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkEndpoints } from './checker.js';
import { handleLineWebhook, verifyLineSignature } from './line-webhook.js';
import { sendLineStatusReport } from './status-report-notifier.js';

type Bindings = {
  DB: any;
  ESTAT_APP_ID?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  DASHBOARD_URL?: string;
  NOTIFY_FAILURE_THRESHOLD?: string;
  NOTIFY_RECOVERY_THRESHOLD?: string;
  LINE_STATUS_REPORT_ENABLED?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_CACHE_TTL_SECONDS = 300;
const HISTORY_TODAY_CACHE_TTL_SECONDS = 300;
const HISTORY_PAST_CACHE_TTL_SECONDS = 3600;
const ALL_HISTORY_CACHE_TTL_SECONDS = 300;

const todayInJapan = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const cachedJson = async <T>(
  c: any,
  ttlSeconds: number,
  loadData: () => Promise<T>
) => {
  const cache = await caches.open('api-response-cache');
  const cacheKey = new Request(c.req.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const response = Response.json(
    {
      success: true,
      data: await loadData(),
    },
    {
      headers: {
        'Cache-Control': `public, max-age=${ttlSeconds}`,
        'CDN-Cache-Control': `max-age=${ttlSeconds}`,
      },
    }
  );

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/status', async (c) => {
  return cachedJson(c, STATUS_CACHE_TTL_SECONDS, async () => {
    const { results } = await c.env.DB.prepare(`
      SELECT *
      FROM latest
      ORDER BY target
    `).all();

    return results;
  });
});

app.get('/api/me', (c) => {
  const userId =
    c.req.header('cf-access-authenticated-user-email') ||
    c.req.header('cf-access-user-email') ||
    'anonymous';

  return c.json({
    success: true,
    data: { userId }
  });
});

app.post('/api/check-now', async (c) => {
  const results = await checkEndpoints(c.env);
  return c.json({
    success: true,
    data: results
  });
});

app.post('/api/line-webhook', async (c) => {
  const bodyText = await c.req.text();
  const signature = c.req.header('x-line-signature') ?? null;
  const isValid = await verifyLineSignature(
    bodyText,
    signature,
    c.env.LINE_CHANNEL_SECRET
  );

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid LINE signature' }, 401);
  }

  const count = await handleLineWebhook(c.env, JSON.parse(bodyText));
  return c.json({ success: true, count });
});

app.get('/api/history', async (c) => {
  return cachedJson(c, ALL_HISTORY_CACHE_TTL_SECONDS, async () => {
    const { results } = await c.env.DB.prepare(`
      SELECT *
      FROM logs
      ORDER BY createdAt DESC
      LIMIT 20000
    `).all();

    return results;
  });
});

app.get('/api/history/by-date', async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!startDate || !endDate || !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) || startDate > endDate) {
    return c.json({
      success: false,
      error: 'startDate and endDate must be YYYY-MM-DD values, with startDate on or before endDate.'
    }, 400);
  }

  const isTodayOnly = startDate === endDate && startDate === todayInJapan();
  const ttlSeconds = isTodayOnly
    ? HISTORY_TODAY_CACHE_TTL_SECONDS
    : HISTORY_PAST_CACHE_TTL_SECONDS;

  return cachedJson(c, ttlSeconds, async () => {
    const query = c.env.DB.prepare(`
      SELECT *
      FROM logs
      WHERE createdAt >= datetime(? || ' 00:00:00', '-9 hours')
        AND createdAt < datetime(? || ' 00:00:00', '+1 day', '-9 hours')
      ORDER BY createdAt DESC
      LIMIT 20000
    `).bind(startDate, endDate);
    const { results } = await query.all();

    return results;
  });
});

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Bindings, ctx: any) {
    ctx.waitUntil((async () => {
      const startedAt = new Date().toISOString();
      console.log(
        `[cron] started: cron=${event.cron ?? 'unknown'} scheduledTime=${event.scheduledTime ?? 'unknown'} startedAt=${startedAt}`
      );

      try {
        const results = await checkEndpoints(env);
        console.log(
          `[cron] checks completed: ${results
            .map((result) => `${result.target}=${result.status}${result.statusCode ? `(${result.statusCode})` : ''}`)
            .join(', ')}`
        );

        try {
          await sendLineStatusReport(env, results);
        } catch (err) {
          console.error('[cron] failed to send LINE status report', err);
        }
      } catch (err) {
        console.error('[cron] failed to run endpoint checks', err);
      }
    })());
  }
};
