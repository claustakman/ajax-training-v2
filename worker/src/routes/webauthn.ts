/**
 * WebAuthn / Passkeys — platform authenticators only (Face ID, Touch ID, Windows Hello)
 *
 * Endpoints (all under /api/auth/webauthn):
 *   POST /register-options   (auth)    → RegistrationOptions
 *   POST /register-verify    (auth)    → { ok }
 *   POST /login-options      (public)  → AuthenticationOptions
 *   POST /login-verify       (public)  → { token, user }
 *   GET  /credentials        (auth)    → Credential[]
 *   DELETE /credentials/:id  (auth)    → { ok }
 *
 * Pure Web Crypto — no external deps beyond hono.
 */

import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../lib/middleware';
import { createJWT, newId } from '../lib/auth';
import type { Env } from '../index';

type HonoEnv = { Bindings: Env } & AuthContext;

export const webauthnRoutes = new Hono<HonoEnv>();

// ── Config ────────────────────────────────────────────────────────────────────

const RP_ID = 'ajax-traening.pages.dev';
const RP_NAME = 'Ajax Træning';
// Accepted origins: prod + local dev
const ALLOWED_ORIGINS = [
  'https://ajax-traening.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

// COSE algorithm IDs we support (ES256 preferred, RS256 fallback)
const SUPPORTED_ALGS: COSEAlg[] = [-7, -257];
type COSEAlg = -7 | -257;

// ── Encoding helpers ──────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...u8))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '=='.slice(0, (4 - padded.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function concatBufs(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

// ── Minimal CBOR decoder (map + int/bytes/text/array only) ───────────────────

function decodeCBOR(data: Uint8Array): unknown {
  const [val] = decodeCBORAt(data, 0);
  return val;
}

function decodeCBORAt(data: Uint8Array, off: number): [unknown, number] {
  const byte = data[off++];
  const mt = byte >> 5;     // major type
  const ai = byte & 0x1f;   // additional info

  let len: number;
  if (ai < 24) {
    len = ai;
  } else if (ai === 24) {
    len = data[off++];
  } else if (ai === 25) {
    len = (data[off] << 8) | data[off + 1]; off += 2;
  } else if (ai === 26) {
    len = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]; off += 4;
  } else {
    throw new Error(`Unsupported CBOR additional info: ${ai}`);
  }

  if (mt === 0) return [len, off];                           // uint
  if (mt === 1) return [-(1 + len), off];                   // negint
  if (mt === 2) { const b = data.slice(off, off + len); return [b, off + len]; } // bytes
  if (mt === 3) {                                            // text
    const b = data.slice(off, off + len);
    return [new TextDecoder().decode(b), off + len];
  }
  if (mt === 4) {                                            // array
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const [v, newOff] = decodeCBORAt(data, off);
      arr.push(v); off = newOff;
    }
    return [arr, off];
  }
  if (mt === 5) {                                            // map
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < len; i++) {
      const [k, o1] = decodeCBORAt(data, off);
      const [v, o2] = decodeCBORAt(data, o1);
      map.set(k, v); off = o2;
    }
    return [map, off];
  }
  throw new Error(`Unsupported CBOR major type: ${mt}`);
}

// ── authenticatorData parser ──────────────────────────────────────────────────

interface AuthData {
  rpIdHash: Uint8Array;
  flags: number;
  counter: number;
  aaguid?: Uint8Array;
  credentialId?: Uint8Array;
  credentialPublicKey?: Uint8Array;  // raw CBOR bytes of the COSE key
}

function parseAuthData(buf: Uint8Array): AuthData {
  let off = 0;
  const rpIdHash = buf.slice(off, off + 32); off += 32;
  const flags = buf[off++];
  const counter = (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]; off += 4;

  if (!(flags & 0x40)) {
    // No attested credential data — authentication response
    return { rpIdHash, flags, counter };
  }

  // Attested credential data present (registration)
  const aaguid = buf.slice(off, off + 16); off += 16;
  const credIdLen = (buf[off] << 8) | buf[off + 1]; off += 2;
  const credentialId = buf.slice(off, off + credIdLen); off += credIdLen;
  const credentialPublicKey = buf.slice(off);

  return { rpIdHash, flags, counter, aaguid, credentialId, credentialPublicKey };
}

// ── COSE key → SubtleCrypto CryptoKey ────────────────────────────────────────

