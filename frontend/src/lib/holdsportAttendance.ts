// Delt Holdsport-tilmeldingslogik — bruges af Trainings, TrainingEditor, Archive og HoldsportImportModal.
// Samme logik findes også i scripts/holdsport-sync.mjs (natlig sync) — hold dem i sync.
import type { Training } from './types';

export interface TeamMember {
  id: string;
  name: string;
  team_role: string;
  holdsport_sync: number;
}

type RosterField = 'trainers' | 'keeper_trainers' | 'youth_trainers';

const ROLE_FIELD: Record<string, RosterField> = {
  trainer: 'trainers',
  team_manager: 'trainers',
  keeper_trainer: 'keeper_trainers',
  youth_trainer: 'youth_trainers',
};

export type Attendance = Pick<Training, 'participant_count' | 'trainers' | 'keeper_trainers' | 'youth_trainers'>;

/**
 * Fordeler Holdsport-tilmeldte (status_code=1) på spillere, trænere, keepertrænere og ungtrænere.
 * - Navne der matcher en app-bruger med trænerrolle (og holdsport_sync≠0) placeres i rollens liste
 * - Resten tælles som spillere
 * - Brugere med holdsport_sync=0 bevares fra den eksisterende træning
 */
export function extractAttendance(
  activity: unknown,
  members: TeamMember[],
  existing?: Partial<Training>,
): Attendance {
  const rec = activity as Record<string, unknown>;
  const syncField = new Map<string, RosterField>();
  const nonSync = new Map<string, RosterField>();
  for (const m of members) {
    const field = ROLE_FIELD[m.team_role];
    if (!field) continue;
    (m.holdsport_sync === 0 ? nonSync : syncField).set(m.name, field);
  }

  const out: Record<RosterField, string[]> = { trainers: [], keeper_trainers: [], youth_trainers: [] };
  let playerCount = 0;
  const users = rec.activities_users;
  if (Array.isArray(users)) {
    for (const u of users) {
      const ur = u as Record<string, unknown>;
      if (ur.status_code !== 1) continue;
      const field = syncField.get(ur.name as string);
      if (field) out[field].push(ur.name as string);
      else playerCount++;
    }
  } else {
    // activities_users ikke tilgængeligt — brug attendance_count som-er
    playerCount = (rec.attendance_count ?? rec.signups_count ?? 0) as number;
  }

  // Bevar non-sync brugere der allerede er på træningen
  for (const f of ['trainers', 'keeper_trainers', 'youth_trainers'] as RosterField[]) {
    for (const name of existing?.[f] ?? []) {
      if (nonSync.get(name) === f) out[f].push(name);
    }
  }

  return {
    participant_count: playerCount > 0 ? playerCount : undefined,
    ...out,
  };
}
