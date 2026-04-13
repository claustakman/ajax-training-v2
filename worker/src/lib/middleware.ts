// Auth middleware til Hono
import type { Context, MiddlewareHandler, Next } from 'hono';
import { verifyJWT, type JWTPayload } from './auth';
import type { Env } from '../index';

export type AuthContext = {
  Variables: {
    user: JWTPayload;
  };
};

export const ROLE_LEVEL: Record<string, number> = {
  guest: 1,
  trainer: 2,
  team_manager: 3,
  admin: 4,
};

/**
 * requireAuth(minRole?)
 *
 * Rolletjek sker i prioriteret rækkefølge:
 * 1. Admin (global rolle på users.role) — har altid adgang
 * 2. Hold-specifik rolle fra user_teams.role for det hold angivet i ?team_id=
 * 3. Fallback: JWT-rollen (bruges kun for endpoints uden team_id-kontekst)
 */
export function requireAuth(minRole?: string): MiddlewareHandler<{ Bindings: Env } & AuthContext> {
  return async (c: Context<{ Bindings: Env } & AuthContext>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
    if (!payload) return c.json({ error: 'Unauthorized' }, 401);

    if (minRole) {
      // Admin er global — altid adgang
      if (payload.role === 'admin') {
        c.set('user', payload);
        await next();
        return;
      }

      // Hvis der er en team_id, slå hold-rollen op
      const teamId = c.req.query('team_id') ?? (await tryBodyTeamId(c));
      if (teamId) {
        const row = await c.env.DB.prepare(
          'SELECT role FROM user_teams WHERE user_id = ? AND team_id = ?'
        ).bind(payload.sub, teamId).first<{ role: string }>();
        const teamRole = row?.role ?? 'guest';
        if ((ROLE_LEVEL[teamRole] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      } else {
        // Ingen team_id — brug JWT-rollen
        if ((ROLE_LEVEL[payload.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      }
    }

    c.set('user', payload);
    await next();
  };
}

// Forsøger at læse team_id fra JSON-body uden at forbruge body-streamen
async function tryBodyTeamId(c: Context): Promise<string | null> {
  try {
    const clone = c.req.raw.clone();
    const body = await clone.json() as Record<string, unknown>;
    return typeof body.team_id === 'string' ? body.team_id : null;
  } catch {
    return null;
  }
}
