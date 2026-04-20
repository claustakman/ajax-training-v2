import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const aiRoutes = new Hono<HonoEnv>();

interface SectionInput {
  type: string;
  mins: number;
}

interface AIExercise {
  id: string;
  name: string;
  tags: string[];
  defaultMins: number;
  stars: number;
  recent: boolean;
}

interface SectionType {
  id: string;
  label: string;
  tags: string[];
  themes: string[];
  required: boolean;
  sort_order: number;
  team_id: string | null;
}

interface SecCatalog {
  type: string;
  label: string;
  mins: number;
  maxEx: number;
  exercises: AIExercise[];
}

interface AISectionResult {
  sectionIndex: number;
  mins: number;
  exercises: Array<{ exerciseId: string; mins: number }>;
}


function addRequiredSections(
  sections: Array<{ type: string; mins: number }>,
  sectionTypes: SectionType[]
): Array<{ type: string; mins: number }> {
  const required = sectionTypes.filter(st => st.required);
  const result = [...sections];

  for (const req of required) {
    if (!result.some(s => s.type === req.id)) {
      result.unshift({ type: req.id, mins: 15 });
    }
  }

  return result;
}

async function markRecentExercises(
  exercises: AIExercise[],
  teamId: string,
  db: D1Database
): Promise<AIExercise[]> {
  const recent = await db
    .prepare(`
      SELECT sections FROM trainings
      WHERE team_id = ?
        AND archived = 0
      ORDER BY date DESC, created_at DESC
      LIMIT 3
    `)
    .bind(teamId)
    .all();

  const recentIds = new Set<string>();
  for (const row of recent.results) {
    try {
      const sections = JSON.parse(row.sections as string || '[]');
      for (const sec of sections) {
        for (const ex of sec.exercises || []) {
          if (ex.exerciseId) recentIds.add(ex.exerciseId as string);
        }
      }
    } catch { /* ignorer parse-fejl */ }
  }

  return exercises.map(ex => ({
    ...ex,
    recent: recentIds.has(ex.id),
  }));
}

async function getExercisesForSection(
  sectionTypeTags: string[],
  _teamId: string,
  db: D1Database
): Promise<AIExercise[]> {
  if (sectionTypeTags.length === 0) return [];

  const all = await db
    .prepare('SELECT id, name, tags, default_mins, stars FROM exercises ORDER BY stars DESC, name ASC')
    .all();

  return all.results
    .map(r => ({
      id: r.id as string,
      name: r.name as string,
      tags: JSON.parse(r.tags as string || '[]') as string[],
      defaultMins: (r.default_mins as number) || 10,
      stars: (r.stars as number) || 0,
      recent: false,
    }))
    .filter(ex => ex.tags.some(t => sectionTypeTags.includes(t)));
}

async function getSectionTypes(teamId: string, db: D1Database): Promise<SectionType[]> {
  const teamTypes = await db
    .prepare('SELECT * FROM section_types WHERE team_id = ? ORDER BY sort_order ASC')
    .bind(teamId)
    .all();

  if (teamTypes.results.length > 0) {
    return teamTypes.results.map(r => ({
      ...r,
      tags: JSON.parse(r.tags as string || '[]'),
      themes: JSON.parse(r.themes as string || '[]'),
      required: r.required === 1,
    })) as SectionType[];
  }

  const defaults = await db
    .prepare('SELECT * FROM section_types WHERE team_id IS NULL ORDER BY sort_order ASC')
    .all();

  return defaults.results.map(r => ({
    ...r,
    tags: JSON.parse(r.tags as string || '[]'),
    themes: JSON.parse(r.themes as string || '[]'),
    required: r.required === 1,
  })) as SectionType[];
}

function buildPrompt(secCatalogs: SecCatalog[], themes: string[], vary: boolean, ageGroup: string): string {
  const secBlocks = secCatalogs.map((sc, i) =>
    `SEKTION ${i + 1} – ${sc.label} (${sc.mins} min, ` +
    `maks ${sc.maxEx} øvelse${sc.maxEx > 1 ? 'r' : ''})\n` +
    `Tilgængelige øvelser: ${JSON.stringify(sc.exercises)}`
  ).join('\n\n');

  return (
    `Du er assistent for en håndboldtræner for ${ageGroup}.\n` +
    `Sammensæt en træning. Der er ${secCatalogs.length} sektioner ` +
    `nummereret herunder.\n` +
    `For HVER sektion er der angivet præcis hvilke øvelser der må ` +
    `bruges – brug KUN dem.\n\n` +
    secBlocks + '\n\n' +
    `Temaer: ${themes.length ? themes.join(', ') : 'ingen specifikke'}\n` +
    `Variation: ${vary
      ? 'Undgå recent:true øvelser hvis muligt'
      : 'Gentag gerne nylige øvelser'}\n\n` +
    `Returner KUN et JSON-array med præcis ${secCatalogs.length} ` +
    `elementer – ét per sektion i SAMME rækkefølge.\n` +
    `Ingen tekst før eller efter. Format:\n` +
    `[{"sectionIndex":1,"mins":15,"exercises":[{"exerciseId":"ID","mins":8}]},` +
    `{"sectionIndex":2,"mins":20,"exercises":[...]},...]\n\n` +
    `Regler:\n` +
    `- sectionIndex starter ved 1 og svarer til SEKTION-nummeret ovenfor\n` +
    `- Brug KUN øvelser fra den pågældende sektions liste\n` +
    `- Overhold maks antal øvelser per sektion\n` +
    `- Brug defaultMins som udgangspunkt, ` +
    `juster så minutterne summerer til sektionens total\n` +
    `- Foretrræk høje stars og tema-relevante øvelser`
  );
}

