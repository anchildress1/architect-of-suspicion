-- Replace the dual-hireability readings model with a single-truth model.
--
-- Why: the previous schema (guilty_reading + not_guilty_reading) implied the
-- cover letter routes between two valid hireable readings based on the
-- player's verdict. That made two recruiters reach two different conclusions
-- about Ashley — exactly the failure mode the system is meant to prevent.
--
-- The corrected model: each claim has ONE underlying hireable truth that the
-- brief always reveals. The claim itself is just a reasonable-doubt framing
-- of that truth. The "desired verdict" tells us whether the surface claim is
-- TRUE of Ashley (accuse aligns) or FALSE (pardon aligns). The brief lands
-- the same trait either way; the verdict only swings the rhetorical opener
-- (player saw it clearly vs the record corrects them).
--
-- claim_cards.is_paramount flags the cards that are essential to revealing
-- the truth. The runtime cover letter prompt loads these regardless of
-- whether the player ruled them, and calls out the paramount cards the
-- player skipped — the truth lands either way, but the brief reads more
-- "you discovered this" if the player engaged the load-bearing evidence.
--
-- No backwards-compatibility shim. The dropped columns have zero rows
-- (the prior migration truncated both tables) so DROP COLUMN is safe.
-- Pipeline reseeds populate the new columns.

BEGIN;

ALTER TABLE suspicion.claims
  DROP CONSTRAINT IF EXISTS claims_guilty_reading_nonempty,
  DROP CONSTRAINT IF EXISTS claims_not_guilty_reading_nonempty,
  DROP COLUMN guilty_reading,
  DROP COLUMN not_guilty_reading,
  ADD COLUMN hireable_truth text NOT NULL,
  ADD COLUMN desired_verdict text NOT NULL,
  ADD CONSTRAINT claims_hireable_truth_nonempty
    CHECK (length(btrim(hireable_truth)) > 0),
  ADD CONSTRAINT claims_desired_verdict_valid
    CHECK (desired_verdict IN ('accuse', 'pardon'));

COMMENT ON COLUMN suspicion.claims.hireable_truth IS
  'The single underlying positive professional trait the brief always '
  'reveals. The claim_text is a reasonable-doubt framing of this truth. '
  'Anchors the runtime cover letter prompt regardless of verdict.';

COMMENT ON COLUMN suspicion.claims.desired_verdict IS
  'accuse = the surface claim is TRUE of Ashley (player Accuses to align '
  'with the truth); pardon = surface claim is FALSE (player Pardons to '
  'align). Drives the rhetorical opener of the brief — match means the '
  'player saw the truth clearly, miss means the record corrects them. The '
  'hireable_truth lands the same way either way.';

ALTER TABLE suspicion.claim_cards
  ADD COLUMN is_paramount boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN suspicion.claim_cards.is_paramount IS
  'Cards essential to landing the hireable_truth in the brief. The runtime '
  'cover letter prompt surfaces paramount cards regardless of whether the '
  'player ruled them — paramount-but-skipped becomes a "the player did not '
  'call X to the stand" gap call-out. Set by the seed pipeline.';

CREATE INDEX claim_cards_paramount_idx
  ON suspicion.claim_cards (claim_id)
  WHERE is_paramount = true;

-- Replace the seed RPC so it accepts the new payload shape and refuses any
-- old-shape payload (missing hireable_truth or desired_verdict).
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
  desired_verdict_value text;
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
    IF NULLIF(btrim(COALESCE(claim->>'hireable_truth', '')), '') IS NULL THEN
      RAISE EXCEPTION 'claim payload missing hireable_truth: %', claim->>'claim_text';
    END IF;

    desired_verdict_value := claim->>'desired_verdict';
    IF desired_verdict_value NOT IN ('accuse', 'pardon') THEN
      RAISE EXCEPTION 'claim payload has invalid desired_verdict %: %',
        desired_verdict_value, claim->>'claim_text';
    END IF;

    INSERT INTO suspicion.claims (
      claim_text,
      rationale,
      hireable_truth,
      desired_verdict,
      room_coverage,
      total_eligible_cards
    )
    VALUES (
      claim->>'claim_text',
      NULLIF(claim->>'rationale', ''),
      claim->>'hireable_truth',
      desired_verdict_value,
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
        notes,
        is_paramount
      )
      VALUES (
        inserted_claim_id,
        (card->>'card_id')::uuid,
        (card->>'ambiguity')::smallint,
        (card->>'surprise')::smallint,
        (card->>'ai_score')::numeric,
        card->>'rewritten_blurb',
        NULLIF(card->>'notes', ''),
        COALESCE((card->>'is_paramount')::boolean, false)
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION suspicion.replace_claim_seed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suspicion.replace_claim_seed(jsonb) TO service_role;

COMMIT;
