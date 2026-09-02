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
  LINE_STATUS_REPORT_ENABLED?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/status', async (c) => {
  const todayStart = "datetime('now', 'start of day', '-9 hours')";
  const tomorrowStart = "datetime('now', 'start of day', '+1 day', '-9 hours')";
  const { results } = await c.env.DB.prepare(`
    SELECT logs.*
    FROM logs
    INNER JOIN (
      SELECT target, MAX(id) AS latestId
      FROM logs
      WHERE createdAt >= ${todayStart}
        AND createdAt < ${tomorrowStart}
      GROUP BY target
    ) AS latest ON logs.id = latest.latestId
    ORDER BY logs.target
  `).all();

  return c.json({
    success: true,
    data: results
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
  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM logs
    ORDER BY createdAt DESC
    LIMIT 20000
  `).all();

  return c.json({
    success: true,
    data: results
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

  const query = c.env.DB.prepare(`
    SELECT *
    FROM logs
    WHERE createdAt >= datetime(? || ' 00:00:00', '-9 hours')
      AND createdAt < datetime(? || ' 00:00:00', '+1 day', '-9 hours')
    ORDER BY createdAt DESC
    LIMIT 20000
  `).bind(startDate, endDate);
  const { results } = await query.all();
  return c.json({
    success: true,
    data: results
  });
});

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Bindings, ctx: any) {
    ctx.waitUntil((async () => {
      const results = await checkEndpoints(env);
      await sendLineStatusReport(env, results);
    })());
  }
};
