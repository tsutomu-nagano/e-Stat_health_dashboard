import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkEndpoints } from './checker.js';

type Bindings = {
  DB: any;
  ESTAT_APP_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const startDateTime = c.req.query('startDateTime');
  const endDateTime = c.req.query('endDateTime');

  if ((startDateTime || endDateTime) && (!startDateTime || !endDateTime || !DATE_TIME_PATTERN.test(startDateTime) || !DATE_TIME_PATTERN.test(endDateTime) || startDateTime > endDateTime)) {
    return c.json({
      success: false,
      error: 'startDateTime and endDateTime must be YYYY-MM-DDTHH:mm values, with startDateTime on or before endDateTime.'
    }, 400);
  }

  const query = startDateTime && endDateTime
    ? (() => {
        const startTimestamp = toUtcSqlTimestamp(startDateTime);
        const endExclusiveTimestamp = toUtcSqlTimestamp(
          new Date(new Date(`${endDateTime}:00+09:00`).getTime() + 60_000)
            .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
            .replace(' ', 'T')
            .slice(0, 16)
        );

        return c.env.DB.prepare(`
          SELECT *
          FROM logs
          WHERE createdAt >= ? AND createdAt < ?
          ORDER BY createdAt DESC
          LIMIT 20000
        `).bind(startTimestamp, endExclusiveTimestamp);
      })()
    : c.env.DB.prepare(`
        SELECT * FROM logs ORDER BY createdAt DESC LIMIT 3456
      `);

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
