-- Server-side Attention meter + classification permanence
--
-- 1. Store the smoothed Attention value on the session row so the client only
--    ever sees the final 0..100 integer (never the raw ai_score magnitude).
-- 2. Enforce Invariant #8 (classification permanent within a session) at the
--    database level so direct API calls cannot re-rule a card.

ALTER TABLE suspicion.sessions
  ADD COLUMN attention smallint NOT NULL DEFAULT 50
    CHECK (attention >= 0 AND attention <= 100);

-- Before adding the unique constraint: drop any duplicate (session_id, card_id)
-- rows left over from pre-redesign playthroughs. Keep the earliest pick — that
-- was the player's original classification and matches the Invariant #8 intent
-- ("classification permanent within a session"). Anonymous session data only,
-- so no audit concerns.
DELETE FROM suspicion.picks p
USING (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY session_id, card_id
             ORDER BY created_at, id
           ) AS rn
    FROM suspicion.picks
  ) ranked
  WHERE ranked.rn > 1
) dupes
WHERE p.id = dupes.id;

-- One pick per (session, card). Dupes are now rejected at the DB level.
ALTER TABLE suspicion.picks
  ADD CONSTRAINT picks_session_card_unique UNIQUE (session_id, card_id);

-- Anon cannot touch attention directly — server routes use service_role.
-- Keep verdict/updated_at as the only anon-writable columns on sessions.
