-- Migration 0010: udvid templates med type, section_type, themes, description
ALTER TABLE templates ADD COLUMN type TEXT NOT NULL DEFAULT 'training';
ALTER TABLE templates ADD COLUMN section_type TEXT;
ALTER TABLE templates ADD COLUMN themes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE templates ADD COLUMN description TEXT;
