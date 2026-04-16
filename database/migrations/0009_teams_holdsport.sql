-- Tilføj Holdsport-konfiguration til teams-tabellen
ALTER TABLE teams ADD COLUMN holdsport_worker_url TEXT;
ALTER TABLE teams ADD COLUMN holdsport_token TEXT;
