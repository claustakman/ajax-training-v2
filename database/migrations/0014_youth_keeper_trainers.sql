-- Separate lister for Keepertrænere og Ungtrænere på træninger (tælles ikke med i spillere/trænere)
ALTER TABLE trainings ADD COLUMN keeper_trainers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trainings ADD COLUMN youth_trainers TEXT NOT NULL DEFAULT '[]';
