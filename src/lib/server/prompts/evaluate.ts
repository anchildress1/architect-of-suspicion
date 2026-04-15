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

  return `A player is investigating the claim: "${claim}"

They have just examined evidence card "${card.title}" and classified it as **${classification}**.

Card details (hidden from player):
- Title: ${card.title}
- Summary: ${card.blurb}
- Full context: ${card.fact}
- Category: ${card.category}

Prior evidence collected by this player:
${historyBlock}

Your task:
1. Evaluate how well the player's classification of "${classification}" aligns with what the card's full context actually suggests about the claim "${claim}".
2. Score the classification from -1.0 to 1.0:
   - Positive scores mean the classification ALIGNS with reality (the player read the evidence correctly)
   - Negative scores mean the classification is MISALIGNED (the player misread the evidence)
   - Magnitude indicates confidence: 0.1 = very ambiguous, 0.9 = clear-cut
   - Use the full range — avoid clustering around 0
3. Write a theatrical reaction as The Architect (2-4 sentences). React to this specific evidence AND the overall trajectory of the investigation so far.

Respond with ONLY valid JSON in this exact format:
{ "score": <number between -1.0 and 1.0>, "reaction": "<your theatrical reaction>" }`;
}
