import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const aiRoutes = new Hono<HonoEnv>();

interface SectionInput {
  type: string;
  mins: number;
}

interface ExerciseRow {
  id: string;
  name: string;
  tags: string;
  default_mins: number | null;
  stars: number;
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

function parseTags(raw: string | null | undefined): string[] {
  try { return JSON.parse(raw ?? '[]'); } catch { return []; }
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

  // 2. Tilføj required sektionstyper der ikke allerede er i listen
  const sectionsCopy = [...sections];
  for (const [id, st] of sectionTypeMap) {
    if (st.required && !sectionsCopy.find(s => s.type === id)) {
      sectionsCopy.push({ type: id, mins: 15 });
    }
  }

  // 3. Hent alle øvelser
  const allExercises = (await c.env.DB.prepare(
    'SELECT id, name, tags, default_mins, stars FROM exercises'
  ).all<ExerciseRow>()).results;

  // 4. Byg catalog per sektion
  const catalogSections = sectionsCopy.map((sec, idx) => {
    const st = sectionTypeMap.get(sec.type);
    const label = st?.label ?? sec.type;
    const stTags = st?.tags ?? [];

    const matching = allExercises.filter(ex => {
      if (stTags.length === 0) return true;
      return stTags.some(t => parseTags(ex.tags).includes(t));
    });

    const avgMins = matching.length > 0
      ? matching.reduce((s, ex) => s + (ex.default_mins ?? 10), 0) / matching.length
      : 10;
    const maxEx = Math.max(1, Math.round(sec.mins / avgMins));

    return {
      sectionIndex: idx + 1,
      type: sec.type,
      mins: sec.mins,
      label,
      maxEx,
      exercises: matching.slice(0, 30).map(ex => ({
        id: ex.id,
        name: ex.name,
        tags: parseTags(ex.tags),
        defaultMins: ex.default_mins ?? 10,
        stars: ex.stars,
      })),
    };
  });

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
  const validIds = new Set(allExercises.map(ex => ex.id));

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
