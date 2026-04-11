import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const userRoutes = new Hono<HonoEnv>();

// GET /api/users
userRoutes.get('/', requireAuth('admin'), async (c) => {
  const users = await c.env.DB.prepare(
    'SELECT id, name, email, role, last_seen, created_at FROM users ORDER BY name'
  ).all();
  return c.json(users.results);
});

// GET /api/users/:id
userRoutes.get('/:id', requireAuth(), async (c) => {
  const id = c.req.param('id');
  const { sub, role } = c.get('user');
  if (sub !== id && role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  const user = await c.env.DB.prepare(
    'SELECT id, name, email, role, last_seen, created_at FROM users WHERE id = ?'
  ).bind(id).first();
  if (!user) return c.json({ error: 'Ikke fundet' }, 404);
  const teams = await c.env.DB.prepare(
    'SELECT t.id, t.name, t.age_group, t.season FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
  ).bind(id).all();
  return c.json({ ...user, teams: teams.results });
});

// PATCH /api/users/:id
userRoutes.patch('/:id', requireAuth('admin'), async (c) => {
  const id = c.req.param('id');
  const { role } = await c.req.json<{ role: string }>();
  if (!role) return c.json({ error: 'role påkrævet' }, 400);
  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run();
  return c.json({ ok: true });
});

// DELETE /api/users/:id
userRoutes.delete('/:id', requireAuth('admin'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// POST /api/users/:id/teams
userRoutes.post('/:id/teams', requireAuth('team_manager'), async (c) => {
  const userId = c.req.param('id');
  const { team_id } = await c.req.json<{ team_id: string }>();
  await c.env.DB.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)')
    .bind(userId, team_id).run();
  return c.json({ ok: true });
});

// DELETE /api/users/:id/teams/:tid
userRoutes.delete('/:id/teams/:tid', requireAuth('team_manager'), async (c) => {
  const userId = c.req.param('id');
  const teamId = c.req.param('tid');
  await c.env.DB.prepare('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?')
    .bind(userId, teamId).run();
  return c.json({ ok: true });
});
