import { Hono, type Context } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;
type HonoCtx = Context<HonoEnv>;

export const holdsportRoutes = new Hono<HonoEnv>();

interface TeamRow {
  holdsport_worker_url: string | null;
  holdsport_token: string | null;
}

// Hent Holdsport-konfiguration for et hold — fra DB eller fra headers (fallback)
async function getHSConfig(c: HonoCtx, teamId: string): Promise<{ workerUrl: string; token: string } | null> {
  const team = await c.env.DB.prepare(
    'SELECT holdsport_worker_url, holdsport_token FROM teams WHERE id = ?'
  ).bind(teamId).first<TeamRow>();

  if (team?.holdsport_worker_url) {
    return {
      workerUrl: team.holdsport_worker_url.replace(/\/+$/, ''),
      token: team.holdsport_token ?? c.env.HS_TOKEN ?? '',
    };
  }

  // Fallback: headers sendt fra klient (localStorage-baseret config)
  const workerUrl = c.req.header('X-HS-Worker-URL');
  const token = c.req.header('X-HS-Token') ?? c.env.HS_TOKEN ?? '';
  if (workerUrl) return { workerUrl: workerUrl.replace(/\/+$/, ''), token };

  return null;
}

// Ekstraher aktiviteter fra Holdsport API-svar (håndtér array og objekt-formater)
function extractActivities(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['activities', 'items', 'data', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

// GET /api/holdsport/activities?team_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD
holdsportRoutes.get('/activities', requireAuth('trainer'), async (c) => {
  const teamId = c.req.query('team_id');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const config = await getHSConfig(c, teamId);
  if (!config) return c.json({ error: 'Holdsport ikke konfigureret for dette hold' }, 400);

  const { workerUrl, token } = config;

  // Hent alle hold fra Holdsport worker
  let teamsData: unknown;
  try {
    const teamsRes = await fetch(`${workerUrl}/teams`, {
      headers: { 'X-Token': token, 'Authorization': `Bearer ${token}` },
    });
    if (!teamsRes.ok) return c.json({ error: `Holdsport teams-fejl: ${teamsRes.status}` }, 502);
    teamsData = await teamsRes.json();
  } catch (e) {
    return c.json({ error: `Holdsport forbindelsesfejl: ${e}` }, 502);
  }

  const teams = extractActivities(teamsData) as Array<{ id: string | number }>;

  if (teams.length === 0) {
    // Ingen hold fra Holdsport — prøv direkte activities-endpoint
    const url = new URL(`${workerUrl}/activities`);
    if (from) url.searchParams.set('from', from);
    if (to) url.searchParams.set('to', to);
    url.searchParams.set('per_page', '100');

    const res = await fetch(url.toString(), {
      headers: { 'X-Token': token, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return c.json({ error: `Holdsport fejl: ${res.status}` }, 502);
    const data = await res.json();
    const activities = extractActivities(data).filter((a: unknown) => {
      const act = a as Record<string, unknown>;
      return act.starttime || act.endtime || act.start_time || act.end_time;
    });
    return c.json(activities);
  }

  // Hent aktiviteter for hvert hold
  const allActivities: unknown[] = [];
  for (const team of teams) {
    const url = new URL(`${workerUrl}/teams/${team.id}/activities`);
    if (from) url.searchParams.set('date', from);
    if (to) url.searchParams.set('to', to);
    url.searchParams.set('per_page', '100');

    try {
      const res = await fetch(url.toString(), {
        headers: { 'X-Token': token, 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const activities = extractActivities(data).filter((a: unknown) => {
        const act = a as Record<string, unknown>;
        return act.starttime || act.endtime || act.start_time || act.end_time;
      });
      allActivities.push(...activities);
    } catch { continue; }
  }

  return c.json(allActivities);
});

// GET /api/holdsport/ping?team_id=X
holdsportRoutes.get('/ping', requireAuth('trainer'), async (c) => {
  const teamId = c.req.query('team_id');
  if (!teamId) return c.json({ error: 'team_id påkrævet' }, 400);

  const config = await getHSConfig(c, teamId);
  if (!config) return c.json({ ok: false, error: 'Holdsport ikke konfigureret for dette hold' });

  try {
    const res = await fetch(`${config.workerUrl}/teams`, {
      headers: { 'X-Token': config.token, 'Authorization': `Bearer ${config.token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (body.error as string) ?? `HTTP ${res.status}`;
      return c.json({ ok: false, error: msg });
    }
    const data = await res.json();
    const teams = extractActivities(data);
    return c.json({ ok: true, team_count: teams.length });
  } catch (e) {
    return c.json({ ok: false, error: String(e) });
  }
});
