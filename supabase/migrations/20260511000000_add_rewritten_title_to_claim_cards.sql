-- Add claim-specific rewritten titles to claim_cards.
--
-- Source titles in public.cards are first-person ("I positioned Vestige…").
-- The runtime surfaces this title to the player verbatim, leaking the
-- first-person voice that the Pass 4 blurb rewrite already corrects. Pass 4
-- now produces a third-person title alongside the blurb (Ashley by name or
-- she/her pronouns), and the runtime reads rewritten_title from this table
-- instead of public.cards.title — same posture as rewritten_blurb.
--
-- Pre-existing rows are truncated by replace_claim_seed on every reseed
-- anyway, so adding the column with a temporary default + dropping it
-- afterward matches the rewritten_blurb playbook (see migrations
-- 20260423105331 and 20260423125633).
--
-- Pass 4 cache stores the rewritten_title too so cache hits don't lose it.
-- The cache layer's prompt-version hash auto-invalidates entries when the
-- Pass 4 system prompt changes, so existing rows fall through naturally —
-- but the column has to exist for the cache to write through.

BEGIN;

ALTER TABLE suspicion.claim_cards
  ADD COLUMN rewritten_title text NOT NULL DEFAULT '';

ALTER TABLE suspicion.pass4_cache
  ADD COLUMN rewritten_title text NOT NULL DEFAULT '';

COMMENT ON COLUMN suspicion.claim_cards.rewritten_title IS
  'Claim-specific third-person rewrite of public.cards.title. Pass 4 '
  'produces it alongside rewritten_blurb; the runtime reads it instead of '
  'public.cards.title so the player never sees first-person voice.';

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
      IF NULLIF(btrim(COALESCE(card->>'rewritten_title', '')), '') IS NULL THEN
        RAISE EXCEPTION 'claim_cards payload missing rewritten_title for card_id %: %',
          card->>'card_id', claim->>'claim_text';
      END IF;

      INSERT INTO suspicion.claim_cards (
        claim_id,
        card_id,
        ambiguity,
        surprise,
        ai_score,
        rewritten_title,
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
        card->>'rewritten_title',
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

ALTER TABLE suspicion.claim_cards ALTER COLUMN rewritten_title DROP DEFAULT;
ALTER TABLE suspicion.pass4_cache ALTER COLUMN rewritten_title DROP DEFAULT;

COMMIT;