async function importCOSEKey(coseBytes: Uint8Array): Promise<{ key: CryptoKey; alg: COSEAlg; spki: string }> {
  const coseMap = decodeCBOR(coseBytes) as Map<number, unknown>;
  const alg = coseMap.get(3) as number;  // COSE alg label

  if (alg === -7) {
    // ES256 (P-256 ECDSA)
    const x = coseMap.get(-2) as Uint8Array;
    const y = coseMap.get(-3) as Uint8Array;
    // Build uncompressed EC point → raw CryptoKey
    const jwk = {
      kty: 'EC', crv: 'P-256',
      x: b64url(x), y: b64url(y),
      ext: true,
    };
    const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    const spki = b64url(await crypto.subtle.exportKey('spki', key) as ArrayBuffer);
    return { key, alg: -7, spki };
  }

  if (alg === -257) {
    // RS256 (RSA-PKCS1-v1_5 SHA-256)
    const n = coseMap.get(-1) as Uint8Array;
    const e = coseMap.get(-2) as Uint8Array;
    const jwk = {
      kty: 'RSA', alg: 'RS256',
      n: b64url(n), e: b64url(e),
      ext: true,
    };
    const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
    const spki = b64url(await crypto.subtle.exportKey('spki', key) as ArrayBuffer);
    return { key, alg: -257, spki };
  }

  throw new Error(`Unsupported COSE algorithm: ${alg}`);
}

async function importStoredKey(spki: string, alg: COSEAlg): Promise<CryptoKey> {
  const keyData = fromB64url(spki).buffer as ArrayBuffer;
  if (alg === -7) {
    return crypto.subtle.importKey('spki', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  return crypto.subtle.importKey('spki', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

// ── Signature verification ────────────────────────────────────────────────────

async function verifySignature(
  key: CryptoKey,
  alg: COSEAlg,
  signature: Uint8Array,
  authDataBytes: Uint8Array,
  clientDataHash: Uint8Array,
): Promise<boolean> {
  const message = concatBufs(authDataBytes, clientDataHash);
  if (alg === -7) {
    // WebAuthn ES256 signatures are DER-encoded — convert to raw r||s (64 bytes)
    const raw = derToRaw(signature);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw.buffer as ArrayBuffer, message.buffer as ArrayBuffer);
  }
  return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature.buffer as ArrayBuffer, message.buffer as ArrayBuffer);
}

// DER SEQUENCE { INTEGER r, INTEGER s } → raw 32+32 bytes
function derToRaw(der: Uint8Array): Uint8Array {
  let off = 2; // skip 30 (SEQUENCE) + length
  if (der[1] & 0x80) off += der[1] & 0x7f; // long-form length
  // r
  off++; // 02 (INTEGER)
  const rLen = der[off++];
  const rStart = off + (der[off] === 0 ? 1 : 0); // skip leading zero
  const r = der.slice(rStart, off + rLen); off += rLen;
  // s
  off++; // 02 (INTEGER)
  const sLen = der[off++];
  const sStart = off + (der[off] === 0 ? 1 : 0);
  const s = der.slice(sStart, off + sLen);

  const raw = new Uint8Array(64);
  raw.set(r.slice(-32), 32 - Math.min(r.length, 32));
  raw.set(s.slice(-32), 64 - Math.min(s.length, 32));
  return raw;
}

// ── rpIdHash helper ───────────────────────────────────────────────────────────

async function hashRpId(rpId: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(rpId).buffer as ArrayBuffer));
}

function bufEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Device name from User-Agent ───────────────────────────────────────────────

