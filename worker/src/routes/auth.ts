import { Hono } from 'hono';
import { verifyPassword, createJWT, hashPassword, verifyJWT, newId } from '../lib/auth';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const authRoutes = new Hono<HonoEnv>();

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: 'email og password påkrævet' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email.toLowerCase().trim()).first();

  if (!user) return c.json({ error: 'Ukendt email eller kodeord' }, 401);
  const ok = await verifyPassword(password, user.password_hash as string);
  if (!ok) return c.json({ error: 'Ukendt email eller kodeord' }, 401);

  const token = await createJWT(
    { sub: user.id as string, name: user.name as string, role: user.role as string },
    c.env.JWT_SECRET
  );

  await c.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?')
    .bind(new Date().toISOString(), user.id as string).run();

  // Hent holdtildelinger
  const teams = await c.env.DB.prepare(
    'SELECT t.id, t.name, t.age_group, t.season FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
  ).bind(user.id as string).all();

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teams: teams.results,
    },
  });
});

// GET /api/auth/me
authRoutes.get('/me', requireAuth(), async (c) => {
  const { sub } = c.get('user');
  const user = await c.env.DB.prepare('SELECT id, name, email, role, last_seen FROM users WHERE id = ?')
    .bind(sub).first();
  if (!user) return c.json({ error: 'Ikke fundet' }, 404);

  const teams = await c.env.DB.prepare(
    'SELECT t.id, t.name, t.age_group, t.season FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
  ).bind(sub).all();

  return c.json({ ...user, teams: teams.results });
});

// POST /api/auth/invite — admin opretter invite-token og returnerer link
authRoutes.post('/invite', requireAuth('admin'), async (c) => {
  const { email, name, role = 'trainer' } = await c.req.json<{ email: string; name: string; role?: string }>();
  if (!email || !name) return c.json({ error: 'email og name påkrævet' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim()).first();
  if (existing) return c.json({ error: 'Email er allerede i brug' }, 409);

  const id = newId();
  const inviteToken = newId();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const placeholderHash = '$2a$10$PLACEHOLDER_RESET_REQUIRED';

  await c.env.DB.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, invite_token, invite_expires) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, name, email.toLowerCase().trim(), placeholderHash, role, inviteToken, inviteExpires).run();

  return c.json({ ok: true, invite_token: inviteToken, user_id: id });
});

// POST /api/auth/accept-invite
authRoutes.post('/accept-invite', async (c) => {
  const { token, password } = await c.req.json<{ token: string; password: string }>();
  if (!token || !password) return c.json({ error: 'token og password påkrævet' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE invite_token = ? AND invite_expires > ?'
  ).bind(token, new Date().toISOString()).first();
  if (!user) return c.json({ error: 'Ugyldigt eller udløbet invitationslink' }, 400);

  const hash = await hashPassword(password);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires = NULL WHERE id = ?'
  ).bind(hash, user.id as string).run();

  const jwt = await createJWT(
    { sub: user.id as string, name: user.name as string, role: user.role as string },
    c.env.JWT_SECRET
  );

  const teams = await c.env.DB.prepare(
    'SELECT t.id, t.name, t.age_group, t.season FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
  ).bind(user.id as string).all();

  return c.json({
    token: jwt,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, teams: teams.results },
  });
});

// POST /api/auth/reset-password — skifter password (kræver gammelt kodeord)
authRoutes.post('/reset-password', requireAuth(), async (c) => {
  const { current_password, new_password } = await c.req.json<{ current_password: string; new_password: string }>();
  const { sub } = c.get('user');

  const user = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(sub).first();
  if (!user) return c.json({ error: 'Ikke fundet' }, 404);

  const ok = await verifyPassword(current_password, user.password_hash as string);
  if (!ok) return c.json({ error: 'Forkert nuværende kodeord' }, 400);

  const hash = await hashPassword(new_password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, sub).run();
  return c.json({ ok: true });
});

// POST /api/auth/logout — client-side primært, men bekræfter token
authRoutes.post('/logout', requireAuth(), async (c) => {
  return c.json({ ok: true });
});
