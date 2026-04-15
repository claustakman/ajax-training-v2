import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const templateRoutes = new Hono<HonoEnv>();

// GET /api/templates?team_id=X
templateRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM templates WHERE team_id = ? OR team_id IS NULL ORDER BY created_at DESC'
  ).bind(teamId).all();

  return c.json(rows.results.map(r => ({
    ...r,
    sections: typeof r.sections === 'string'
      ? (() => { try { return JSON.parse(r.sections as string); } catch { return []; } })()
      : r.sections,
  })));
});

// POST /api/templates
templateRoutes.post('/', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<{ name: string; sections: unknown[]; team_id: string }>();
  if (!body.name || !body.team_id) return c.json({ error: 'name og team_id påkrævet' }, 400);

  const id = newId();
  const { sub } = c.get('user');
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'INSERT INTO templates (id, team_id, name, sections, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.team_id, body.name, JSON.stringify(body.sections ?? []), sub, now).run();

  return c.json({
    id, team_id: body.team_id, name: body.name,
    sections: body.sections ?? [], created_by: sub, created_at: now,
  }, 201);
});

// DELETE /api/templates/:id
templateRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ deleted: true });
});