async function buildSecCatalogs(
  sections: Array<{ type: string; mins: number }>,
  sectionTypes: SectionType[],
  teamId: string,
  db: D1Database
): Promise<SecCatalog[]> {
  const catalogs: SecCatalog[] = [];

  for (const sec of sections) {
    const sectionType = sectionTypes.find(st => st.id === sec.type);
    if (!sectionType) continue;

    const exercises = await getExercisesForSection(sectionType.tags, teamId, db);
    const withRecent = await markRecentExercises(exercises, teamId, db);

    const avgMins = withRecent.length > 0
      ? Math.round(withRecent.reduce((s, e) => s + e.defaultMins, 0) / withRecent.length)
      : 10;

    const maxEx = Math.max(1, Math.round(sec.mins / avgMins));

    catalogs.push({
      type: sec.type,
      label: sectionType.label,
      mins: sec.mins,
      maxEx,
      exercises: withRecent,
    });
  }

  return catalogs;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(
        `Anthropic API fejl ${response.status}: ` +
        (err.error?.message || response.statusText)
      );
    }

    const data = await response.json() as { content?: Array<{ text: string }> };
    return data.content?.[0]?.text || '';

  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('AI-forslag tog for lang tid — prøv igen');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// POST /api/ai/suggest
// To tilstande:
//   1. Simpel prompt-proxy: body = { prompt: string } — bruges fra katalog AI-knap
//   2. Section-baseret AI-forslag: body = { team_id, sections, themes, vary }
aiRoutes.post('/suggest', requireAuth('trainer'), async (c) => {
  const body = await c.req.json<{
    team_id?: string;
    sections?: SectionInput[];
    themes?: string[];
    vary?: boolean;
    prompt?: string;
  }>();

  // ── Tilstand 1: simpel prompt-proxy ──────────────────────────────────────
  if (body.prompt) {
    try {
      const text = await callAnthropic(body.prompt, c.env.ANTHROPIC_API_KEY);
      return c.json({ text });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Ukendt fejl' }, 502);
    }
  }

  // ── Tilstand 2: section-baseret AI-forslag ────────────────────────────────
  const { team_id, sections = [], themes = [], vary = false } = body;
  if (!team_id) return c.json({ error: 'team_id eller prompt påkrævet' }, 400);
  if (sections.length === 0) return c.json({ error: 'sections må ikke være tom' }, 400);

  // 1. Hent hold (age_group til prompt-kontekst) + sektionstyper
  const teamRow = await c.env.DB.prepare('SELECT age_group FROM teams WHERE id = ?').bind(team_id).first<{ age_group: string }>();
  if (!teamRow) return c.json({ error: 'Hold ikke fundet' }, 404);
  const ageGroup = teamRow.age_group;

  const stResults = await getSectionTypes(team_id, c.env.DB);

  // 2. Tilføj required sektionstyper der ikke allerede er i listen (placeres først)
  const sectionsCopy = addRequiredSections(sections, stResults);

  // 3+4. Byg SecCatalog per sektion (øvelser + recent-markering)
  const catalogSections = await buildSecCatalogs(sectionsCopy, stResults, team_id, c.env.DB);

  // 5. Byg prompt
  const prompt = buildPrompt(catalogSections, themes, vary, ageGroup);

  // 6. Kald Anthropic
  let rawText: string;
  try {
    rawText = await callAnthropic(prompt, c.env.ANTHROPIC_API_KEY);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Ukendt fejl' }, 502);
  }

  // 7. Parse svar
  let aiSections: AISectionResult[] = [];
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) aiSections = JSON.parse(match[0]);
  } catch {
    return c.json({ error: 'Kunne ikke parse AI-svar', raw: rawText }, 502);
  }

  // 8. Validér og matche på position (AI's type-felt ignoreres)
  const validIds = new Set(catalogSections.flatMap(s => s.exercises.map(ex => ex.id)));

  const output = aiSections.map((aiSec, idx) => {
    const ourSec = catalogSections[(aiSec.sectionIndex ?? idx + 1) - 1] ?? catalogSections[idx];
    return {
      type: ourSec?.type ?? sectionsCopy[idx]?.type ?? '',
      mins: ourSec?.mins ?? aiSec.mins,
      exercises: (aiSec.exercises ?? [])
        .filter(e => validIds.has(e.exerciseId))
        .map(e => ({ exerciseId: e.exerciseId, mins: e.mins })),
    };
  });

  return c.json(output);
});
