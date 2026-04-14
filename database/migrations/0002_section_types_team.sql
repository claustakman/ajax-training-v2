-- Add team_id and themes to section_types, make it team-scoped
-- Global defaults remain (team_id = NULL)
ALTER TABLE section_types ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE section_types ADD COLUMN themes TEXT NOT NULL DEFAULT '[]';
