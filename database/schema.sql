-- Ajax Træningsplanlægger v2 — D1 Schema
-- Run: wrangler d1 execute ajax-traening --file=database/schema.sql

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  age_group            TEXT NOT NULL,
  season               TEXT NOT NULL,
  holdsport_worker_url TEXT,
  holdsport_token      TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'guest',
  last_seen       TEXT,
  invite_token    TEXT,
  invite_expires  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- USER_TEAMS (mange-til-mange)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_teams (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'trainer',   -- guest | trainer | team_manager (admin er global)
  PRIMARY KEY (user_id, team_id)
);

-- ============================================================
-- TRAININGS
-- ============================================================
CREATE TABLE IF NOT EXISTS trainings (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title        TEXT,
  date         TEXT,
  start_time   TEXT,
  end_time     TEXT,
  location     TEXT,
  lead_trainer TEXT,
  trainers     TEXT,
  themes       TEXT,
  focus_points TEXT,
  sections     TEXT NOT NULL DEFAULT '[]',
  stars        INTEGER DEFAULT 0,
  archived     INTEGER DEFAULT 0,
  holdsport_id TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- EXERCISES
-- ============================================================
CREATE TABLE IF NOT EXISTS exercises (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  catalog        TEXT NOT NULL DEFAULT 'hal',
  category       TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  age_groups     TEXT NOT NULL DEFAULT '[]',
  stars          INTEGER DEFAULT 0,
  variants       TEXT,
  link           TEXT,
  default_mins   INTEGER,
  image_r2_key   TEXT,
  image_url      TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- QUARTERS (årshjul)
-- ============================================================
CREATE TABLE IF NOT EXISTS quarters (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  quarter   INTEGER NOT NULL,
  themes    TEXT NOT NULL DEFAULT '[]',
  UNIQUE(team_id, quarter)
);

-- ============================================================
-- SECTION_TYPES
-- ============================================================
CREATE TABLE IF NOT EXISTS section_types (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL,
  cls        TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================
-- BOARD_POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS board_posts (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT,
  body       TEXT NOT NULL,
  pinned     INTEGER DEFAULT 0,
  archived   INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at  TEXT
);

-- ============================================================
-- BOARD_COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS board_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at  TEXT
);

-- ============================================================
-- TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id         TEXT PRIMARY KEY,
  team_id    TEXT REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sections   TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SEED: section_types
-- ============================================================
INSERT OR IGNORE INTO section_types (id, label, color, cls, tags, required, sort_order) VALUES
  ('opvarmning',   'Opvarmning',   '#22c55e', 'opvarmning',   '["opvarmning"]',              0, 1),
  ('afleveringer', 'Afleveringer', '#3b82f6', 'afleveringer', '["afleveringer","teknik"]',   0, 2),
  ('kontra',       'Kontra',       '#C8102E', 'kontra',        '["kontra","spil"]',           0, 3),
  ('teknik',       'Teknik',       '#8b5cf6', 'teknik',        '["teknik"]',                  0, 4),
  ('spil',         'Spil',         '#06b6d4', 'spil',          '["spil"]',                    0, 5),
  ('keeper',       'Keeper',       '#ec4899', 'keeper',        '["keeper"]',                  0, 6),
  ('forsvar',      'Forsvar',      '#f97316', 'forsvar',       '["forsvar"]',                 0, 7),
  ('fysisk',       'Fysisk',       '#f59e0b', 'fysisk',        '["styrke","plyometrik"]',     1, 8);
