-- Migration 0001: Tilføj role-kolonne til user_teams
-- Rolle er nu hold-specifik. Admin forbliver global på users.role.
-- Eksisterende rækker får rollen fra users.role (dog max 'team_manager' — admin er global).

ALTER TABLE user_teams ADD COLUMN role TEXT NOT NULL DEFAULT 'trainer';

-- Kopier eksisterende rolle fra users til user_teams, cap til team_manager
UPDATE user_teams
SET role = (
  SELECT CASE WHEN u.role = 'admin' THEN 'team_manager' ELSE u.role END
  FROM users u
  WHERE u.id = user_teams.user_id
);
