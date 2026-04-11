import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const sectionTypeRoutes = new Hono<HonoEnv>();

// GET /api/section-types
sectionTypeRoutes.get('/', requireAuth(), async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM section_types ORDER BY sort_order'
  ).all();
  return c.json(rows.results.map(r => ({
    ...r,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags as string) : r.tags,
  })));
});
