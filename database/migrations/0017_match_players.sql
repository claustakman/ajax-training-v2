-- Kampstatistik: spillere pr. kamp fra Holdsport
-- selected_players = status "Tilmeldt" (udtaget), bench_players = status "Til rådighed" (oversidder)
ALTER TABLE trainings ADD COLUMN selected_players TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trainings ADD COLUMN bench_players TEXT NOT NULL DEFAULT '[]';
