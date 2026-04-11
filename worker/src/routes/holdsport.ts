import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const holdsportRoutes = new Hono<HonoEnv>();

// GET /api/holdsport/activities?from=YYYY-MM-DD&to=YYYY-MM-DD
// Klient sender Holdsport Worker URL og token som headers:
//   X-HS-Worker-URL: https://...
//   X-HS-Token: <token>
holdsportRoutes.get('/activities', requireAuth('trainer'), async (c) => {
  const workerUrl = c.req.header('X-HS-Worker-URL');
  const hsToken = c.req.header('X-HS-Token') ?? c.env.HS_TOKEN;
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!workerUrl) return c.json({ error: 'X-HS-Worker-URL header påkrævet' }, 400);

  const url = new URL(workerUrl);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${hsToken}` },
  });

  if (!res.ok) {
    return c.json({ error: `Holdsport fejl: ${res.status}` }, 502);
  }

  const data = await res.json();
  return c.json(data);
});
