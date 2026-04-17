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
  // archived er integer i D1
  row.archived = row.archived === 1;
  return row;
}

// GET /api/trainings?team_id=X&archived=0
trainingRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  const archivedParam = c.req.query('archived');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  let query: string;
  let params: unknown[];

  if (archivedParam === undefined) {
    // Ingen filter — returnér alle
    query = 'SELECT * FROM trainings WHERE team_id = ? ORDER BY date DESC';
    params = [teamId];
  } else {
    const archived = parseInt(archivedParam);
    const order = archived === 0 ? 'date ASC' : 'date DESC';
    query = `SELECT * FROM trainings WHERE team_id = ? AND archived = ? ORDER BY ${order}`;
    params = [teamId, archived];
  }

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(rows.results.map(r => parseTraining(r as Record<string, unknown>)));
});

// GET /api/trainings/:id
trainingRoutes.get('/:id', requireAuth(), async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM trainings WHERE id = ?')
    .bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'Ikke fundet' }, 404);
  return c.json(parseTraining(row as Record<string, unknown>));
});

// POST /api/trainings
trainingRoutes.post('/', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.team_id) return c.json({ error: 'team_id påkrævet' }, 400);
  const id = newId();
  const { sub } = c.get('user');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO trainings
      (id, team_id, title, date, start_time, end_time, location, lead_trainer,
       trainers, themes, focus_points, notes, participant_count,
       sections, stars, archived, holdsport_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.team_id, body.title ?? null, body.date ?? null,
    body.start_time ?? null, body.end_time ?? null,
    body.location ?? null, body.lead_trainer ?? null,
    JSON.stringify(body.trainers ?? []),
    JSON.stringify(body.themes ?? []),
    body.focus_points ?? null,
    body.notes ?? null,
    body.participant_count ?? null,
    JSON.stringify(body.sections ?? []),
    body.stars ?? 0,
    body.archived ? 1 : 0,
    body.holdsport_id ?? null, sub, now, now
  ).run();

  const created = await c.env.DB.prepare('SELECT * FROM trainings WHERE id = ?').bind(id).first();
  return c.json(parseTraining(created as Record<string, unknown>), 201);
});

// PATCH /api/trainings/:id
trainingRoutes.patch('/:id', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const JSON_COLS = ['trainers', 'themes', 'sections'];
  const allowed = [
    'title', 'date', 'start_time', 'end_time', 'location', 'lead_trainer',
    'trainers', 'themes', 'focus_points', 'notes', 'participant_count',
    'sections', 'stars', 'archived',
  ];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      if (JSON_COLS.includes(key)) values.push(JSON.stringify(body[key]));
      else if (key === 'archived') values.push(body[key] ? 1 : 0);
      else values.push(body[key]);
    }
  }
  if (updates.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(now, id);
  await c.env.DB.prepare(`UPDATE trainings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();
  const { sub } = c.get('user');
  await c.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, sub).run();

  const updated = await c.env.DB.prepare('SELECT * FROM trainings WHERE id = ?').bind(id).first();
  return c.json(parseTraining(updated as Record<string, unknown>));
});

// DELETE /api/trainings/:id
trainingRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  await c.env.DB.prepare('DELETE FROM trainings WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ deleted: true });
});
