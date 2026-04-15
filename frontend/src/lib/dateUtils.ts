// Dato- og tidshjælpefunktioner

const DAY_NAMES = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const DAY_SHORT = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const MON_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function parseDateLocal(dateStr: string): Date {
  // Parse "YYYY-MM-DD" som lokal dato (undgå UTC-offset-problem)
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Dag-tal, fx "14" */
export function fmtDay(dateStr: string): string {
  return String(parseDateLocal(dateStr).getDate());
}

/** Månedsnavn (3 bogstaver), fx "apr" */
export function fmtMon(dateStr: string): string {
  return MON_SHORT[parseDateLocal(dateStr).getMonth()];
}

/** Kort ugedag, fx "Ons" */
export function fmtWday(dateStr: string): string {
  return DAY_SHORT[parseDateLocal(dateStr).getDay()];
}

/** Fuld ugedag, fx "Onsdag" */
export function fmtWdayFull(dateStr: string): string {
  return DAY_NAMES[parseDateLocal(dateStr).getDay()];
}

/** Formatér "HH:MM"–"HH:MM" varighed i minutter */
export function durMin(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

/** Samlet minutter for en sektion-liste, inkl. parallelle grupper (tæl kun én af hver group) */
export function totalMins(sections: Array<{ mins: number; group?: string }>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const s of sections) {
    if (s.group) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        total += s.mins;
      }
    } else {
      total += s.mins;
    }
  }
  return total;
}

/** Formatér ISO-dato til dansk langt format: "Onsdag 14. apr 2025" */
export function fmtDateLong(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}. ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
