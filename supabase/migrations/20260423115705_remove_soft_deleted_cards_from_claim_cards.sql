-- When a card is soft-deleted (deleted_at set), remove it from all claim_cards
-- rows so the game never deals a deleted card.
--
-- loadEligibleCards already filters deleted_at IS NULL at seed time, but cards
-- can be soft-deleted after seeding. This trigger keeps claim_cards consistent
-- without requiring a full re-seed.

CREATE OR REPLACE FUNCTION suspicion.remove_soft_deleted_card_from_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = suspicion
AS $$
BEGIN
  -- Fire only when deleted_at transitions from NULL → non-NULL (soft delete).
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    DELETE FROM suspicion.claim_cards WHERE card_id = NEW."objectID";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_card_soft_delete
  AFTER UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION suspicion.remove_soft_deleted_card_from_claims();
