-- Add missing FK: claim_cards.card_id → public.cards.objectID.
-- The original migration omitted this reference. ON DELETE RESTRICT because
-- public.cards uses soft deletes (deleted_at) — hard deletes should not
-- silently orphan claim_cards rows.
ALTER TABLE suspicion.claim_cards
  ADD CONSTRAINT claim_cards_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES public.cards("objectID") ON DELETE RESTRICT;