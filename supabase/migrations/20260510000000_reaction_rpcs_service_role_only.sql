-- Defense-in-depth: restrict EXECUTE on the reaction lock/complete RPCs to
-- service_role only. The runtime app uses SUPABASE_SECRET_KEY (service_role)
-- for all server routes, and there is no client-side Supabase usage anywhere
-- in the codebase, so anon and authenticated never legitimately call these
-- functions. The earlier GRANT was over-broad: if the anon key were ever
-- exposed to the client (a future @supabase/ssr integration, a misconfigured
-- env, etc.), an attacker who knew a pick_id could call try_claim_reaction_lock
-- + complete_reaction_generation directly to write arbitrary text to that
-- pick's ai_reaction_text. The functions are SECURITY DEFINER, so once
-- invoked they bypass RLS entirely.
--
-- Locking EXECUTE to service_role removes that surface. service_role calls
-- via the server keep working unchanged.

REVOKE EXECUTE ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION suspicion.complete_reaction_generation(uuid, timestamptz, text)
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION suspicion.try_claim_reaction_lock(uuid, int) TO service_role;

GRANT EXECUTE ON FUNCTION suspicion.complete_reaction_generation(uuid, timestamptz, text)
  TO service_role;
