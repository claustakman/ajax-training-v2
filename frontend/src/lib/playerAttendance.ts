// Træningsfremmøde pr. spiller — hentes live fra Holdsport (gemmes ikke i appen).
// Bruges af Statistik træning og Statistik udvælgelse.
//
// Hentning: ét liste-kald pr. Holdsport-hold for hele perioden (pagineret, 100 pr. side).
// Liste-endpointet har activities_users med, så der er ikke brug for ét kald pr. træning.
import { api } from './api';
import type { HoldsportActivity, Training } from './types';
import { extractPlayerNames, type TeamMember } from './holdsportAttendance';

export interface PlayerAttendance {
  totalTrainings: number;  // HS-træninger hvor tilmeldinger kunne hentes
  players: { name: string; count: number }[];
}

/** Tilmeldinger for én træning */
export interface TrainingAttendance {
  date: string;
  attended: string[];
  roster: string[];
}

/** Seneste 1. maj (i år hvis vi er forbi maj, ellers sidste år) — sæsonstart */
export function seasonStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-05-01`;
}

/** Afholdte Holdsport-træninger i sæsonen (seneste 1. maj → i dag), sorteret på dato.
 *  Samme filter på begge statistiksider, så React Query-cachen ['training-attendance', teamId, ids] deles. */
export function seasonHsTrainings(all: Training[]): Training[] {
  const from = seasonStart();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return all
    .filter(t => (!t.kind || t.kind === 'training') && t.holdsport_id && t.date && t.date >= from && new Date(t.date) <= today)
    .sort((a, b) => a.date!.localeCompare(b.date!));
}

/** "YYYY-MM-DD" for dags dato minus `days` (lokal tid) */
export function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Henter tilmeldinger for de givne træninger med få kald — én periode-hentning pr. Holdsport-hold */
export async function fetchTrainingAttendance(teamId: string, trainings: Training[]): Promise<TrainingAttendance[]> {
  const hsTrainings = trainings.filter(t => t.holdsport_id && t.date);
  if (hsTrainings.length === 0) return [];
  const dates = hsTrainings.map(t => t.date!).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [config, members] = await Promise.all([
    api.fetchHoldsportConfig(teamId),
    api.get<TeamMember[]>(`/api/users/team-members?team_id=${teamId}`),
  ]);
  const hsTeams = await api.fetchHoldsportTeams(config.workerUrl, config.token);

  // Alle aktiviteter i perioden på tværs af Holdsport-hold, slået op på id
  const byId = new Map<string, HoldsportActivity>();
  const lists = await Promise.all(hsTeams.map(team =>
    api.fetchHoldsportActivitiesForTeam(config.workerUrl, config.token, team.id, from, to).catch(() => [] as HoldsportActivity[])
  ));
  for (const list of lists) for (const a of list) byId.set(String(a.id), a);

  const out: TrainingAttendance[] = [];
  for (const t of hsTrainings) {
    const act = byId.get(String(t.holdsport_id));
    if (!act || !Array.isArray((act as Record<string, unknown>).activities_users)) continue;
    out.push({ date: t.date!, ...extractPlayerNames(act, members) });
  }
  return out;
}

/** Tæller fremmøde pr. spiller — evt. kun træninger fra og med `fromDate` (YYYY-MM-DD).
 *  Spillere uden fremmøde i perioden udelades (kamp-widgets viser derimod 0). */
export function aggregateAttendance(results: TrainingAttendance[], fromDate?: string): PlayerAttendance {
  const counts = new Map<string, number>();
  let totalTrainings = 0;
  for (const res of results) {
    if (fromDate && res.date < fromDate) continue;
    totalTrainings++;
    for (const n of res.attended) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const players = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'));
  return { totalTrainings, players };
}

/** Henter og tæller i ét — til en enkelt periode */
export async function fetchPlayerAttendance(teamId: string, trainings: Training[]): Promise<PlayerAttendance> {
  return aggregateAttendance(await fetchTrainingAttendance(teamId, trainings));
}
