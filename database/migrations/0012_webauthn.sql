-- WebAuthn / Passkeys
-- Credential: én række per registreret enhed per bruger
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id              TEXT PRIMARY KEY,              -- credential ID (base64url-encoded, from authenticator)
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key_spki TEXT NOT NULL,                 -- base64url-encoded SPKI DER (for SubtleCrypto.importKey)
  algorithm       INTEGER NOT NULL DEFAULT -7,   -- COSE alg: -7 = ES256, -257 = RS256
  counter         INTEGER NOT NULL DEFAULT 0,    -- signature counter (anti-replay)
  transports      TEXT NOT NULL DEFAULT '[]',    -- JSON array: ['internal', ...]
  device_name     TEXT NOT NULL,                 -- venligt enhedsnavn (fra User-Agent)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at    TEXT
);

-- In-flight challenge: slettes efter brug (single-use)
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          TEXT PRIMARY KEY,                  -- random UUID (challenge value)
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                     -- 'register' | 'authenticate'
  expires_at  TEXT NOT NULL                      -- datetime('now','+5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_webauthn_creds_user ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_exp ON webauthn_challenges(expires_at);
