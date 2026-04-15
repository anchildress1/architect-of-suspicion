-- Store generated cover letter and architect closing on the session
-- so the verdict page can recover if sessionStorage is lost.
ALTER TABLE suspicion.sessions ADD COLUMN cover_letter text;
ALTER TABLE suspicion.sessions ADD COLUMN architect_closing text;
