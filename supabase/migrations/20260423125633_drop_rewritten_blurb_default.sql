-- Every claim_cards row must have an explicit claim-specific rewrite.
-- The DEFAULT '' was a scaffold placeholder; removing it enforces that the
-- seed pipeline always produces a rewritten_blurb — no silent empty strings.
ALTER TABLE suspicion.claim_cards ALTER COLUMN rewritten_blurb DROP DEFAULT;
