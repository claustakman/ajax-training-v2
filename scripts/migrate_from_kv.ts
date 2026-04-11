/**
 * migrate_from_kv.ts
 *
 * Henter data fra v1 KV Worker og genererer SQL-INSERT statements til D1.
 *
 * Kør: npx tsx scripts/migrate_from_kv.ts > database/migrations/0002_kv_import.sql
 *
 * Forudsætninger:
 *   - KV Worker URL: https://traening-worker.claus-takman.workers.dev
 *   - KV Worker svarer på GET /<key> med JSON-body
 *   - Default hold oprettes som første INSERT (bruges som team_id for alle migrerede data)
 */

const KV_BASE = "https://traening-worker.claus-takman.workers.dev";
const DEFAULT_TEAM_ID = "team_ajax_u11_2025";
const DEFAULT_TEAM = {
  id: DEFAULT_TEAM_ID,
  name: "Ajax U11 2025/2026",
  age_group: "U11",
  season: "2025/2026",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sql(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, str, i) => {
    const val = values[i - 1];
    return acc + escape(val) + str;
  });
}

function escape(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function newId(): string {
  // Simple UUID-v4-like ID (crypto.randomUUID available in Node 19+, else fallback)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function fetchKV(key: string): Promise<unknown> {
  const url = `${KV_BASE}/${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`KV fetch failed for key "${key}": ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function out(line: string) {
  process.stdout.write(line + "\n");
}

function log(msg: string) {
  process.stderr.write("[migrate] " + msg + "\n");
}

// ---------------------------------------------------------------------------
// Types (løse typer der matcher v1-strukturen)
// ---------------------------------------------------------------------------

interface KVExercise {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  age_groups?: string[];
  stars?: number;
  variants?: string;
  link?: string;
  defaultMins?: number;
  default_mins?: number;
  image?: string; // base64 i v1 — logges, uploades ikke her
  [key: string]: unknown;
}

interface KVTraining {
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  location?: string;
  leadTrainer?: string;
  lead_trainer?: string;
  trainers?: string[];
  themes?: string[];
  focusPoints?: string;
  focus_points?: string;
  sections?: unknown[];
  stars?: number;
  archived?: boolean | number;
  holdsportId?: string;
  holdsport_id?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface KVUser {
  id?: string;
  name: string;
  email: string;
  role?: string;
  pin?: string; // ignoreres
  createdAt?: string;
  [key: string]: unknown;
}

interface KVQuarter {
  id?: string;
  quarter: number;
  themes?: string[];
  [key: string]: unknown;
}

interface KVTemplate {
  id?: string;
  name: string;
  sections?: unknown[];
  teamId?: string;
  [key: string]: unknown;
}

interface KVSectionType {
  id?: string;
  label: string;
  color: string;
  cls?: string;
  tags?: string[];
  required?: boolean | number;
  sort_order?: number;
  sortOrder?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  out("-- ============================================================");
  out("-- Ajax Træningsplanlægger v2 — KV → D1 Migration");
  out(`-- Genereret: ${new Date().toISOString()}`);
  out("-- ============================================================");
  out("PRAGMA foreign_keys = OFF;");
  out("BEGIN TRANSACTION;");
  out("");

  // ------------------------------------------------------------------
  // 1. Default hold
  // ------------------------------------------------------------------
  out("-- 1. Default hold");
  out(
    `INSERT OR IGNORE INTO teams (id, name, age_group, season) VALUES (` +
      `${escape(DEFAULT_TEAM.id)}, ${escape(DEFAULT_TEAM.name)}, ` +
      `${escape(DEFAULT_TEAM.age_group)}, ${escape(DEFAULT_TEAM.season)});`
  );
  out("");

  // ------------------------------------------------------------------
  // 2. Øvelser — hal + fys
  // ------------------------------------------------------------------
  for (const catalog of ["hal", "fys"] as const) {
    log(`Henter øvelser: ${catalog}`);
    let exercises: KVExercise[] = [];
    try {
      const raw = await fetchKV(catalog);
      exercises = Array.isArray(raw) ? (raw as KVExercise[]) : [];
    } catch (e) {
      log(`ADVARSEL: Kunne ikke hente "${catalog}": ${e}`);
    }
    out(`-- 2. Øvelser (catalog=${catalog}) — ${exercises.length} stk`);
    let withImage = 0;
    for (const ex of exercises) {
      const id = ex.id ?? newId();
      const tags = JSON.stringify(ex.tags ?? []);
      const ageGroups = JSON.stringify(ex.age_groups ?? []);
      const defaultMins = ex.default_mins ?? ex.defaultMins ?? null;
      if (ex.image) {
        withImage++;
        log(`  Øvelse med billede (base64): id=${id} name="${ex.name}" — upload til R2 manuelt`);
      }
      out(
        `INSERT OR IGNORE INTO exercises (id, name, description, catalog, category, tags, age_groups, stars, variants, link, default_mins) VALUES (` +
          `${escape(id)}, ${escape(ex.name)}, ${escape(ex.description ?? null)}, ${escape(catalog)}, ` +
          `${escape(ex.category ?? null)}, ${escape(tags)}, ${escape(ageGroups)}, ` +
          `${escape(ex.stars ?? 0)}, ${escape(ex.variants ?? null)}, ${escape(ex.link ?? null)}, ` +
          `${escape(defaultMins)});`
      );
    }
    if (withImage > 0) {
      log(`  ${withImage} øvelse(r) med base64-billeder — upload til R2 og opdater image_r2_key/image_url manuelt`);
    }
    out("");
  }

  // ------------------------------------------------------------------
  // 3. Træninger
  // ------------------------------------------------------------------
  log("Henter træninger");
  let trainings: KVTraining[] = [];
  try {
    const raw = await fetchKV("trainings");
    trainings = Array.isArray(raw) ? (raw as KVTraining[]) : [];
  } catch (e) {
    log(`ADVARSEL: Kunne ikke hente "trainings": ${e}`);
  }
  out(`-- 3. Træninger — ${trainings.length} stk`);
  for (const t of trainings) {
    const id = t.id ?? newId();
    const trainers = JSON.stringify(t.trainers ?? []);
    const themes = JSON.stringify(t.themes ?? []);
    const sections = JSON.stringify(t.sections ?? []);
    const archived = t.archived === true || t.archived === 1 ? 1 : 0;
    out(
      `INSERT OR IGNORE INTO trainings (id, team_id, title, date, start_time, end_time, location, lead_trainer, trainers, themes, focus_points, sections, stars, archived, holdsport_id) VALUES (` +
        `${escape(id)}, ${escape(DEFAULT_TEAM_ID)}, ${escape(t.title ?? null)}, ` +
        `${escape(t.date ?? null)}, ${escape(t.start_time ?? t.startTime ?? null)}, ` +
        `${escape(t.end_time ?? t.endTime ?? null)}, ${escape(t.location ?? null)}, ` +
        `${escape(t.lead_trainer ?? t.leadTrainer ?? null)}, ${escape(trainers)}, ` +
        `${escape(themes)}, ${escape(t.focus_points ?? t.focusPoints ?? null)}, ` +
        `${escape(sections)}, ${escape(t.stars ?? 0)}, ${escape(archived)}, ` +
        `${escape(t.holdsport_id ?? t.holdsportId ?? null)});`
    );
  }
  out("");

  // ------------------------------------------------------------------
  // 4. Årshjul (quarters)
  // ------------------------------------------------------------------
  log("Henter årshjul");
  let quarters: KVQuarter[] = [];
  try {
    const raw = await fetchKV("quarters");
    quarters = Array.isArray(raw) ? (raw as KVQuarter[]) : [];
  } catch (e) {
    log(`ADVARSEL: Kunne ikke hente "quarters": ${e}`);
  }
  out(`-- 4. Årshjul — ${quarters.length} kvartaler`);
  for (const q of quarters) {
    const id = q.id ?? newId();
    const themes = JSON.stringify(q.themes ?? []);
    out(
      `INSERT OR IGNORE INTO quarters (id, team_id, quarter, themes) VALUES (` +
        `${escape(id)}, ${escape(DEFAULT_TEAM_ID)}, ${escape(q.quarter)}, ${escape(themes)});`
    );
  }
  out("");

  // ------------------------------------------------------------------
  // 5. Brugere
  // ------------------------------------------------------------------
  log("Henter brugere");
  let users: KVUser[] = [];
  try {
    const raw = await fetchKV("users");
    users = Array.isArray(raw) ? (raw as KVUser[]) : [];
  } catch (e) {
    log(`ADVARSEL: Kunne ikke hente "users": ${e}`);
  }
  out(`-- 5. Brugere — ${users.length} stk`);
  out("-- BEMÆRK: password_hash sættes til en placeholder — brugerne skal resette password");
  for (const u of users) {
    const id = u.id ?? newId();
    const role = u.role ?? "trainer";
    const inviteToken = newId();
    // Placeholder hash — brugere skal skifte password ved første login
    const passwordHash = "$2a$10$PLACEHOLDER_RESET_REQUIRED";
    out(
      `INSERT OR IGNORE INTO users (id, name, email, password_hash, role, invite_token) VALUES (` +
        `${escape(id)}, ${escape(u.name)}, ${escape(u.email)}, ` +
        `${escape(passwordHash)}, ${escape(role)}, ${escape(inviteToken)});`
    );
    // Tilknyt til default hold
    out(
      `INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (${escape(id)}, ${escape(DEFAULT_TEAM_ID)});`
    );
  }
  out("");

  // ------------------------------------------------------------------
  // 6. Templates
  // ------------------------------------------------------------------
  log("Henter templates");
  let templates: KVTemplate[] = [];
  try {
    const raw = await fetchKV("templates");
    templates = Array.isArray(raw) ? (raw as KVTemplate[]) : [];
  } catch (e) {
    log(`ADVARSEL: Kunne ikke hente "templates": ${e}`);
  }
  out(`-- 6. Templates — ${templates.length} stk`);
  for (const tmpl of templates) {
    const id = tmpl.id ?? newId();
    const sections = JSON.stringify(tmpl.sections ?? []);
    out(
      `INSERT OR IGNORE INTO templates (id, team_id, name, sections) VALUES (` +
        `${escape(id)}, ${escape(DEFAULT_TEAM_ID)}, ${escape(tmpl.name)}, ${escape(sections)});`
    );
  }
  out("");

  // ------------------------------------------------------------------
  // 7. SectionTypes (overskriver ikke seed, men tilføjer custom)
  // ------------------------------------------------------------------
  log("Henter sectionTypes");
  let sectionTypes: KVSectionType[] = [];
  try {
    const raw = await fetchKV("sectionTypes");
    sectionTypes = Array.isArray(raw) ? (raw as KVSectionType[]) : [];
  } catch (e) {
    log(`ADVARSEL: Kunne ikke hente "sectionTypes": ${e}`);
  }
  out(`-- 7. SectionTypes — ${sectionTypes.length} stk`);
  for (const st of sectionTypes) {
    const id = st.id ?? newId();
    const tags = JSON.stringify(st.tags ?? []);
    const required = st.required === true || st.required === 1 ? 1 : 0;
    const sortOrder = st.sort_order ?? st.sortOrder ?? 0;
    out(
      `INSERT OR IGNORE INTO section_types (id, label, color, cls, tags, required, sort_order) VALUES (` +
        `${escape(id)}, ${escape(st.label)}, ${escape(st.color)}, ` +
        `${escape(st.cls ?? id)}, ${escape(tags)}, ${escape(required)}, ${escape(sortOrder)});`
    );
  }
  out("");

  out("COMMIT;");
  out("PRAGMA foreign_keys = ON;");

  log("Færdig. Kør: wrangler d1 execute ajax-traening --file=database/migrations/0002_kv_import.sql");
}

main().catch((err) => {
  process.stderr.write(`FEJL: ${err}\n`);
  process.exit(1);
});
