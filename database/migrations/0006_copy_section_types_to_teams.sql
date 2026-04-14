-- Kopiér globale sektionstyper til alle hold der endnu ikke har egne sektionstyper.
-- Temaer sættes til '[]' (holdspecifikke temaer sættes i Holdindstillinger).
INSERT OR IGNORE INTO section_types (id, label, color, cls, tags, themes, required, sort_order, team_id)
SELECT
  st.id, st.label, st.color, st.cls, st.tags, '[]', st.required, st.sort_order, t.id
FROM section_types st
CROSS JOIN teams t
WHERE st.team_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM section_types existing
    WHERE existing.team_id = t.id
  );
