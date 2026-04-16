-- Claim Engine tables: AI-curated claims and card-claim pairings.
-- Populated by the seed-claims script (see docs/CLAIM-ENGINE-PRD.md).
-- The game reads these at runtime to pick claims and deal cards.

CREATE TABLE suspicion.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  rationale text,
  room_coverage smallint NOT NULL,
  total_eligible_cards smallint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE suspicion.claim_cards (
  claim_id uuid NOT NULL REFERENCES suspicion.claims(id) ON DELETE CASCADE,
  card_id uuid NOT NULL,
  ambiguity smallint NOT NULL CHECK (ambiguity BETWEEN 1 AND 5),
  surprise smallint NOT NULL CHECK (surprise BETWEEN 1 AND 5),
  PRIMARY KEY (claim_id, card_id)
);

CREATE INDEX claim_cards_card_id_idx ON suspicion.claim_cards (card_id);

-- Anon reads both tables at runtime: the game picks a claim and joins
-- claim_cards to public.cards when dealing. Writes are service-role only
-- (the seed script runs with service role credentials, not anon).
ALTER TABLE suspicion.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicion.claim_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_claims" ON suspicion.claims
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anon_select_claim_cards" ON suspicion.claim_cards
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON suspicion.claims TO anon, authenticated;
GRANT SELECT ON suspicion.claim_cards TO anon, authenticated;
-- service_role already has ALL from the base suspicion schema grant
