import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const aiRoutes = new Hono<HonoEnv>();

// POST /api/ai/suggest
// Body: { prompt: string, model?: string }
aiRoutes.post('/suggest', requireAuth('trainer'), async (c) => {
  const { prompt, model = 'claude-haiku-4-5-20251001' } = await c.req.json<{ prompt: string; model?: string }>();
  if (!prompt) return c.json({ error: 'prompt påkrævet' }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return c.json({ error: `Anthropic fejl: ${res.status}`, detail: err }, 502);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(b => b.type === 'text')?.text ?? '';
  return c.json({ text });
});
