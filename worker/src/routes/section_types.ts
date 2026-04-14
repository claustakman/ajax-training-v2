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
// Returns global defaults merged with team overrides.
// If team has its own rows, those are returned; otherwise global (team_id=NULL) rows.
sectionTypeRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');

  if (teamId) {
    // Team-specific: fetch team rows first, fall back to global if none
    const teamRows = await c.env.DB.prepare(
      'SELECT * FROM section_types WHERE team_id = ? ORDER BY sort_order'
    ).bind(teamId).all();

    if (teamRows.results.length > 0) {
      return c.json(teamRows.results.map(r => parse(r as Record<string, unknown>)));
    }
  }

  // Global defaults (no team_id)
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

  // Auto-generate id from label (slugify)
  const baseId = body.label.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  // Check uniqueness for this team
  const existing = await c.env.DB.prepare(
    'SELECT id FROM section_types WHERE id = ? AND team_id = ?'
  ).bind(baseId, body.team_id).first();
  const id = existing ? `${baseId}_${newId().slice(0, 6)}` : baseId;

  await c.env.DB.prepare(`
    INSERT INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.label,
    body.color ?? '#3b82f6',
    id, // cls = id
    JSON.stringify(body.tags ?? []),
    JSON.stringify(body.themes ?? []),
    body.required ? 1 : 0,
    body.sort_order ?? 99,
    body.team_id
  ).run();

  return c.json({ id }, 201);
});

// PATCH /api/section-types/:id — opdater sektionstype (team_manager+)
sectionTypeRoutes.patch('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const teamId = c.req.query('team_id');
  const body = await c.req.json<Record<string, unknown>>();

  const allowed = ['label', 'color', 'tags', 'themes', 'required', 'sort_order'];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      if (['tags', 'themes'].includes(key)) values.push(JSON.stringify(body[key]));
      else if (key === 'required') values.push(body[key] ? 1 : 0);
      else values.push(body[key]);
    }
  }
  if (updates.length === 0) return c.json({ error: 'Ingen felter' }, 400);

  if (teamId) {
    values.push(id, teamId);
    await c.env.DB.prepare(
      `UPDATE section_types SET ${updates.join(', ')} WHERE id = ? AND team_id = ?`
    ).bind(...values).run();
  } else {
    values.push(id);
    await c.env.DB.prepare(
      `UPDATE section_types SET ${updates.join(', ')} WHERE id = ? AND team_id IS NULL`
    ).bind(...values).run();
  }
  return c.json({ ok: true });
});

// DELETE /api/section-types/:id?team_id=X (team_manager+)
sectionTypeRoutes.delete('/:id', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const teamId = c.req.query('team_id');
  if (teamId) {
    await c.env.DB.prepare('DELETE FROM section_types WHERE id = ? AND team_id = ?')
      .bind(id, teamId).run();
  } else {
    await c.env.DB.prepare('DELETE FROM section_types WHERE id = ? AND team_id IS NULL')
      .bind(id).run();
  }
  return c.json({ ok: true });
});

// PUT /api/section-types/reorder — reorder sektionstyper for et hold (team_manager+)
// Body: { team_id: string, order: string[] } (array of ids in new order)
sectionTypeRoutes.put('/reorder', requireAuth('team_manager'), async (c) => {
  const { team_id, order } = await c.req.json<{ team_id: string; order: string[] }>();
  if (!team_id || !Array.isArray(order)) return c.json({ error: 'team_id og order påkrævet' }, 400);
  for (let i = 0; i < order.length; i++) {
    await c.env.DB.prepare(
      'UPDATE section_types SET sort_order = ? WHERE id = ? AND team_id = ?'
    ).bind(i + 1, order[i], team_id).run();
  }
  return c.json({ ok: true });
});
