import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const userRoutes = new Hono<HonoEnv>();

// GET /api/users/team-members?team_id=X — alle autentificerede brugere på holdet (til valg af ansvarlig/trænere)
userRoutes.get('/team-members', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name FROM users u
     JOIN user_teams ut ON ut.user_id = u.id
     WHERE ut.team_id = ? ORDER BY u.name`
  ).bind(teamId).all<{ id: string; name: string }>();
  return c.json(rows.results);
});

// GET /api/users — inkluderer teams per bruger
// Admin: returnerer alle brugere
// team_manager: ?team_id=X påkrævet — returnerer kun brugere på det hold
userRoutes.get('/', requireAuth('team_manager'), async (c) => {
  const { sub, role } = c.get('user');
  const teamId = c.req.query('team_id');

  if (role !== 'admin') {
    // team_manager skal angive team_id og skal selv være på holdet
    if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
    ).bind(sub, teamId).first<{ role: string }>();
    if (!membership || (membership.role !== 'team_manager')) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Returner kun brugere på dette hold
    const teamUsers = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.role, u.last_seen, u.created_at, ut.role as team_role
       FROM users u JOIN user_teams ut ON ut.user_id = u.id
       WHERE ut.team_id = ? ORDER BY u.name`
    ).bind(teamId).all();

    const teamInfo = await c.env.DB.prepare(
      'SELECT id, name, age_group, season FROM teams WHERE id = ?'
    ).bind(teamId).first<{ id: string; name: string; age_group: string; season: string }>();

    return c.json(teamUsers.results.map((u: Record<string, unknown>) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      last_seen: u.last_seen, created_at: u.created_at,
      teams: teamInfo ? [{ ...teamInfo, role: u.team_role }] : [],
    })));
  }

  // Admin — returner alle brugere med alle hold
  const users = await c.env.DB.prepare(
    'SELECT id, name, email, role, last_seen, created_at FROM users ORDER BY name'
  ).all();

  const allUserTeams = await c.env.DB.prepare(
    'SELECT ut.user_id, ut.role as team_role, t.id, t.name, t.age_group, t.season FROM user_teams ut JOIN teams t ON t.id = ut.team_id'
  ).all();

  const teamsByUser: Record<string, unknown[]> = {};
  for (const row of allUserTeams.results) {
    const uid = row.user_id as string;
    if (!teamsByUser[uid]) teamsByUser[uid] = [];
    teamsByUser[uid].push({ id: row.id, name: row.name, age_group: row.age_group, season: row.season, role: row.team_role });
  }

  return c.json(users.results.map(u => ({
    ...u,
    teams: teamsByUser[u.id as string] ?? [],
  })));
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
    'SELECT t.id, t.name, t.age_group, t.season, ut.role as team_role FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
  ).bind(id).all();
  return c.json({
    ...user,
    teams: teams.results.map((t: Record<string, unknown>) => ({
      id: t.id, name: t.name, age_group: t.age_group, season: t.season, role: t.team_role,
    })),
  });
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
  const { team_id, role = 'trainer' } = await c.req.json<{ team_id: string; role?: string }>();
  await c.env.DB.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id, role) VALUES (?, ?, ?)')
    .bind(userId, team_id, role).run();
  return c.json({ ok: true });
});

// PATCH /api/users/:id/teams/:tid — opdater rolle på et hold
// Admin: altid. team_manager: kun på hold de selv er team_manager på.
userRoutes.patch('/:id/teams/:tid', requireAuth('team_manager'), async (c) => {
  const userId = c.req.param('id');
  const teamId = c.req.param('tid');
  const { sub, role: callerRole } = c.get('user');
  const { role } = await c.req.json<{ role: string }>();
  if (!role) return c.json({ error: 'role påkrævet' }, 400);

  // Non-admin: tjek at caller er team_manager på dette hold
  if (callerRole !== 'admin') {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
    ).bind(sub, teamId).first<{ role: string }>();
    if (!membership || membership.role !== 'team_manager') {
      return c.json({ error: 'Forbidden' }, 403);
    }
    // team_manager kan maks tildele trainer-niveau
    const ROLE_LEVEL: Record<string, number> = { guest: 1, trainer: 2, team_manager: 3, admin: 4 };
    if ((ROLE_LEVEL[role] ?? 0) > ROLE_LEVEL['team_manager']) {
      return c.json({ error: 'Du kan ikke tildele admin-rolle' }, 403);
    }
  }

  await c.env.DB.prepare('UPDATE user_teams SET role = ? WHERE user_id = ? AND team_id = ?')
    .bind(role, userId, teamId).run();
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
