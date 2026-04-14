-- Ændre section_types så samme type-id kan eksistere som global (team_id=NULL) og per hold
-- Løsning: tilføj surrogate rowid og UNIQUE(id, team_id) med NULLS DISTINCT via trigger

-- 1. Opret ny tabel med rowid som PK og UNIQUE på (id, team_id)
CREATE TABLE section_types_new (
  rowid      INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL,
  cls        TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  themes     TEXT NOT NULL DEFAULT '[]',
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  team_id    TEXT REFERENCES teams(id) ON DELETE CASCADE
);

-- Unique index der behandler NULL team_id korrekt (global defaults)
CREATE UNIQUE INDEX section_types_id_team ON section_types_new(id, COALESCE(team_id, ''));

-- 2. Kopiér eksisterende data
INSERT INTO section_types_new (id, label, color, cls, tags, themes, required, sort_order, team_id)
SELECT id, label, color, cls, tags, themes, required, sort_order, team_id FROM section_types;

-- 3. Drop og rename
DROP TABLE section_types;
ALTER TABLE section_types_new RENAME TO section_types;
