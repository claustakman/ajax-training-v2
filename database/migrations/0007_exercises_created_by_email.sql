-- Tilføj created_by_email til exercises så vi kan vise opretter uden JOIN
ALTER TABLE exercises ADD COLUMN created_by_email TEXT;

-- Sæt admin email som opretter på alle eksisterende øvelser
UPDATE exercises SET created_by_email = (
  SELECT email FROM users WHERE role = 'admin' LIMIT 1
);
