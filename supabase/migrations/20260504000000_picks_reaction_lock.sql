-- /api/reaction had a duplicate-generation race. Two requests for the same
-- pick_id arriving while ai_reaction_text was still NULL (double-click,
-- retry after a stalled stream, two tabs) would both miss the cached-
-- response check, both call Claude, and race to overwrite the row. That's
-- duplicate model spend and nondeterministic persisted output.
--
-- This column is the lock the reaction route uses to claim ownership of
-- generation atomically. The first request that finds it NULL (or expired)
-- sets it to now() in a single conditional UPDATE; subsequent requests see
-- the lock and either return the cached text (if generation finished
-- between their read and their claim attempt) or 409 with a fallback.
--
-- Auto-expires after 60s so a crashed generation doesn't permanently lock
-- the row. The Haiku 4.5 reaction call is sub-2s under normal conditions;
-- 60s gives generous headroom for retries on slow networks.

ALTER TABLE suspicion.picks
  ADD COLUMN reaction_locked_at timestamptz NULL;

COMMENT ON COLUMN suspicion.picks.reaction_locked_at IS
  'Generation lock for /api/reaction. Set when a request claims ownership of '
  'reaction text generation; cleared when ai_reaction_text is persisted. '
  'Auto-expires after 60s — concurrent requests within that window return the '
  'cached response (if available) or 409. Prevents duplicate Claude calls and '
  'race-to-overwrite on the same pick_id.';
