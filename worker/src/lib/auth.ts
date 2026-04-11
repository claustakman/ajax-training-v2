// JWT og auth helpers — Cloudflare Workers (Web Crypto API)
// Kopieret og tilpasset fra CFC-projektet

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Placeholder-hash fra KV-migration — kræver reset
  if (hash === '$2a$10$PLACEHOLDER_RESET_REQUIRED') return false;
  const computed = await hashPassword(password);
  return computed === hash;
}

export interface JWTPayload {
  sub: string;    // user id
  name: string;
  role: string;   // guest | trainer | team_manager | admin | reset
  exp: number;
}

export async function createJWT(
  payload: Omit<JWTPayload, 'exp'>,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 30   // 30 dage default
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = btoa(JSON.stringify({ ...payload, exp }));
  const sig = await sign(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expected = await sign(`${header}.${body}`, secret);
    if (sig !== expected) return null;
    const payload = JSON.parse(atob(body)) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function newId(): string {
  return crypto.randomUUID();
}
