-- Tilføj notes og participant_count til trainings
ALTER TABLE trainings ADD COLUMN notes TEXT;
ALTER TABLE trainings ADD COLUMN participant_count INTEGER;

-- Tilføj holdsport-konfiguration til teams (pr. hold, ikke global secret)
ALTER TABLE teams ADD COLUMN holdsport_worker_url TEXT;
ALTER TABLE teams ADD COLUMN holdsport_token TEXT;
