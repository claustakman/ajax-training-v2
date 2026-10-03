-- Stævner kan strække sig over flere dage: date = startdato, end_date = slutdato (NULL = samme dag)
ALTER TABLE trainings ADD COLUMN end_date TEXT;
