import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const trainingRoutes = new Hono<HonoEnv>();

const JSON_FIELDS = ['trainers', 'themes', 'sections'] as const;

function parseTraining(row: Record<string, unknown>) {
  for (const f of JSON_FIELDS) {
    if (typeof row[f] === 'string') {
      try { row[f] = JSON.parse(row[f] as string); } catch { row[f] = []; }
    }
  }
  return row;
}

// GET /api/trainings?team_id=X&archived=0
trainingRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  const archived = c.req.query('archived') ?? '0';
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM trainings WHERE team_id = ? AND archived = ? ORDER BY date DESC'
  ).bind(teamId, parseInt(archived)).all();
  return c.json(rows.results.map(r => parseTraining(r as Record<string, unknown>)));
});

// POST /api/trainings
trainingRoutes.post('/', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const id = newId();
  const { sub } = c.get('user');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO trainings (id, team_id, title, date, start_time, end_time, location, lead_trainer, trainers, themes, focus_points, sections, stars, archived, holdsport_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.team_id, body.title ?? null, body.date ?? null,
    body.start_time ?? null, body.end_time ?? null,
    body.location ?? null, body.lead_trainer ?? null,
    JSON.stringify(body.trainers ?? []),
    JSON.stringify(body.themes ?? []),
    body.focus_points ?? null,
    JSON.stringify(body.sections ?? []),
    body.stars ?? 0, body.archived ?? 0,
    body.holdsport_id ?? null, sub, now, now
  ).run();
  return c.json({ id }, 201);
});

// GET /api/trainings/:id
trainingRoutes.get('/:id', requireAuth(), async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM trainings WHERE id = ?')
    .bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'Ikke fundet' }, 404);
  return c.json(parseTraining(row as Record<string, unknown>));
});

// PATCH /api/trainings/:id
trainingRoutes.patch('/:id', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const allowed = ['title', 'date', 'start_time', 'end_time', 'location', 'lead_trainer', 'trainers', 'themes', 'focus_points', 'sections', 'stars', 'archived'];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      values.push(['trainers', 'themes', 'sections'].includes(key)
        ? JSON.stringify(body[key])
        : body[key]);
    }
  }
  if (updates.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  await c.env.DB.prepare(`UPDATE trainings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();
  return c.json({ ok: true });
});

// DELETE /api/trainings/:id
trainingRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  await c.env.DB.prepare('DELETE FROM trainings WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
