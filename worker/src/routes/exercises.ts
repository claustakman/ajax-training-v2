import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const exerciseRoutes = new Hono<HonoEnv>();

const JSON_FIELDS = ['tags', 'age_groups'] as const;

function parseExercise(row: Record<string, unknown>) {
  for (const f of JSON_FIELDS) {
    if (typeof row[f] === 'string') {
      try { row[f] = JSON.parse(row[f] as string); } catch { row[f] = []; }
    }
  }
  return row;
}

// GET /api/exercises?catalog=hal&age_group=U11
exerciseRoutes.get('/', requireAuth(), async (c) => {
  const catalog = c.req.query('catalog');
  const ageGroup = c.req.query('age_group');

  let query = 'SELECT * FROM exercises WHERE 1=1';
  const params: unknown[] = [];

  if (catalog) { query += ' AND catalog = ?'; params.push(catalog); }
  if (ageGroup) { query += " AND age_groups LIKE ?"; params.push(`%"${ageGroup}"%`); }
  query += ' ORDER BY name';

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(rows.results.map(r => parseExercise(r as Record<string, unknown>)));
});

// POST /api/exercises
exerciseRoutes.post('/', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name) return c.json({ error: 'name påkrævet' }, 400);
  const id = newId();
  const { sub } = c.get('user');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO exercises (id, name, description, catalog, category, tags, age_groups, stars, variants, link, default_mins, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.name, body.description ?? null,
    body.catalog ?? 'hal', body.category ?? null,
    JSON.stringify(body.tags ?? []),
    JSON.stringify(body.age_groups ?? []),
    body.stars ?? 0,
    body.variants ?? null, body.link ?? null,
    body.default_mins ?? null, sub, now, now
  ).run();
  return c.json({ id }, 201);
});

// PATCH /api/exercises/:id
exerciseRoutes.patch('/:id', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const allowed = ['name', 'description', 'catalog', 'category', 'tags', 'age_groups', 'stars', 'variants', 'link', 'default_mins'];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      values.push(['tags', 'age_groups'].includes(key) ? JSON.stringify(body[key]) : body[key]);
    }
  }
  if (updates.length === 0) return c.json({ error: 'Ingen felter at opdatere' }, 400);
  updates.push('updated_at = ?');
  values.push(new Date().toISOString(), id);
  await c.env.DB.prepare(`UPDATE exercises SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

// DELETE /api/exercises/:id
exerciseRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  const ex = await c.env.DB.prepare('SELECT image_r2_key FROM exercises WHERE id = ?')
    .bind(c.req.param('id')).first();
  if (ex?.image_r2_key) {
    await c.env.STORAGE.delete(ex.image_r2_key as string);
  }
  await c.env.DB.prepare('DELETE FROM exercises WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// GET /api/exercises/:id/image?key=exercises/foo.jpg — server billede fra R2
exerciseRoutes.get('/:id/image', async (c) => {
  const id = c.req.param('id');
  // Brug ?key= hvis sendt (frontend kender nøglen fra exerciseData), ellers DB, ellers default
  const keyParam = c.req.query('key');
  let key = keyParam ?? `exercises/${id}.jpg`;
  if (!keyParam) {
    const row = await c.env.DB.prepare('SELECT image_r2_key FROM exercises WHERE id = ?').bind(id).first();
    if (row?.image_r2_key) key = row.image_r2_key as string;
  }
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.json({ error: 'Ikke fundet' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// POST /api/exercises/:id/image — multipart/form-data, felt: "image"
exerciseRoutes.post('/:id/image', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ error: 'image felt påkrævet' }, 400);
  if (file.size > 2 * 1024 * 1024) return c.json({ error: 'Max 2MB' }, 413);

  const key = `exercises/${id}.jpg`;
  await c.env.STORAGE.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: 'image/jpeg' },
  });

  // Public URL — opdater til dit R2 custom domain eller .r2.dev URL
  const imageUrl = `https://pub-ajax-traening-storage.r2.dev/${key}`;
  await c.env.DB.prepare('UPDATE exercises SET image_r2_key = ?, image_url = ?, updated_at = ? WHERE id = ?')
    .bind(key, imageUrl, new Date().toISOString(), id).run();

  return c.json({ image_url: imageUrl });
});

// DELETE /api/exercises/:id/image
exerciseRoutes.delete('/:id/image', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const ex = await c.env.DB.prepare('SELECT image_r2_key FROM exercises WHERE id = ?').bind(id).first();
  if (ex?.image_r2_key) await c.env.STORAGE.delete(ex.image_r2_key as string);
  await c.env.DB.prepare('UPDATE exercises SET image_r2_key = NULL, image_url = NULL, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id).run();
  return c.json({ ok: true });
});
