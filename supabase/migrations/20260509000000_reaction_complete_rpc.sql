-- Complete or release a claimed /api/reaction generation without touching the
-- stale table-schema path in PostgREST. The completion RPC updates both
-- ai_reaction_text and reaction_locked_at inside SQL, so the route never has
-- to reference the new lock column in a builder-chain UPDATE.
--
-- It also binds completion to the exact lock timestamp returned by the claim
-- RPC. If a request times out, a second request re-claims the pick, and the
-- first request finishes late, the stale owner cannot clear or overwrite the
-- newer owner's lock.

DROP FUNCTION IF EXISTS suspicion.try_claim_reaction_lock(uuid, int);

CREATE OR REPLACE FUNCTION suspicion.try_claim_reaction_lock(
  p_pick_id uuid,
  p_lock_timeout_seconds int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  locked_at timestamptz
)
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
    RETURNING picks.id, picks.reaction_locked_at;
$$;

COMMENT ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int) IS
  'Atomic claim for /api/reaction generation. Sets reaction_locked_at on the '
  'pick row only when the row is unclaimed (ai_reaction_text NULL AND '
  'reaction_locked_at NULL or expired). Returns the pick id and the precise '
  'lock timestamp when the claim succeeds, empty set when another request '
  'holds the lock. Default expiry of 60s frees rows whose generation crashed '
  'or was abandoned.';

CREATE OR REPLACE FUNCTION suspicion.complete_reaction_generation(
  p_pick_id uuid,
  p_locked_at timestamptz,
  p_text text DEFAULT NULL
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = suspicion, pg_temp
AS $$
  UPDATE suspicion.picks
    SET ai_reaction_text = p_text,
        reaction_locked_at = NULL
    WHERE picks.id = p_pick_id
      AND picks.reaction_locked_at = p_locked_at
    RETURNING picks.id;
$$;

COMMENT ON FUNCTION suspicion.complete_reaction_generation(uuid, timestamptz, text) IS
  'Completes or releases a claimed /api/reaction generation. Clears '
  'reaction_locked_at and optionally persists ai_reaction_text only when the '
  'caller still owns the exact lock timestamp returned by '
  'try_claim_reaction_lock. Prevents a stale timed-out request from '
  'overwriting or unlocking a newer owner.';

GRANT EXECUTE ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION suspicion.complete_reaction_generation(uuid, timestamptz, text) TO anon, authenticated;
