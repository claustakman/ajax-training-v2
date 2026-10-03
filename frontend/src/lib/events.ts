// Kampe og stævner — gemmes i trainings-tabellen med kind='match' | 'tournament'.
// Hjælpere til klassifikation af Holdsport-aktiviteter og visning.
import type { Training, TrainingKind } from './types';

export function isTrainingKind(t: Pick<Training, 'kind'>): boolean {
  return !t.kind || t.kind === 'training';
}

export const KIND_STYLE: Record<'match' | 'tournament', { label: string; color: string; light: string }> = {
  match:      { label: 'Kamp',   color: '#1D9E75', light: 'rgba(29,158,117,0.1)' },
  tournament: { label: 'Stævne', color: '#d97706', light: 'rgba(217,119,6,0.1)' },
};

// Holdsport event_type_id: 1=Kamp, 2=Træning, 4=Stævne. Fallback til aktivitetsnavn.
export type ActivityKind = TrainingKind | 'other';

export function activityKind(activity: Record<string, unknown>): ActivityKind {
  const typeId = Number(activity.event_type_id);
  if (typeId === 1) return 'match';
  if (typeId === 2) return 'training';
  if (typeId === 4) return 'tournament';
  const name = String(activity.name || activity.title || '').toLowerCase();
  if (name.includes('stævne') || name.includes('cup') || name.includes('turnering')) return 'tournament';
  if (name.includes('kamp')) return 'match';
  if (name.includes('træning') || name.includes('training')) return 'training';
  return 'other';
}

/**
 * "Kamp: Ajax København 2 - Holte 2" → { home: 'Ajax København 2', away: 'Holte 2' }
 * "FHH90 - Ajax 2 (Træningskamp i Fløng)" → { home: 'FHH90', away: 'Ajax 2' }
 */
export function parseMatchTeams(name: string): { home: string; away: string } {
  let s = name.trim().replace(/\s*\([^)]*\)\s*$/, '');
  const colon = s.indexOf(':');
  const dash = s.indexOf(' - ');
  if (colon >= 0 && (dash < 0 || colon < dash)) s = s.slice(colon + 1).trim();
  const idx = s.indexOf(' - ');
  if (idx < 0) return { home: s, away: '' };
  return { home: s.slice(0, idx).trim(), away: s.slice(idx + 3).trim() };
}

/** Antal dage et stævne varer (1 hvis ingen/samme slutdato) */
export function eventDays(t: Pick<Training, 'date' | 'end_date'>): number {
  if (!t.date || !t.end_date || t.end_date <= t.date) return 1;
  const ms = new Date(t.end_date + 'T00:00:00').getTime() - new Date(t.date + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function eventTitle(t: Pick<Training, 'kind' | 'home_team' | 'away_team' | 'title'>): string {
  if (t.kind === 'match') {
    const parts = [t.home_team, t.away_team].filter(Boolean);
    if (parts.length) return parts.join(' - ');
  }
  return t.title || (t.kind === 'tournament' ? 'Stævne' : 'Kamp');
}
