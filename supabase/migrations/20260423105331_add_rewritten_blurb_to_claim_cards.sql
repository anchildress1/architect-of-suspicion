-- Add claim-specific rewritten blurbs to claim_cards.
-- The seed pipeline rewrites each card's blurb relative to the active claim,
-- introducing deliberate ambiguity while remaining factually grounded.
-- The game reads rewritten_blurb from this table — not from public.cards.
ALTER TABLE suspicion.claim_cards
  ADD COLUMN rewritten_blurb text NOT NULL DEFAULT '';