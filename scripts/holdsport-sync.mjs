#!/usr/bin/env node
// holdsport-sync.mjs — natlig Holdsport-synkronisering
// Kører via GitHub Actions. Bruger samme logik som handleSyncAll i Trainings.tsx.
//
// Miljøvariabler (GitHub Secrets):
//   API_URL        — https://ajax-traening-worker.claus-takman.workers.dev
//   SYNC_EMAIL     — service-bruger email
//   SYNC_PASSWORD  — service-bruger password

const API_URL = process.env.API_URL;
const EMAIL = process.env.SYNC_EMAIL;
const PASSWORD = process.env.SYNC_PASSWORD;

if (!API_URL || !EMAIL || !PASSWORD) {
  console.error('Mangler miljøvariabler: API_URL, SYNC_EMAIL, SYNC_PASSWORD');
  process.exit(1);
}

// Hold-rolle → felt på træningen. Samme logik som frontend/src/lib/holdsportAttendance.ts
const ROLE_FIELD = {
  trainer: 'trainers',
  team_manager: 'trainers',
  keeper_trainer: 'keeper_trainers',
  youth_trainer: 'youth_trainers',
};

async function apiFetch(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${path} → ${res.status}: ${body.error ?? res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  // 1. Log ind
  console.log('→ Logger ind...');
  const { token, user } = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  console.log(`  Logget ind som: ${user.name}`);

  // 2. Sync per hold
  for (const team of user.teams) {
    console.log(`\n→ Hold: ${team.name}`);

    // Hent Holdsport-config
    let config;
    try {
      config = await apiFetch(`/api/holdsport/config?team_id=${team.id}`, {}, token);
    } catch (e) {
      console.log(`  Ingen Holdsport-config — springer over`);
      continue;
    }
    if (!config?.workerUrl || !config?.token) {
      console.log(`  Holdsport ikke konfigureret — springer over`);
      continue;
    }

    // Hent team-members med holdsport_sync flag
    const members = await apiFetch(`/api/users/team-members?team_id=${team.id}`, {}, token);
    const syncField = new Map();   // navn → felt (trainers | keeper_trainers | youth_trainers)
    const nonSyncField = new Map();
    for (const m of members) {
      const field = ROLE_FIELD[m.team_role];
      if (!field) continue;
      (m.holdsport_sync === 0 ? nonSyncField : syncField).set(m.name, field);
    }
    console.log(`  Trænere med sync: ${[...syncField.keys()].join(', ') || '(ingen)'}`);
    console.log(`  Trænere uden sync (bevares): ${[...nonSyncField.keys()].join(', ') || '(ingen)'}`);

    // Hent fremtidige Holdsport-træninger fra appen
    const trainings = await apiFetch(`/api/trainings?team_id=${team.id}&archived=0`, {}, token);
    const hsTrainings = trainings.filter(t => t.holdsport_id && t.date);
    console.log(`  Holdsport-træninger: ${hsTrainings.length}`);
    if (hsTrainings.length === 0) continue;

    // Hent Holdsport-hold
    const hsTeamsRes = await fetch(`${config.workerUrl}/teams`, {
      headers: { 'X-Token': config.token, 'Accept': 'application/json' },
    });
    if (!hsTeamsRes.ok) {
      console.log(`  Kunne ikke hente Holdsport-hold: ${hsTeamsRes.status}`);
      continue;
    }
    const hsTeams = await hsTeamsRes.json();

    let updated = 0;
    for (const t of hsTrainings) {
      // Find aktiviteten på tværs af Holdsport-hold
      let found = null;
      for (const hsTeam of hsTeams) {
        // Forsøg detalje-endpoint
        try {
          const detailRes = await fetch(
            `${config.workerUrl}/teams/${hsTeam.id}/activities/${t.holdsport_id}`,
            { headers: { 'X-Token': config.token, 'Accept': 'application/json' } }
          );
          if (detailRes.ok) {
            const act = await detailRes.json();
            if (act?.id) { found = act; break; }
          }
        } catch { /* prøv næste */ }

        // Fallback: søg i liste
        try {
          const listRes = await fetch(
            `${config.workerUrl}/teams/${hsTeam.id}/activities?date=${t.date}&to=${t.date}&per_page=100`,
            { headers: { 'X-Token': config.token, 'Accept': 'application/json' } }
          );
          if (listRes.ok) {
            const acts = await listRes.json();
            const match = Array.isArray(acts)
              ? acts.find(a => String(a.id) === String(t.holdsport_id))
              : null;
            if (match) { found = match; break; }
          }
        } catch { /* prøv næste */ }
      }

      if (!found) {
        console.log(`  ${t.date} — ikke fundet på Holdsport, springer over`);
        continue;
      }

      const users = found.activities_users;
      let playerCount = 0;
      const lists = { trainers: [], keeper_trainers: [], youth_trainers: [] };

      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.status_code !== 1) continue;
          const field = syncField.get(u.name);
          if (field) lists[field].push(u.name);
          else playerCount++;
        }
      } else {
        playerCount = found.attendance_count ?? found.signups_count ?? 0;
      }

      // Bevar non-sync trænere fra den eksisterende træning
      for (const field of Object.keys(lists)) {
        for (const name of (t[field] ?? [])) {
          if (nonSyncField.get(name) === field) lists[field].push(name);
        }
      }

      const patch = {
        participant_count: playerCount > 0 ? playerCount : null,
        ...lists,
      };
      await apiFetch(`/api/trainings/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }, token);

      console.log(`  ${t.date} ✓ — ${playerCount} spillere, trænere: ${lists.trainers.join(', ') || '(ingen)'}, keeper: ${lists.keeper_trainers.join(', ') || '(ingen)'}, ung: ${lists.youth_trainers.join(', ') || '(ingen)'}`);
      updated++;
    }
    console.log(`  → ${updated} træning(er) opdateret`);
  }

  console.log('\n✅ Holdsport-sync færdig');
}

main().catch(err => {
  console.error('❌ Sync fejlede:', err.message);
  process.exit(1);
});
