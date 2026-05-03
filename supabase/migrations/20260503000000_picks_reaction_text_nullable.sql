-- Decouples pick commit from reaction generation. The /api/evaluate route now
-- writes the pick row immediately (so the client can advance to the next card)
-- and a separate /api/reaction route fills ai_reaction_text in async via a
-- streaming Haiku call. Allowing NULL is the cleanest expression of "row exists,
-- reaction not yet generated"; the runtime treats NULL as not-yet-rendered.
ALTER TABLE suspicion.picks
  ALTER COLUMN ai_reaction_text DROP NOT NULL;
