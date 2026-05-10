-- Persist Pass 2's dual-hireability readings on suspicion.claims so the runtime
-- cover letter prompt can anchor on the verdict-matching hireable trait instead
-- of inventing one from claim text alone.
--
-- The claim engine pipeline always rewrites suspicion.claims via
-- replace_claim_seed in a single transaction (full replacement, no partial
-- updates). That makes truncate-then-add-NOT-NULL safe: the next pipeline run
-- repopulates both columns. There is no backfill story by policy.
--
-- Cascade: claim_cards rows go via FK ON DELETE CASCADE. sessions.claim_id is
-- nulled via ON DELETE SET NULL — pre-existing in-flight sessions cannot
-- complete a verdict, which is acceptable (the project has no auth and no
-- account continuity to protect; capability tokens already expire in 7 days).

BEGIN;

DELETE FROM suspicion.claim_cards WHERE true;
DELETE FROM suspicion.claims WHERE true;

ALTER TABLE suspicion.claims
  ADD COLUMN guilty_reading text NOT NULL,
  ADD COLUMN not_guilty_reading text NOT NULL,
  ADD CONSTRAINT claims_guilty_reading_nonempty
    CHECK (length(btrim(guilty_reading)) > 0),
  ADD CONSTRAINT claims_not_guilty_reading_nonempty
    CHECK (length(btrim(not_guilty_reading)) > 0);

COMMENT ON COLUMN suspicion.claims.guilty_reading IS
  'One-sentence hireable working-style trait the verdict ''accuse'' surfaces. '
  'Computed by Pass 2 of the claim engine. Anchors the runtime cover letter '
  'prompt so an accused verdict frames the trait recruiter-safely instead of '
  'condemning the subject.';

COMMENT ON COLUMN suspicion.claims.not_guilty_reading IS
  'One-sentence hireable working-style trait the verdict ''pardon'' surfaces. '
  'Computed by Pass 2 of the claim engine. Anchors the runtime cover letter '
  'prompt so a pardoned verdict frames the trait recruiter-safely instead of '
  'sounding like a generic exoneration.';

-- Replace the seed RPC to insert both readings. The previous definition is
-- dropped by CREATE OR REPLACE; no shim left behind.
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

  DELETE FROM suspicion.claim_cards WHERE true;
  DELETE FROM suspicion.claims WHERE true;

  FOR claim IN SELECT value FROM jsonb_array_elements(seed_payload)
  LOOP
    IF NULLIF(btrim(COALESCE(claim->>'guilty_reading', '')), '') IS NULL THEN
      RAISE EXCEPTION 'claim payload missing guilty_reading: %', claim->>'claim_text';
    END IF;
    IF NULLIF(btrim(COALESCE(claim->>'not_guilty_reading', '')), '') IS NULL THEN
      RAISE EXCEPTION 'claim payload missing not_guilty_reading: %', claim->>'claim_text';
    END IF;

    INSERT INTO suspicion.claims (
      claim_text,
      rationale,
      guilty_reading,
      not_guilty_reading,
      room_coverage,
      total_eligible_cards
    )
    VALUES (
      claim->>'claim_text',
      NULLIF(claim->>'rationale', ''),
      claim->>'guilty_reading',
      claim->>'not_guilty_reading',
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
        rewritten_blurb,
        notes
      )
      VALUES (
        inserted_claim_id,
        (card->>'card_id')::uuid,
        (card->>'ambiguity')::smallint,
        (card->>'surprise')::smallint,
        (card->>'ai_score')::numeric,
        card->>'rewritten_blurb',
        NULLIF(card->>'notes', '')
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION suspicion.replace_claim_seed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suspicion.replace_claim_seed(jsonb) TO service_role;

COMMIT;
