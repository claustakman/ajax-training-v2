-- Kampe og stævner i træningsoversigten (Session 21)
-- kind: 'training' | 'match' | 'tournament'. Kampe/stævner har ingen sektioner og tæller ikke med i statistik.
ALTER TABLE trainings ADD COLUMN kind TEXT NOT NULL DEFAULT 'training';
ALTER TABLE trainings ADD COLUMN home_team TEXT;
ALTER TABLE trainings ADD COLUMN away_team TEXT;
