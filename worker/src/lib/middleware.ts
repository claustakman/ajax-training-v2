// Auth middleware til Hono
import type { Context, MiddlewareHandler, Next } from 'hono';
import { verifyJWT, type JWTPayload } from './auth';
import type { Env } from '../index';

export type AuthContext = {
  Variables: {
    user: JWTPayload;
  };
};

const ROLE_LEVEL: Record<string, number> = {
  guest: 1,
  trainer: 2,
  team_manager: 3,
  admin: 4,
};

export function requireAuth(minRole?: string): MiddlewareHandler<{ Bindings: Env } & AuthContext> {
  return async (c: Context<{ Bindings: Env } & AuthContext>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
    if (!payload) return c.json({ error: 'Unauthorized' }, 401);
    if (minRole && (ROLE_LEVEL[payload.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    c.set('user', payload);
    await next();
  };
}
