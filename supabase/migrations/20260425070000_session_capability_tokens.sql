-- Session capability hardening:
-- Persist a server-verified SHA-256 token hash per session so state-changing
-- endpoints require possession proof beyond session_id.

ALTER TABLE suspicion.sessions
  ADD COLUMN IF NOT EXISTS session_token_hash text;

UPDATE suspicion.sessions
SET session_token_hash = encode(gen_random_bytes(32), 'hex')
WHERE session_token_hash IS NULL;

ALTER TABLE suspicion.sessions
  ALTER COLUMN session_token_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_session_token_hash_sha256_check'
      AND conrelid = 'suspicion.sessions'::regclass
  ) THEN
    ALTER TABLE suspicion.sessions
      ADD CONSTRAINT sessions_session_token_hash_sha256_check
      CHECK (session_token_hash ~ '^[0-9a-f]{64}$');
  END IF;
END
$$;
