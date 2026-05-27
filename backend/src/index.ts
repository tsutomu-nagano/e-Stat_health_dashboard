import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkEndpoints } from './checker.js';

type Bindings = {
  DB: any;
  ESTAT_APP_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/status', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM logs ORDER BY createdAt DESC LIMIT 2
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
    data: [results.web, results.api]
  });
});

app.get('/api/history', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM logs ORDER BY createdAt DESC LIMIT 288
  `).all();
  
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
