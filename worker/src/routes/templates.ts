import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const templateRoutes = new Hono<HonoEnv>();

function toTemplate(r: Record<string, unknown>) {
  return {
    ...r,
    sections: typeof r.sections === 'string'
      ? (() => { try { return JSON.parse(r.sections as string); } catch { return []; } })()
      : (r.sections ?? []),
    themes: typeof r.themes === 'string'
      ? (() => { try { return JSON.parse(r.themes as string); } catch { return []; } })()
      : (r.themes ?? []),
    type: r.type ?? 'training',
  };
}

// GET /api/templates?team_id=X[&type=training|section][&section_type=opvarmning]
templateRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const typeFilter = c.req.query('type');
  const sectionTypeFilter = c.req.query('section_type');

  let query = 'SELECT * FROM templates WHERE (team_id = ? OR team_id IS NULL)';
  const params: unknown[] = [teamId];

  if (typeFilter) {
    query += ' AND type = ?';
    params.push(typeFilter);
  }
  if (sectionTypeFilter) {
    query += ' AND section_type = ?';
    params.push(sectionTypeFilter);
  }

  query += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(rows.results.map(r => toTemplate(r as Record<string, unknown>)));
});

// POST /api/templates
templateRoutes.post('/', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<{
    name: string;
    sections: unknown[];
    team_id: string;
    type?: 'training' | 'section';
    section_type?: string;
    themes?: string[];
    description?: string;
  }>();
  if (!body.name || !body.team_id) return c.json({ error: 'name og team_id påkrævet' }, 400);

  const id = newId();
  const { sub } = c.get('user');
  const now = new Date().toISOString();
  const type = body.type ?? 'training';
  const themes = JSON.stringify(body.themes ?? []);

  await c.env.DB.prepare(
    `INSERT INTO templates (id, team_id, name, type, section_type, themes, description, sections, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.team_id, body.name, type,
    body.section_type ?? null, themes, body.description ?? null,
    JSON.stringify(body.sections ?? []), sub, now
  ).run();

  return c.json({
    id, team_id: body.team_id, name: body.name,
    type, section_type: body.section_type ?? null,
    themes: body.themes ?? [], description: body.description ?? null,
    sections: body.sections ?? [], created_by: sub, created_at: now,
  }, 201);
});

// DELETE /api/templates/:id
templateRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ deleted: true });
});
