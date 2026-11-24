// Træningsfremmøde pr. spiller — hentes live fra Holdsport (gemmes ikke i appen).
// Bruges af Statistik træning og Statistik udvælgelse.
import { api } from './api';
import type { Training } from './types';
import { extractPlayerNames, type TeamMember } from './holdsportAttendance';

export interface PlayerAttendance {
  totalTrainings: number;  // HS-træninger hvor tilmeldinger kunne hentes
  players: { name: string; count: number }[];
}

// Henter tilmeldinger for de givne træninger og tæller pr. spiller
export async function fetchPlayerAttendance(teamId: string, trainings: Training[]): Promise<PlayerAttendance> {
  const [config, members] = await Promise.all([
    api.fetchHoldsportConfig(teamId),
    api.get<TeamMember[]>(`/api/users/team-members?team_id=${teamId}`),
  ]);
  const hsTeams = await api.fetchHoldsportTeams(config.workerUrl, config.token);

  const results = await Promise.all(trainings.map(async t => {
    for (const team of hsTeams) {
      try {
        const act = await api.fetchHoldsportActivity(config.workerUrl, config.token, team.id, t.holdsport_id!, t.date!);
        if (act && Array.isArray((act as Record<string, unknown>).activities_users)) return extractPlayerNames(act, members);
      } catch { /* prøv næste hold */ }
    }
    return null;
  }));

  // Alle spillere der optræder på en aktivitet i perioden starter på 0 — så 0 fremmøde også vises
  const counts = new Map<string, number>();
  let totalTrainings = 0;
  for (const res of results) {
    if (!res) continue;
    totalTrainings++;
    for (const n of res.roster) if (!counts.has(n)) counts.set(n, 0);
    for (const n of res.attended) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const players = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'));
  return { totalTrainings, players };
}
