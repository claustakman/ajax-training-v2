import { Hono } from 'hono';
import { requireAuth, ROLE_LEVEL, type AuthContext } from '../lib/middleware';
import { newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

const R2_BASE = 'https://pub-ajax-traening-storage.r2.dev';

// ─── Typer ────────────────────────────────────────────────────────────────────

interface BoardAttachment {
  id: string;
  post_id: string;
  type: string;
  filename: string;
  r2_key: string;
  url: string;
  size_bytes: number | null;
  created_at: string;
}

// ─── Hjælpefunktioner ─────────────────────────────────────────────────────────

const parseAttachments = (raw: string | null): BoardAttachment[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(a => a && a.id) : [];
  } catch { return []; }
};

const toPost = (row: Record<string, unknown>) => ({
  ...row,
  pinned: row.pinned === 1,
  archived: row.archived === 1,
  deleted: row.deleted === 1,
  comments: [],
  attachments: parseAttachments(row.attachments_json as string | null),
});

const toComment = (row: Record<string, unknown>) => ({
  ...row,
  deleted: row.deleted === 1,
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const boardRoutes = new Hono<HonoEnv>();

// ── GET /api/board?team_id=X&archived=0 ───────────────────────────────────────
boardRoutes.get('/', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const archivedParam = c.req.query('archived') ?? '0';
  const archived = archivedParam === '1' ? 1 : 0;

  const rows = await c.env.DB.prepare(`
    SELECT
      p.*,
      u.name as user_name,
      (
        SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
          'id', a.id,
          'post_id', a.post_id,
          'type', a.type,
          'filename', a.filename,
          'r2_key', a.r2_key,
          'url', a.url,
          'size_bytes', a.size_bytes,
          'created_at', a.created_at
        ))
        FROM board_attachments a
        WHERE a.post_id = p.id
      ) as attachments_json
    FROM board_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.team_id = ?
      AND p.deleted = 0
      AND p.archived = ?
    ORDER BY p.pinned DESC, p.created_at DESC
  `).bind(teamId, archived).all();

  const posts = rows.results.map(r => toPost(r as Record<string, unknown>)) as Record<string, unknown>[];

  // Hent kommentarer for hvert opslag
  for (const post of posts) {
    const comments = await c.env.DB.prepare(`
      SELECT c.*, u.name as user_name
      FROM board_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
        AND c.deleted = 0
      ORDER BY c.created_at ASC
    `).bind(post.id as string).all();
    post.comments = comments.results.map(r => toComment(r as Record<string, unknown>));
  }

  // Opdatér board_reads for aktuel bruger
  const { sub } = c.get('user');
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO board_reads (user_id, last_read_at)
    VALUES (?, datetime('now'))
  `).bind(sub).run();

  return c.json(posts);
});

// ── GET /api/board/unread?team_id=X ──────────────────────────────────────────
boardRoutes.get('/unread', requireAuth(), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const { sub } = c.get('user');

  const latestRow = await c.env.DB.prepare(`
    SELECT MAX(p.created_at) as latest
    FROM board_posts p
    WHERE p.team_id = ?
      AND p.deleted = 0
      AND p.archived = 0
  `).bind(teamId).first<{ latest: string | null }>();

  const readRow = await c.env.DB.prepare(
    'SELECT last_read_at FROM board_reads WHERE user_id = ?'
  ).bind(sub).first<{ last_read_at: string | null }>();

  const latest = latestRow?.latest ?? null;
  const lastRead = readRow?.last_read_at ?? null;

  const unread = latest !== null && (lastRead === null || latest > lastRead);
  return c.json({ unread });
});

// ── POST /api/board ───────────────────────────────────────────────────────────
boardRoutes.post('/', requireAuth(), async (c) => {
  const { team_id, title, body } = await c.req.json<{
    team_id: string; title?: string; body: string;
  }>();
  if (!team_id || !body?.trim()) return c.json({ error: 'team_id og body påkrævet' }, 400);

  const { sub } = c.get('user');
  const id = newId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO board_posts (id, team_id, user_id, title, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, team_id, sub, title?.trim() ?? null, body.trim(), now).run();

  // Hent brugerens navn til responsen
  const user = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?')
    .bind(sub).first<{ name: string }>();

  return c.json({
    id, team_id, user_id: sub, user_name: user?.name ?? '',
    title: title?.trim() ?? null, body: body.trim(),
    pinned: false, pinned_by: null, archived: false,
    edited_at: null, deleted: false, created_at: now,
    comments: [], attachments: [],
  }, 201);
});

// ── PATCH /api/board/:id ──────────────────────────────────────────────────────
boardRoutes.patch('/:id', requireAuth(), async (c) => {
  const id = c.req.param('id');
  const { sub, role } = c.get('user');

  const post = await c.env.DB.prepare(
    'SELECT user_id, team_id FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(id).first<{ user_id: string; team_id: string }>();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);

  // Tjek: eget opslag, eller team_manager/admin på holdet
  if (post.user_id !== sub) {
    if (role === 'admin') {
      // Global admin — tilladt
    } else {
      const membership = await c.env.DB.prepare(
        'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
      ).bind(sub, post.team_id).first<{ role: string }>();
      if ((ROLE_LEVEL[membership?.role ?? 'guest'] ?? 0) < ROLE_LEVEL.team_manager) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }
  }

  const { title, body } = await c.req.json<{ title?: string; body?: string }>();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE board_posts SET title = ?, body = ?, edited_at = ? WHERE id = ?'
  ).bind(title?.trim() ?? null, body?.trim() ?? '', now, id).run();

  return c.json({ ok: true, edited_at: now });
});

// ── DELETE /api/board/:id (soft delete) ──────────────────────────────────────
boardRoutes.delete('/:id', requireAuth(), async (c) => {
  const id = c.req.param('id');
  const { sub, role } = c.get('user');

  const post = await c.env.DB.prepare(
    'SELECT user_id, team_id FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(id).first<{ user_id: string; team_id: string }>();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);

  if (post.user_id !== sub) {
    if (role === 'admin') {
      // Global admin — tilladt
    } else {
      const membership = await c.env.DB.prepare(
        'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
      ).bind(sub, post.team_id).first<{ role: string }>();
      if ((ROLE_LEVEL[membership?.role ?? 'guest'] ?? 0) < ROLE_LEVEL.team_manager) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }
  }

  await c.env.DB.prepare(
    "UPDATE board_posts SET deleted = 1, deleted_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  return c.json({ ok: true });
});

// ── POST /api/board/:id/pin ───────────────────────────────────────────────────
boardRoutes.post('/:id/pin', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');
  const { sub } = c.get('user');

  const post = await c.env.DB.prepare(
    'SELECT pinned FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(id).first<{ pinned: number }>();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);

  const newPinned = post.pinned === 1 ? 0 : 1;
  await c.env.DB.prepare(
    'UPDATE board_posts SET pinned = ?, pinned_by = ? WHERE id = ?'
  ).bind(newPinned, newPinned === 1 ? sub : null, id).run();

  return c.json({ pinned: newPinned === 1 });
});

// ── POST /api/board/:id/archive ───────────────────────────────────────────────
boardRoutes.post('/:id/archive', requireAuth('team_manager'), async (c) => {
  const id = c.req.param('id');

  const post = await c.env.DB.prepare(
    'SELECT archived FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(id).first<{ archived: number }>();
  if (!post) return c.json({ error: 'Ikke fundet' }, 404);

  const newArchived = post.archived === 1 ? 0 : 1;
  await c.env.DB.prepare('UPDATE board_posts SET archived = ? WHERE id = ?')
    .bind(newArchived, id).run();

  return c.json({ archived: newArchived === 1 });
});

// ── POST /api/board/:id/comments ─────────────────────────────────────────────
boardRoutes.post('/:id/comments', requireAuth(), async (c) => {
  const postId = c.req.param('id');
  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) return c.json({ error: 'body påkrævet' }, 400);

  const post = await c.env.DB.prepare(
    'SELECT id FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(postId).first();
  if (!post) return c.json({ error: 'Opslag ikke fundet' }, 404);

  const { sub } = c.get('user');
  const id = newId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'INSERT INTO board_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, postId, sub, body.trim(), now).run();

  const user = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?')
    .bind(sub).first<{ name: string }>();

  return c.json({
    id, post_id: postId, user_id: sub, user_name: user?.name ?? '',
    body: body.trim(), edited_at: null, deleted: false, created_at: now,
  }, 201);
});

// ── PATCH /api/board/:id/comments/:commentId ─────────────────────────────────
boardRoutes.patch('/:id/comments/:commentId', requireAuth(), async (c) => {
  const commentId = c.req.param('commentId');
  const postId = c.req.param('id');
  const { sub, role } = c.get('user');

  const comment = await c.env.DB.prepare(
    'SELECT user_id FROM board_comments WHERE id = ? AND post_id = ? AND deleted = 0'
  ).bind(commentId, postId).first<{ user_id: string }>();
  if (!comment) return c.json({ error: 'Ikke fundet' }, 404);

  if (comment.user_id !== sub && role !== 'admin') {
    // Tjek hold-rolle
    const post = await c.env.DB.prepare(
      'SELECT team_id FROM board_posts WHERE id = ?'
    ).bind(postId).first<{ team_id: string }>();
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
    ).bind(sub, post?.team_id ?? '').first<{ role: string }>();
    if ((ROLE_LEVEL[membership?.role ?? 'guest'] ?? 0) < ROLE_LEVEL.team_manager) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) return c.json({ error: 'body påkrævet' }, 400);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'UPDATE board_comments SET body = ?, edited_at = ? WHERE id = ?'
  ).bind(body.trim(), now, commentId).run();

  return c.json({ ok: true, edited_at: now });
});

// ── DELETE /api/board/:id/comments/:commentId (soft delete) ──────────────────
boardRoutes.delete('/:id/comments/:commentId', requireAuth(), async (c) => {
  const commentId = c.req.param('commentId');
  const postId = c.req.param('id');
  const { sub, role } = c.get('user');

  const comment = await c.env.DB.prepare(
    'SELECT user_id FROM board_comments WHERE id = ? AND post_id = ? AND deleted = 0'
  ).bind(commentId, postId).first<{ user_id: string }>();
  if (!comment) return c.json({ error: 'Ikke fundet' }, 404);

  if (comment.user_id !== sub && role !== 'admin') {
    const post = await c.env.DB.prepare(
      'SELECT team_id FROM board_posts WHERE id = ?'
    ).bind(postId).first<{ team_id: string }>();
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
    ).bind(sub, post?.team_id ?? '').first<{ role: string }>();
    if ((ROLE_LEVEL[membership?.role ?? 'guest'] ?? 0) < ROLE_LEVEL.team_manager) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  await c.env.DB.prepare(
    "UPDATE board_comments SET deleted = 1, deleted_at = datetime('now') WHERE id = ?"
  ).bind(commentId).run();

  return c.json({ ok: true });
});

// ── POST /api/board/:id/attachments ──────────────────────────────────────────
boardRoutes.post('/:id/attachments', requireAuth(), async (c) => {
  const postId = c.req.param('id');

  const post = await c.env.DB.prepare(
    'SELECT id FROM board_posts WHERE id = ? AND deleted = 0'
  ).bind(postId).first();
  if (!post) return c.json({ error: 'Opslag ikke fundet' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'file felt påkrævet' }, 400);

  const rawFilename = c.req.header('X-Filename');
  const filename = rawFilename
    ? decodeURIComponent(rawFilename)
    : file.name;

  const isImage = file.type.startsWith('image/');
  const maxSize = isImage ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: `Filen er for stor (max ${isImage ? '10' : '20'}MB)` }, 413);
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const r2Key = `board/${postId}/${crypto.randomUUID()}.${ext}`;
  await c.env.STORAGE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const url = `${R2_BASE}/${r2Key}`;
  const id = newId();
  const now = new Date().toISOString();
  const attachType = isImage ? 'image' : 'document';

  await c.env.DB.prepare(`
    INSERT INTO board_attachments (id, post_id, type, filename, r2_key, url, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, postId, attachType, filename, r2Key, url, file.size, now).run();

  return c.json({
    id, post_id: postId, type: attachType,
    filename, r2_key: r2Key, url, size_bytes: file.size, created_at: now,
  }, 201);
});

// ── DELETE /api/board/:id/attachments/:attachmentId ───────────────────────────
boardRoutes.delete('/:id/attachments/:attachmentId', requireAuth(), async (c) => {
  const attachmentId = c.req.param('attachmentId');
  const postId = c.req.param('id');
  const { sub, role } = c.get('user');

  const attachment = await c.env.DB.prepare(
    'SELECT a.r2_key, p.user_id, p.team_id FROM board_attachments a JOIN board_posts p ON p.id = a.post_id WHERE a.id = ? AND a.post_id = ?'
  ).bind(attachmentId, postId).first<{ r2_key: string; user_id: string; team_id: string }>();
  if (!attachment) return c.json({ error: 'Ikke fundet' }, 404);

  // Kun post-ejeren, team_manager eller admin
  if (attachment.user_id !== sub && role !== 'admin') {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
    ).bind(sub, attachment.team_id).first<{ role: string }>();
    if ((ROLE_LEVEL[membership?.role ?? 'guest'] ?? 0) < ROLE_LEVEL.team_manager) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  await c.env.STORAGE.delete(attachment.r2_key);
  await c.env.DB.prepare('DELETE FROM board_attachments WHERE id = ?').bind(attachmentId).run();

  return c.json({ ok: true });
});
