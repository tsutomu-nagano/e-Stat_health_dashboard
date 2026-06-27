import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkEndpoints } from './checker.js';

type Bindings = {
  DB: any;
  ESTAT_APP_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/status', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT logs.*
    FROM logs
    INNER JOIN (
      SELECT target, MAX(id) AS latestId
      FROM logs
      GROUP BY target
    ) AS latest ON logs.id = latest.latestId
    ORDER BY logs.target
  `).all();

  return c.json({
    success: true,
    data: results
  });
});

app.post('/api/check-now', async (c) => {
  const results = await checkEndpoints(c.env);
  return c.json({
    success: true,
    data: results
  });
});

app.get('/api/history', async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if ((startDate || endDate) && (!startDate || !endDate || !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) || startDate > endDate)) {
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
    ctx.waitUntil(checkEndpoints(env));
  }
};