function guessDeviceName(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Ukendt enhed';
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function storeChallenge(db: D1Database, userId: string | null, type: 'register' | 'authenticate'): Promise<string> {
  const challenge = newId();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO webauthn_challenges (id, user_id, type, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(challenge, userId, type, expires).run();
  return challenge;
}

async function consumeChallenge(db: D1Database, challenge: string, type: 'register' | 'authenticate'): Promise<{ user_id: string | null } | null> {
  const row = await db.prepare(
    'SELECT user_id FROM webauthn_challenges WHERE id = ? AND type = ? AND expires_at > ?'
  ).bind(challenge, type, new Date().toISOString()).first<{ user_id: string | null }>();

  // Always delete — single use
  await db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').bind(challenge).run();
  // Also prune stale challenges
  await db.prepare("DELETE FROM webauthn_challenges WHERE expires_at < ?").bind(new Date().toISOString()).run();

  return row ?? null;
}

async function buildUserResponse(db: D1Database, userId: string, jwtSecret: string) {
  const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').bind(userId).first<{ id: string; name: string; email: string; role: string }>();
  if (!user) return null;

  await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(new Date().toISOString(), userId).run();

  const isAdmin = user.role === 'admin';
  const teams = isAdmin
    ? await db.prepare('SELECT id, name, age_group, season FROM teams ORDER BY name').all()
    : await db.prepare(
        'SELECT t.id, t.name, t.age_group, t.season, ut.role as team_role FROM teams t JOIN user_teams ut ON ut.team_id = t.id WHERE ut.user_id = ?'
      ).bind(userId).all();

  const token = await createJWT({ sub: user.id, name: user.name, role: user.role }, jwtSecret);

  return {
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      teams: teams.results.map((t: Record<string, unknown>) => ({
        id: t.id, name: t.name, age_group: t.age_group, season: t.season,
        role: isAdmin ? 'admin' : t.team_role,
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// POST /register-options — start enrollment for the logged-in user
webauthnRoutes.post('/register-options', requireAuth(), async (c) => {
  try {
    const { sub: userId, name: userName } = c.get('user');

    // Delete any pre-existing register challenge for this user
    await c.env.DB.prepare("DELETE FROM webauthn_challenges WHERE user_id = ? AND type = 'register'").bind(userId).run();

    const challenge = await storeChallenge(c.env.DB, userId, 'register');

    // Existing credential IDs — exclude them from the ceremony so the user can't register the same device twice
    const existing = await c.env.DB.prepare('SELECT id FROM webauthn_credentials WHERE user_id = ?').bind(userId).all<{ id: string }>();

    return c.json({
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: b64url(new TextEncoder().encode(userId)),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: SUPPORTED_ALGS.map(alg => ({ type: 'public-key', alg })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
      excludeCredentials: existing.results.map(row => ({
        type: 'public-key',
        id: row.id,
        transports: ['internal'],
      })),
    });
  } catch (err) {
    console.error('register-options error:', err);
    return c.json({ error: `register-options fejlede: ${(err as Error)?.message ?? err}` }, 500);
  }
});

// POST /register-verify — complete enrollment
webauthnRoutes.post('/register-verify', requireAuth(), async (c) => {
  const { sub: userId } = c.get('user');
  const ua = c.req.header('User-Agent') ?? '';
  const body = await c.req.json<{
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
    type: string;
  }>();

  try {
    // 1. Parse clientDataJSON
    const clientDataRaw = fromB64url(body.response.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataRaw)) as {
      type: string; challenge: string; origin: string;
    };

    if (clientData.type !== 'webauthn.create') return c.json({ error: 'Forkert type' }, 400);
    if (!ALLOWED_ORIGINS.includes(clientData.origin)) return c.json({ error: 'Ukendt origin' }, 400);

    // 2. Verify & consume challenge
    const challengeRow = await consumeChallenge(c.env.DB, clientData.challenge, 'register');
    if (!challengeRow || challengeRow.user_id !== userId) {
      return c.json({ error: 'Ugyldig eller udløbet challenge' }, 400);
    }

    // 3. Parse attestationObject (CBOR)
    const attestObjBytes = fromB64url(body.response.attestationObject);
    const attestObj = decodeCBOR(attestObjBytes) as Map<string, unknown>;
    const authDataBytes = attestObj.get('authData') as Uint8Array;

    // 4. Parse authenticatorData
    const authData = parseAuthData(authDataBytes);

    // 5. Verify rpIdHash
    const expectedHash = await hashRpId(RP_ID);
    if (!bufEqual(authData.rpIdHash, expectedHash)) return c.json({ error: 'RP ID mismatch' }, 400);

    // 6. Verify UV flag (bit 2)
    if (!(authData.flags & 0x04)) return c.json({ error: 'Brugerverificering påkrævet' }, 400);

    if (!authData.credentialId || !authData.credentialPublicKey) {
      return c.json({ error: 'Manglende credential-data' }, 400);
    }

    // 7. Import public key
    const { alg, spki } = await importCOSEKey(authData.credentialPublicKey);
    if (!SUPPORTED_ALGS.includes(alg)) return c.json({ error: 'Ikke-understøttet algoritme' }, 400);

    const credId = b64url(authData.credentialId);
    const deviceName = guessDeviceName(ua);

    // 8. Store credential
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO webauthn_credentials (id, user_id, public_key_spki, algorithm, counter, transports, device_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(credId, userId, spki, alg, authData.counter, '["internal"]', deviceName, new Date().toISOString()).run();

    return c.json({ ok: true, deviceName });
  } catch (err) {
    console.error('register-verify error', err);
    return c.json({ error: 'Registrering fejlede' }, 400);
  }
});

// POST /login-options — start biometric login (public — no auth)
// Same generic response whether email exists or not (don't leak registration status)
webauthnRoutes.post('/login-options', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email) return c.json({ error: 'email påkrævet' }, 400);

  const GENERIC_CHALLENGE_RESPONSE = {
    challenge: newId(),
    rpId: RP_ID,
    allowCredentials: [] as unknown[],
    userVerification: 'required',
    timeout: 60000,
  };

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim()).first<{ id: string }>();

  if (!user) return c.json(GENERIC_CHALLENGE_RESPONSE);

  const creds = await c.env.DB.prepare('SELECT id FROM webauthn_credentials WHERE user_id = ?')
    .bind(user.id).all<{ id: string }>();

  if (!creds.results.length) return c.json(GENERIC_CHALLENGE_RESPONSE);

  // Delete any existing authenticate challenge for this user
  await c.env.DB.prepare("DELETE FROM webauthn_challenges WHERE user_id = ? AND type = 'authenticate'").bind(user.id).run();
  const challenge = await storeChallenge(c.env.DB, user.id, 'authenticate');

  return c.json({
    challenge,
    rpId: RP_ID,
    allowCredentials: creds.results.map(row => ({
      type: 'public-key',
      id: row.id,
      transports: ['internal'],
    })),
    userVerification: 'required',
    timeout: 60000,
  });
});

// POST /login-verify — complete biometric login (public — no auth)
webauthnRoutes.post('/login-verify', async (c) => {
  const body = await c.req.json<{
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: string;
  }>();

  try {
    // 1. Parse clientDataJSON
    const clientDataRaw = fromB64url(body.response.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataRaw)) as {
      type: string; challenge: string; origin: string;
    };

    if (clientData.type !== 'webauthn.get') return c.json({ error: 'Forkert type' }, 400);
    if (!ALLOWED_ORIGINS.includes(clientData.origin)) return c.json({ error: 'Ukendt origin' }, 400);

    // 2. Look up credential by ID
    const credId = body.id;
    const cred = await c.env.DB.prepare(
      'SELECT id, user_id, public_key_spki, algorithm, counter FROM webauthn_credentials WHERE id = ?'
    ).bind(credId).first<{ id: string; user_id: string; public_key_spki: string; algorithm: number; counter: number }>();

    if (!cred) return c.json({ error: 'Ukendt enhed' }, 400);

    // 3. Verify & consume challenge (tied to cred's user)
    const challengeRow = await consumeChallenge(c.env.DB, clientData.challenge, 'authenticate');
    if (!challengeRow || challengeRow.user_id !== cred.user_id) {
      return c.json({ error: 'Ugyldig eller udløbet challenge' }, 400);
    }

    // 4. Parse authenticatorData
    const authDataBytes = fromB64url(body.response.authenticatorData);
    const authData = parseAuthData(authDataBytes);

    // 5. Verify rpIdHash
    const expectedHash = await hashRpId(RP_ID);
    if (!bufEqual(authData.rpIdHash, expectedHash)) return c.json({ error: 'RP ID mismatch' }, 400);

    // 6. Verify UV flag
    if (!(authData.flags & 0x04)) return c.json({ error: 'Brugerverificering påkrævet' }, 400);

    // 7. Verify counter (anti-replay — stored counter must be < received counter, except both can be 0)
    if (authData.counter !== 0 && authData.counter <= cred.counter) {
      return c.json({ error: 'Mulig kloning af autentifikator' }, 400);
    }

    // 8. Verify signature
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', fromB64url(body.response.clientDataJSON))
    );
    const sigBytes = fromB64url(body.response.signature);
    const alg = cred.algorithm as COSEAlg;
    const pubKey = await importStoredKey(cred.public_key_spki, alg);
    const valid = await verifySignature(pubKey, alg, sigBytes, authDataBytes, clientDataHash);
    if (!valid) return c.json({ error: 'Signatur ugyldig' }, 400);

    // 9. Update counter + last_used_at
    await c.env.DB.prepare(
      'UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE id = ?'
    ).bind(authData.counter, new Date().toISOString(), credId).run();

    // 10. Issue JWT (same shape as password login)
    const result = await buildUserResponse(c.env.DB, cred.user_id, c.env.JWT_SECRET);
    if (!result) return c.json({ error: 'Bruger ikke fundet' }, 400);

    return c.json(result);
  } catch (err) {
    console.error('login-verify error', err);
    return c.json({ error: 'Login fejlede' }, 400);
  }
});

// GET /credentials — list this user's registered devices
webauthnRoutes.get('/credentials', requireAuth(), async (c) => {
  const { sub: userId } = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all<{ id: string; device_name: string; created_at: string; last_used_at: string | null }>();

  return c.json(rows.results);
});

// DELETE /credentials/:id — remove a registered device
webauthnRoutes.delete('/credentials/:id', requireAuth(), async (c) => {
  const { sub: userId } = c.get('user');
  const credId = c.req.param('id');

  const row = await c.env.DB.prepare('SELECT user_id FROM webauthn_credentials WHERE id = ?')
    .bind(credId).first<{ user_id: string }>();

  if (!row || row.user_id !== userId) return c.json({ error: 'Ikke fundet' }, 404);

  await c.env.DB.prepare('DELETE FROM webauthn_credentials WHERE id = ?').bind(credId).run();
  return c.json({ ok: true });
});
