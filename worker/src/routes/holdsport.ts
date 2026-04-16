import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const holdsportRoutes = new Hono<HonoEnv>();

// GET /api/holdsport/config?team_id=X
// Returnerer workerUrl + token fra DB så frontend kan kalde Holdsport-workeren direkte.
// Frontend kalder workeren direkte fra browseren (undgår worker-til-worker begrænsning).
holdsportRoutes.get('/config', requireAuth('trainer'), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const team = await c.env.DB.prepare(
    'SELECT holdsport_worker_url, holdsport_token FROM teams WHERE id = ?'
  ).bind(teamId).first<{ holdsport_worker_url: string | null; holdsport_token: string | null }>();

  if (!team?.holdsport_worker_url) {
    return c.json({ error: 'Holdsport ikke konfigureret for dette hold' }, 404);
  }

  return c.json({
    workerUrl: team.holdsport_worker_url.replace(/\/+$/, ''),
    token: team.holdsport_token ?? '',
  });
});
