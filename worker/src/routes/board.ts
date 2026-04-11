import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const boardRoutes = new Hono<HonoEnv>();

// GET /api/board?team_id=X
boardRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT bp.*, u.name as author_name
    FROM board_posts bp
    JOIN users u ON u.id = bp.user_id
    WHERE bp.team_id = ? AND bp.archived = 0
    ORDER BY bp.pinned DESC, bp.created_at DESC
  `).bind(teamId).all();
  return c.json(rows.results);
});

// POST /api/board
boardRoutes.post('/', requireAuth('trainer'), async (c) => {
  const { team_id, title, body } = await c.req.json<{ team_id: string; title?: string; body: string }>();
  if (!team_id || !body) return c.json({ error: 'team_id og body påkrævet' }, 400);
  const { sub } = c.get('user');
  const id = newId();
  await c.env.DB.prepare(
    'INSERT INTO board_posts (id, team_id, user_id, title, body) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, team_id, sub, title ?? null, body).run();
  return c.json({ id }, 201);
});

// PATCH /api/board/:id
boardRoutes.patch('/:id', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const { sub, role } = c.get('user');
  const post = await c.env.DB.prepare('SELECT user_id FROM board_posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);
  if (post.user_id !== sub && !['team_manager', 'admin'].includes(role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const { title, body } = await c.req.json<{ title?: string; body?: string }>();
  await c.env.DB.prepare('UPDATE board_posts SET title = ?, body = ?, edited_at = ? WHERE id = ?')
    .bind(title ?? null, body, new Date().toISOString(), id).run();
  return c.json({ ok: true });
});

// DELETE /api/board/:id
boardRoutes.delete('/:id', requireAuth('trainer'), async (c) => {
  const id = c.req.param('id');
  const { sub, role } = c.get('user');
  const post = await c.env.DB.prepare('SELECT user_id FROM board_posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);
  if (post.user_id !== sub && !['team_manager', 'admin'].includes(role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM board_posts WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// POST /api/board/:id/pin
boardRoutes.post('/:id/pin', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT pinned FROM board_posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);
  const newPinned = post.pinned === 1 ? 0 : 1;
  await c.env.DB.prepare('UPDATE board_posts SET pinned = ? WHERE id = ?').bind(newPinned, id).run();
  return c.json({ pinned: newPinned });
});

// GET /api/board/:id/comments
boardRoutes.get('/:id/comments', requireAuth(), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT bc.*, u.name as author_name
    FROM board_comments bc
    JOIN users u ON u.id = bc.user_id
    WHERE bc.post_id = ?
    ORDER BY bc.created_at ASC
  `).bind(c.req.param('id')).all();
  return c.json(rows.results);
});

// POST /api/board/:id/comments
boardRoutes.post('/:id/comments', requireAuth(), async (c) => {
  const postId = c.req.param('id');
  const { body } = await c.req.json<{ body: string }>();
  if (!body) return c.json({ error: 'body påkrævet' }, 400);
  const { sub } = c.get('user');
  const id = newId();
  await c.env.DB.prepare(
    'INSERT INTO board_comments (id, post_id, user_id, body) VALUES (?, ?, ?, ?)'
  ).bind(id, postId, sub, body).run();
  return c.json({ id }, 201);
});
