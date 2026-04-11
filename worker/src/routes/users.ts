import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const userRoutes = new Hono<HonoEnv>();

// GET /api/users — inkluderer teams per bruger
userRoutes.get('/', requireAuth('admin'), async (c) => {
  const users = await c.env.DB.prepare(
    'SELECT id, name, email, role, last_seen, created_at FROM users ORDER BY name'
  ).all();

  // Hent alle user_teams + teams i ét kald og merge
  const allUserTeams = await c.env.DB.prepare(
    'SELECT ut.user_id, t.id, t.name, t.age_group, t.season FROM user_teams ut JOIN teams t ON t.id = ut.team_id'
  ).all();

  const teamsByUser: Record<string, unknown[]> = {};
  for (const row of allUserTeams.results) {
    const uid = row.user_id as string;
    if (!teamsByUser[uid]) teamsByUser[uid] = [];
    teamsByUser[uid].push({ id: row.id, name: row.name, age_group: row.age_group, season: row.season });
  }

  const result = users.results.map(u => ({
    ...u,
    teams: teamsByUser[u.id as string] ?? [],
  }));

  return c.json(result);
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
  const body = await c.req.json<{ role?: string; name?: string }>();
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.role) { updates.push('role = ?'); values.push(body.role); }
  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (updates.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  values.push(id);
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

// DELETE /api/users/:id
userRoutes.delete('/:id', requireAuth('admin'), async (c) => {
  const id = c.req.param('id');
  const { sub } = c.get('user');
  if (id === sub) return c.json({ error: 'Du kan ikke slette dig selv' }, 400);
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
