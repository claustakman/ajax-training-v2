-- board_posts: tilføj nye kolonner (eksisterer allerede med grundlæggende kolonner)
ALTER TABLE board_posts ADD COLUMN pinned_by  TEXT REFERENCES users(id);
ALTER TABLE board_posts ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_posts ADD COLUMN deleted_at TEXT;

-- Opdatér NOT NULL constraints via kolonnedefinitioner er ikke muligt i SQLite ALTER TABLE,
-- men DEFAULT 0 sikrer korrekt adfærd for eksisterende og nye rækker.
-- pinned og archived mangler NOT NULL — accepteret (D1 SQLite begrænsning).

-- board_comments: tilføj nye kolonner
ALTER TABLE board_comments ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_comments ADD COLUMN deleted_at TEXT;

-- Nye tabeller
CREATE TABLE IF NOT EXISTS board_attachments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,           -- 'image' | 'document'
  filename   TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  url        TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS board_reads (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL
);

-- Indekser
CREATE INDEX IF NOT EXISTS idx_board_posts_team
  ON board_posts(team_id, archived, deleted, created_at);
CREATE INDEX IF NOT EXISTS idx_board_comments_post
  ON board_comments(post_id, deleted);
