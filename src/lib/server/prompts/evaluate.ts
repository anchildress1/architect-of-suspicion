import type { Classification, FullCard } from '$lib/types';

interface PickHistoryEntry {
  card_id: string;
  card_title: string;
  classification: Classification;
}

/** Whether the player's classification aligns with the card's directional
 *  truth. Computed server-side from the pre-seeded ai_score sign — see
 *  /api/reaction/+server.ts. The Architect uses it for tone (grudging
 *  acknowledge vs needle the reading); the player never sees it. */
export type ReadingAlignment = 'aligned' | 'strained' | null;

const ACTION_VERB: Record<Classification, string> = {
  proof: 'entered into evidence as PROOF',
  objection: 'raised as OBJECTION',
  dismiss: 'STRUCK from the record',
};

/**
 * Build the prompt for the Architect's per-pick reaction.
 *
 * The directional score is pre-computed in suspicion.claim_cards — the LLM
 * never produces it at runtime. Its only job here is the in-character
 * reaction. The `alignment` arg gives the model the steering signal it needs
 * to set tone correctly without revealing correctness in output: when the
 * player's reading aligns with the card's direction, the Architect leans
 * "yes, you saw that"; when it strains, the Architect needles the frame
 * the player adopted. Without this signal earlier reactions defaulted to
 * a corrective tone even when the player was right, which read as
 * "you misunderstand" instead of grudging acknowledgment.
 */
export function buildReactionPrompt(
  claim: string,
  card: FullCard,
  classification: Classification,
  history: PickHistoryEntry[],
  alignment: ReadingAlignment,
): string {
  const action = ACTION_VERB[classification];

  const historyBlock =
    history.length > 0
      ? history.map((h, i) => `  ${i + 1}. "${h.card_title}" → ${h.classification}`).join('\n')
      : '  (No prior exhibits)';

  const toneGuidance = buildToneGuidance(classification, alignment);

  return `Claim: "${claim}"

Player ${action} the exhibit "${card.title}".

Player saw:
- Title: "${card.title}"
- Blurb: "${card.blurb}"

Hidden context:
- Fact: ${card.fact}
- Category: ${card.category}
- Reading alignment: ${formatAlignmentForPrompt(alignment)}

Prior exhibits:
${historyBlock}

1-2 sentences in The Architect's voice.

${toneGuidance}

HARD RULE (Invariant #5 / #2): never reveal scores, weights, alignment, or whether the classification was right or wrong. The alignment signal is server-only tone steering — never tell the player they were right or wrong, not even by implication ("you got that one", "you misread", "the truth is"). Posture, not announcement.

Emphasis via <em>/<strong>, sparingly (one or two per reaction max). Respond with ONLY the reaction text — no JSON, no quotes, no markdown.`;
}

function formatAlignmentForPrompt(alignment: ReadingAlignment): string {
  if (alignment === 'aligned') {
    return "ALIGNED — player's call goes with where the card leans.";
  }
  if (alignment === 'strained') {
    return "STRAINED — player's call cuts against where the card leans. Worth complicating, not correcting.";
  }
  return 'NEUTRAL — player struck the exhibit, or card sits near zero (genuinely ambiguous).';
}

function buildToneGuidance(classification: Classification, alignment: ReadingAlignment): string {
  if (classification === 'dismiss') {
    return `TONE — the strike: player declined to commit. Tease the hesitation, anchored in a phrase from the title or blurb they walked away from. The Architect notices when someone won't pick up the lever.`;
  }

  if (alignment === 'aligned') {
    return `TONE — call goes with the card: grudging acknowledgment. Quote a phrase from title or blurb pointing the same direction as their reading; let it stand alongside their call. Sardonic ("hmm. The card does say that.") but leave the call where the player put it. Don't confirm the call was right — let the supporting phrase carry the weight.`;
  }

  if (alignment === 'strained') {
    return `TONE — call cuts against the card: engage with the call as a deliberate weighing. Find a phrase in title or blurb that pulls a different direction; place it next to their call. Shape: "you read this as X; this phrase also points at Y" — Y must come from the title or blurb, not invented. Both readings exist on the card. Don't treat the call as a mistake — let the contrasting phrase carry the weight.`;
  }

  return `TONE — card sits near zero: genuinely ambiguous. A magisterial shrug ("the dial is unsettled here") anchored in a phrase from the card. Note it swings whichever way the player pushed without conceding which way is right.`;
}
