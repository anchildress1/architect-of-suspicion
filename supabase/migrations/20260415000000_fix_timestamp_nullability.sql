-- Fix timestamp columns to be NOT NULL — they always have defaults
ALTER TABLE suspicion.sessions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE suspicion.sessions ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE suspicion.picks ALTER COLUMN created_at SET NOT NULL;
