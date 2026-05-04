-- Wrap the reaction-lock claim in an RPC so the route doesn't depend on
-- PostgREST's schema cache for the reaction_locked_at column. PostgREST
-- validates column references in builder-chain UPDATEs against its
-- cached table definition; if the cache is stale the route 500s with
-- "column picks.reaction_locked_at does not exist" even when the column
-- exists in Postgres. Function bodies are opaque to PostgREST — it only
-- sees the function signature — so the RPC path bypasses the cache
-- problem entirely.
--
-- The function returns a setof rows: an empty result means another
-- request holds the lock; a single row means we own it.

CREATE OR REPLACE FUNCTION suspicion.try_claim_reaction_lock(
  p_pick_id uuid,
  p_lock_timeout_seconds int DEFAULT 60
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = suspicion, pg_temp
AS $$
  UPDATE suspicion.picks
    SET reaction_locked_at = now()
    WHERE picks.id = p_pick_id
      AND picks.ai_reaction_text IS NULL
      AND (
        picks.reaction_locked_at IS NULL
        OR picks.reaction_locked_at < now() - (p_lock_timeout_seconds || ' seconds')::interval
      )
    RETURNING picks.id;
$$;

COMMENT ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int) IS
  'Atomic claim for /api/reaction generation. Sets reaction_locked_at on the '
  'pick row only when the row is unclaimed (ai_reaction_text NULL AND '
  'reaction_locked_at NULL or expired). Returns the pick id when the claim '
  'succeeds, empty set when another request holds the lock. Default '
  'expiry of 60s frees rows whose generation crashed or was abandoned.';

GRANT EXECUTE ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int) TO anon, authenticated;
