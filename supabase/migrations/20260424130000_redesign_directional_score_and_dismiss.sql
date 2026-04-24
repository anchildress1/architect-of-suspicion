-- Redesign: pre-seed directional ai_score on claim_cards (runtime AI no longer scores).
-- Add 'dismiss' as a third pick classification.
-- Update replace_claim_seed RPC to persist ai_score from the seed payload.

-- 1. Pre-seeded directional score per (claim, card). Range [-1.0, 1.0].
--    Sign = direction (positive supports claim, negative undermines).
--    Magnitude = confidence. Populated by claim engine Pass 4.
ALTER TABLE suspicion.claim_cards
  ADD COLUMN ai_score numeric(3,2) NOT NULL DEFAULT 0.0
    CHECK (ai_score >= -1.0 AND ai_score <= 1.0);

-- Existing rows get 0.0 (neutral) — operator re-runs the seed pipeline,
-- which DELETEs and re-INSERTs via replace_claim_seed with real scores.

-- 2. Extend picks.classification to allow 'dismiss' (the third Witness-mode action).
ALTER TABLE suspicion.picks
  DROP CONSTRAINT picks_classification_check;
ALTER TABLE suspicion.picks
  ADD CONSTRAINT picks_classification_check
    CHECK (classification = ANY (ARRAY['proof'::text, 'objection'::text, 'dismiss'::text]));

-- 3. Replace the atomic seed RPC to persist ai_score from each card row.
--    SECURITY DEFINER + service_role grant preserved from original.
CREATE OR REPLACE FUNCTION suspicion.replace_claim_seed(seed_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = suspicion, public, pg_temp
AS $$
DECLARE
  claim jsonb;
  card jsonb;
  inserted_claim_id uuid;
BEGIN
  IF seed_payload IS NULL
    OR jsonb_typeof(seed_payload) <> 'array'
    OR jsonb_array_length(seed_payload) = 0 THEN
    RAISE EXCEPTION 'seed_payload must be a non-empty JSON array';
  END IF;

  DELETE FROM suspicion.claim_cards;
  DELETE FROM suspicion.claims;

  FOR claim IN SELECT value FROM jsonb_array_elements(seed_payload)
  LOOP
    INSERT INTO suspicion.claims (
      claim_text,
      rationale,
      room_coverage,
      total_eligible_cards
    )
    VALUES (
      claim->>'claim_text',
      NULLIF(claim->>'rationale', ''),
      (claim->>'room_coverage')::smallint,
      (claim->>'total_eligible_cards')::smallint
    )
    RETURNING id INTO inserted_claim_id;

    FOR card IN SELECT value FROM jsonb_array_elements(COALESCE(claim->'cards', '[]'::jsonb))
    LOOP
      INSERT INTO suspicion.claim_cards (
        claim_id,
        card_id,
        ambiguity,
        surprise,
        ai_score,
        rewritten_blurb
      )
      VALUES (
        inserted_claim_id,
        (card->>'card_id')::uuid,
        (card->>'ambiguity')::smallint,
        (card->>'surprise')::smallint,
        (card->>'ai_score')::numeric,
        card->>'rewritten_blurb'
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION suspicion.replace_claim_seed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suspicion.replace_claim_seed(jsonb) TO service_role;
