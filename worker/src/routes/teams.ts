import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const teamRoutes = new Hono<HonoEnv>();

// Kopier globale sektionstyper til et nyt hold (uden temaer)
async function copyGlobalSectionTypesToTeam(db: D1Database, teamId: string) {
  const globals = await db.prepare(
    'SELECT * FROM section_types WHERE team_id IS NULL ORDER BY sort_order'
  ).all<Record<string, unknown>>();

  for (const st of globals.results) {
    await db.prepare(`
      INSERT OR IGNORE INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)
    `).bind(
      st.id, st.label, st.color, st.cls ?? st.id,
      st.tags, st.required ?? 0, st.sort_order ?? 99, teamId
    ).run();
  }
}

// GET /api/teams
teamRoutes.get('/', requireAuth(), async (c) => {
  const { sub, role } = c.get('user');

  // Bestem om caller må se Holdsport-credentials
  const canSeeCredentials = role === 'admin';

  let teams;
  if (role === 'admin') {
    teams = await c.env.DB.prepare('SELECT * FROM teams ORDER BY name').all();
  } else {
    teams = await c.env.DB.prepare(
      'SELECT t.* FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ? ORDER BY t.name'
    ).bind(sub).all();
  }

  // For ikke-admin: fjern holdsport-credentials medmindre brugeren er team_manager på holdet
  if (!canSeeCredentials) {
    // Hent brugerens roller på hold
    const userTeams = await c.env.DB.prepare(
      'SELECT team_id, role FROM user_teams WHERE user_id = ?'
    ).bind(sub).all<{ team_id: string; role: string }>();
    const managerTeamIds = new Set(
      userTeams.results.filter(ut => ut.role === 'team_manager').map(ut => ut.team_id)
    );

    return c.json(teams.results.map((t: Record<string, unknown>) => {
      if (managerTeamIds.has(t.id as string)) return t;
      // guest/trainer: strip credentials
      const { holdsport_worker_url: _u, holdsport_token: _t, ...rest } = t;
      return rest;
    }));
  }

  return c.json(teams.results);
});

// POST /api/teams
teamRoutes.post('/', requireAuth('admin'), async (c) => {
  const { name, age_group, season } = await c.req.json<{ name: string; age_group: string; season: string }>();
  if (!name || !age_group || !season) return c.json({ error: 'name, age_group og season påkrævet' }, 400);
  const id = newId();
  await c.env.DB.prepare('INSERT INTO teams (id, name, age_group, season) VALUES (?, ?, ?, ?)')
    .bind(id, name, age_group, season).run();

  // Kopiér globale sektionstyper til det nye hold (temaer sættes ikke)
  await copyGlobalSectionTypesToTeam(c.env.DB, id);

  return c.json({ id, name, age_group, season }, 201);
});

// PATCH /api/teams/:id
teamRoutes.patch('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{
    name: string; age_group: string; season: string;
    holdsport_worker_url: string; holdsport_token: string;
  }>>();
  const ALLOWED = ['name', 'age_group', 'season', 'holdsport_worker_url', 'holdsport_token'];
  const entries = Object.entries(body).filter(([k]) => ALLOWED.includes(k));
  if (entries.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`);
  const values = entries.map(([, v]) => v);
  await c.env.DB.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values, id).run();
  // Returner opdateret team
  const team = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first();
  return c.json(team);
});

// DELETE /api/teams/:id
teamRoutes.delete('/:id', requireAuth('admin'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
