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
  let teams;
  if (role === 'admin') {
    teams = await c.env.DB.prepare('SELECT * FROM teams ORDER BY name').all();
  } else {
    teams = await c.env.DB.prepare(
      'SELECT t.* FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ? ORDER BY t.name'
    ).bind(sub).all();
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
  const body = await c.req.json<Partial<{ name: string; age_group: string; season: string }>>();
  const fields = Object.entries(body)
    .filter(([k]) => ['name', 'age_group', 'season'].includes(k))
    .map(([k]) => `${k} = ?`);
  if (fields.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  await c.env.DB.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...Object.values(body), id).run();
  return c.json({ ok: true });
});

// DELETE /api/teams/:id
teamRoutes.delete('/:id', requireAuth('admin'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
