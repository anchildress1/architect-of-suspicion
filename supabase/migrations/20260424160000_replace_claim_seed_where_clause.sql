-- Fix: Supabase's SQL safety layer rejects unqualified DELETE statements
-- ("DELETE requires a WHERE clause"). The previous definition of
-- `replace_claim_seed` used bare `DELETE FROM suspicion.claim_cards;` and
-- `DELETE FROM suspicion.claims;` which are safe inside a SECURITY DEFINER
-- function but still trip the guard. Swaps them for `DELETE ... WHERE true`.
--
-- Also keeps the notes-column support from the prior RPC migration.

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
