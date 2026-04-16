import type { Classification, FullCard } from '$lib/types';

interface PickHistoryEntry {
  card_id: string;
  card_title: string;
  classification: Classification;
}

export function buildEvaluationPrompt(
  claim: string,
  card: FullCard,
  classification: Classification,
  history: PickHistoryEntry[],
): string {
  const historyBlock =
    history.length > 0
      ? history
          .map(
            (h, i) =>
              `  ${i + 1}. "${h.card_title}" classified as ${h.classification}`,
          )
          .join('\n')
      : '  (No prior evidence collected)';

  return `Claim under investigation: "${claim}"

The player classified "${card.title}" as **${classification}**.

What the player sees:
- Title: "${card.title}"
- Summary: "${card.blurb}"

What you know (hidden from player):
- Full context: ${card.fact}
- Category: ${card.category}

Prior picks:
${historyBlock}

Tasks:
1. Score from -1.0 to 1.0 — does classifying this as "${classification}" make sense given the full context and the claim?
   Positive = player read it right. Negative = player misread it. Use the full range.
2. Write your reaction (1-2 sentences). You MUST:
   - Name the specific detail from the card (a technology, a decision, a metric — something concrete the player can see)
   - Connect it explicitly to the claim "${claim}"
   - React to WHETHER their classification makes sense — mock them if it doesn't, grudgingly acknowledge if it does
   - Example tone: "So you think Ashley earning a Gold Homer suggests she ${classification === 'proof' ? 'proves' : 'disproves'} the claim. ${classification === 'proof' ? 'Interesting leap.' : 'A generous reading, perhaps.'}"

Respond with ONLY valid JSON:
{ "score": <number>, "reaction": "<your reaction>" }`;
}
