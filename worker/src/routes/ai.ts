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

async function callAnthropic(apiKey: string, prompt: string, maxTokens = 2048): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return { ok: true, text: data.content.find(b => b.type === 'text')?.text ?? '' };
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
    const result = await callAnthropic(c.env.ANTHROPIC_API_KEY, body.prompt);
    if (!result.ok) return c.json({ error: `Anthropic fejl: ${result.status}`, detail: result.detail }, 502);
    return c.json({ text: result.text });
  }

  // ── Tilstand 2: section-baseret AI-forslag ────────────────────────────────
  const { team_id, sections = [], themes = [], vary = false } = body;
  if (!team_id) return c.json({ error: 'team_id eller prompt påkrævet' }, 400);
  if (sections.length === 0) return c.json({ error: 'sections må ikke være tom' }, 400);

  // 1. Hent sektionstyper (team-specifikke, ellers globale)
  const stResults = await getSectionTypes(team_id, c.env.DB);
  const sectionTypeMap = new Map(stResults.map(st => [st.id, st]));

  // 2. Tilføj required sektionstyper der ikke allerede er i listen (placeres først)
  const sectionsCopy = addRequiredSections(sections, stResults);

  // 3+4. Hent øvelser og byg catalog per sektion
  const catalogSections = await Promise.all(sectionsCopy.map(async (sec, idx) => {
    const st = sectionTypeMap.get(sec.type);
    const label = st?.label ?? sec.type;
    const stTags = st?.tags ?? [];

    const raw = await getExercisesForSection(stTags, team_id, c.env.DB);
    const matching = await markRecentExercises(raw, team_id, c.env.DB);

    const avgMins = matching.length > 0
      ? matching.reduce((s, ex) => s + ex.defaultMins, 0) / matching.length
      : 10;
    const maxEx = Math.max(1, Math.round(sec.mins / avgMins));

    return {
      sectionIndex: idx + 1,
      type: sec.type,
      mins: sec.mins,
      label,
      maxEx,
      exercises: matching.slice(0, 30),
    };
  }));

  // 5. Byg prompt
  const themesText = themes.length > 0 ? `Temaer for denne træning: ${themes.join(', ')}.` : '';
  const varyText = vary ? 'Vælg gerne øvelser du ikke har valgt i de seneste sessioner — variation er vigtig.' : '';

  const sectionsPrompt = catalogSections.map(s =>
    `SEKTION ${s.sectionIndex} – ${s.label} (${s.mins} min, maks ${s.maxEx} øvelser)\nTilgængelige øvelser: ${JSON.stringify(s.exercises)}`
  ).join('\n\n');

  const prompt = `Du er træner i Ajax håndbold og skal planlægge en træning.

${themesText}
${varyText}

For HVER sektion herunder skal du vælge øvelser fra de tilgængelige øvelser.
Respektér tidsrammen og maksimum antal øvelser per sektion.

${sectionsPrompt}

Returnér KUN et JSON-array med præcis ${catalogSections.length} elementer i denne præcise rækkefølge:
[{"sectionIndex":1,"mins":${catalogSections[0]?.mins ?? 15},"exercises":[{"exerciseId":"ID","mins":8}]}]

Regler:
- Brug kun exerciseId'er fra de tilgængelige øvelser i den pågældende sektion
- mins pr. øvelse skal summere til sektionens samlede mins (±2 min)
- Ingen forklaring, ingen markdown — kun JSON-arrayet`;

  // 6. Kald Anthropic
  const result = await callAnthropic(c.env.ANTHROPIC_API_KEY, prompt, 2000);
  if (!result.ok) return c.json({ error: `Anthropic fejl: ${result.status}`, detail: result.detail }, 502);

  // 7. Parse svar
  let aiSections: AISectionResult[] = [];
  try {
    const match = result.text.match(/\[[\s\S]*\]/);
    if (match) aiSections = JSON.parse(match[0]);
  } catch {
    return c.json({ error: 'Kunne ikke parse AI-svar', raw: result.text }, 502);
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
