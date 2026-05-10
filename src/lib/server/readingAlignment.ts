import type { Classification } from '$lib/types';

const NEAR_ZERO_THRESHOLD = 0.1;

/** Whether the player's classification aligns with the card's directional
 *  truth. Computed server-side from the pre-seeded ai_score sign. The signal
 *  steers the Architect's tone; it never appears in output, paraphrased or
 *  otherwise. */
export type ReadingAlignment = 'aligned' | 'strained' | null;

/**
 * Whether the player engaged correctly with the card's directional weight.
 *
 *                          | |score| < 0.1  | clear pull, signs match | clear pull, signs disagree
 *  -------------------------+----------------+-------------------------+----------------------------
 *  proof / objection        | null (neutral) | aligned                 | strained
 *  dismiss                  | null (neutral) | strained (*)            | strained
 *
 *  (*) dismiss has no sign of its own — any clear directional pull on the
 *      card is "signs match" by absence of opposition. Walking away from a
 *      card with clear weight is the strained read: the player declined
 *      to engage with a lever that was already on a side.
 */
export function readingAlignment(
  classification: Classification,
  aiScore: number,
): ReadingAlignment {
  // No directional weight in either direction → no alignment to read.
  // True for any classification, including dismiss: walking away from a
  // genuinely ambiguous card is just the dial sitting still.
  if (Math.abs(aiScore) < NEAR_ZERO_THRESHOLD) return null;

  // The card has a clear pull; dismiss declined to engage with it.
  if (classification === 'dismiss') return 'strained';

  // proof/objection on a card with a clear pull: signs either match
  // (aligned) or disagree (strained).
  const cardSupportsClaim = aiScore > 0;
  const playerCalledProof = classification === 'proof';
  return cardSupportsClaim === playerCalledProof ? 'aligned' : 'strained';
}
