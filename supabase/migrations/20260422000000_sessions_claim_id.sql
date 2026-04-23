-- Wire sessions to the claim engine: store claim_id so card dealing can
-- be filtered to the claim's pre-scored pool in suspicion.claim_cards.
-- Nullable with ON DELETE SET NULL so re-seeding preserves session history.
ALTER TABLE suspicion.sessions
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES suspicion.claims(id) ON DELETE SET NULL;

-- Persist verdict content on the session for recovery if sessionStorage is cleared.
ALTER TABLE suspicion.sessions ADD COLUMN IF NOT EXISTS cover_letter text;
ALTER TABLE suspicion.sessions ADD COLUMN IF NOT EXISTS architect_closing text;

-- Expose suspicion schema to PostgREST so the JS client can reach it via
-- .schema('suspicion'). Without this, queries against suspicion.* fail.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, suspicion';
NOTIFY pgrst, 'reload schema';

-- Ensure service_role can write to the new claim engine tables.
GRANT ALL ON suspicion.claims TO service_role;
GRANT ALL ON suspicion.claim_cards TO service_role;
