import type { Classification, FullCard } from '$lib/types';

interface PickHistoryEntry {
  card_id: string;
  card_title: string;
  classification: Classification;
}

const ACTION_VERB: Record<Classification, string> = {
  proof: 'entered into evidence as PROOF',
  objection: 'raised as OBJECTION',
  dismiss: 'STRUCK from the record',
};

/**
 * Build the prompt for the Architect's per-pick reaction.
 *
 * The directional score is pre-computed in suspicion.claim_cards — the LLM
 * never produces it at runtime. Its only job here is the in-character reaction.
 */
export function buildReactionPrompt(
  claim: string,
  card: FullCard,
  classification: Classification,
  history: PickHistoryEntry[],
): string {
  const action = ACTION_VERB[classification];

  const historyBlock =
    history.length > 0
      ? history.map((h, i) => `  ${i + 1}. "${h.card_title}" → ${h.classification}`).join('\n')
      : '  (No prior exhibits)';

  return `Claim under investigation: "${claim}"

The player ${action} the exhibit "${card.title}".

What the player saw:
- Title: "${card.title}"
- Blurb: "${card.blurb}"

What you know (hidden from player):
- Full context: ${card.fact}
- Category: ${card.category}

Prior exhibits in this session:
${historyBlock}

Write the Architect's reaction (1-2 sentences). You MUST:
- Name a SPECIFIC detail from the card (a technology, a decision, a metric — something concrete)
- Connect it explicitly to the claim "${claim}"
- React to the action — ${
    classification === 'dismiss'
      ? 'note that the player struck this from the record without ruling on it; tease their reluctance to commit'
      : `react to the player calling this ${classification.toUpperCase()}; mock if it strains the truth, grudgingly acknowledge if it lands`
  }
- NEVER reveal a score, weight, or whether the classification was "right" or "wrong"

Respond with ONLY the reaction text — no JSON, no quotes, no formatting.`;
}
