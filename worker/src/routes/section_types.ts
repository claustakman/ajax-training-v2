import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const sectionTypeRoutes = new Hono<HonoEnv>();

function parse(r: Record<string, unknown>) {
  if (typeof r.tags === 'string') { try { r.tags = JSON.parse(r.tags as string); } catch { r.tags = []; } }
  if (typeof r.themes === 'string') { try { r.themes = JSON.parse(r.themes as string); } catch { r.themes = []; } }
  return r;
}

// GET /api/section-types?team_id=X
sectionTypeRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');

  if (teamId) {
    const teamRows = await c.env.DB.prepare(
      'SELECT * FROM section_types WHERE team_id = ? ORDER BY sort_order'
    ).bind(teamId).all();

    if (teamRows.results.length > 0) {
      return c.json(teamRows.results.map(r => parse(r as Record<string, unknown>)));
    }
  }

  // No team rows (or no team_id) — return globals
  const rows = await c.env.DB.prepare(
    'SELECT * FROM section_types WHERE team_id IS NULL ORDER BY sort_order'
  ).all();
  return c.json(rows.results.map(r => parse(r as Record<string, unknown>)));
});

// POST /api/section-types — opret ny sektionstype (team_manager+)
sectionTypeRoutes.post('/', requireAuth('team_manager'), async (c) => {
  const body = await c.req.json<{
    label: string; color?: string; tags?: string[];
    themes?: string[]; required?: boolean; sort_order?: number; team_id: string;
  }>();
  if (!body.label || !body.team_id) return c.json({ error: 'label og team_id påkrævet' }, 400);

  const baseId = body.label.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const existing = await c.env.DB.prepare(
    "SELECT id FROM section_types WHERE id = ? AND COALESCE(team_id,'') = ?"
  ).bind(baseId, body.team_id).first();
  const id = existing ? `${baseId}_${newId().slice(0, 6)}` : baseId;

  await c.env.DB.prepare(`
    INSERT INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.label,
    body.color ?? '#3b82f6',
    id,
    JSON.stringify(body.tags ?? []),
    JSON.stringify(body.themes ?? []),
    body.required ? 1 : 0,
    body.sort_order ?? 99,
    body.team_id
  ).run();

  return c.json({ id }, 201);
});

// PATCH /api/section-types/:id?team_id=X
// Upserts a team-specific row. Never touches global defaults.
sectionTypeRoutes.patch('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const teamId = c.req.query('team_id');
  const body = await c.req.json<Record<string, unknown>>();

  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  // Fetch current state: team row first, fall back to global
  const current = await c.env.DB.prepare(
    'SELECT * FROM section_types WHERE id = ? AND team_id = ?'
  ).bind(id, teamId).first<Record<string, unknown>>()
    ?? await c.env.DB.prepare(
      'SELECT * FROM section_types WHERE id = ? AND team_id IS NULL'
    ).bind(id).first<Record<string, unknown>>();

  if (!current) return c.json({ error: 'Sektionstype ikke fundet' }, 404);

  const merged = { ...current, ...body };
  const tagsStr = typeof merged.tags === 'string' ? merged.tags : JSON.stringify(merged.tags ?? []);
  const themesStr = typeof merged.themes === 'string' ? merged.themes : JSON.stringify(merged.themes ?? []);

  // INSERT OR REPLACE uses the UNIQUE index on (id, COALESCE(team_id,''))
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    merged.label,
    merged.color ?? '#3b82f6',
    id,
    tagsStr,
    themesStr,
    merged.required ? 1 : 0,
    merged.sort_order ?? 99,
    teamId
  ).run();

  return c.json({ ok: true });
});

// DELETE /api/section-types/:id?team_id=X (team_manager+)
sectionTypeRoutes.delete('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
  await c.env.DB.prepare('DELETE FROM section_types WHERE id = ? AND team_id = ?')
    .bind(id, teamId).run();
  return c.json({ ok: true });
});

// PUT /api/section-types/reorder (team_manager+)
sectionTypeRoutes.put('/reorder', requireAuth('team_manager'), async (c) => {
  const { team_id, order } = await c.req.json<{ team_id: string; order: string[] }>();
  if (!team_id || !Array.isArray(order)) return c.json({ error: 'team_id og order påkrævet' }, 400);
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const current = await c.env.DB.prepare(
      'SELECT * FROM section_types WHERE id = ? AND team_id = ?'
    ).bind(id, team_id).first<Record<string, unknown>>()
      ?? await c.env.DB.prepare(
        'SELECT * FROM section_types WHERE id = ? AND team_id IS NULL'
      ).bind(id).first<Record<string, unknown>>();
    if (!current) continue;

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, current.label, current.color ?? '#3b82f6', id,
      current.tags, current.themes,
      current.required ?? 0, i + 1, team_id
    ).run();
  }
  return c.json({ ok: true });
});
