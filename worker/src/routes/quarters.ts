import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const quarterRoutes = new Hono<HonoEnv>();

// GET /api/quarters?team_id=X
quarterRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM quarters WHERE team_id = ? ORDER BY quarter'
  ).bind(teamId).all();
  return c.json(rows.results.map(r => ({
    ...r,
    themes: typeof r.themes === 'string' ? JSON.parse(r.themes as string) : r.themes,
  })));
});

// PUT /api/quarters/:id — opret eller opdater kvartal
quarterRoutes.put('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const { team_id, quarter, themes } = await c.req.json<{ team_id: string; quarter: number; themes: string[] }>();
  await c.env.DB.prepare(`
    INSERT INTO quarters (id, team_id, quarter, themes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id, quarter) DO UPDATE SET themes = excluded.themes
  `).bind(id === 'new' ? newId() : id, team_id, quarter, JSON.stringify(themes ?? [])).run();
  return c.json({ ok: true });
});
