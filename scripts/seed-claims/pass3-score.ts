/** Pass 3: Card-Claim Scoring.
 *
 *  Input:  claims from Pass 2 + full card corpus.
 *  Output: per-card scores (ambiguity + surprise) for each claim, filtered
 *          by the PRD thresholds.
 *
 *  Model:  cheap/fast structured-eval model (default: claude-haiku-4-5).
 *          Runs in batch (one call per claim) to keep cost down.
 */

import { clientFor, extractJson } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardClaimScore, CardRow, GeneratedClaim } from './types';

const SYSTEM_PROMPT = `You score how each card in a corpus plays against a single claim.

Two axes:
- AMBIGUITY (1-5): how torn a player would be classifying this card as proof or objection from title+blurb alone. 5 = both readings are equally defensible. 1 = obvious.
- SURPRISE (1-5): how likely your evaluation (which sees the full "fact") will disagree with the player's gut read of just title+blurb. 5 = the player's gut is almost certainly wrong. 1 = the fact confirms the surface read.

You always return the full list. Never skip cards. Return valid JSON only.`;

function buildPrompt(claim: GeneratedClaim, cards: CardRow[]): string {
  return `CLAIM: "${claim.claim_text}"
RATIONALE: ${claim.rationale}

CORPUS (${cards.length} cards):
${formatCardCorpus(cards)}

Score every card against the claim. Output JSON:
{
  "scores": [
    { "card_id": "<objectID>", "ambiguity": 1-5, "surprise": 1-5 }
  ]
}`;
}

export async function runPass3(
  cards: CardRow[],
  claims: GeneratedClaim[],
): Promise<Map<string, CardClaimScore[]>> {
  const client = clientFor(config.models.pass3);
  console.log(`[pass3] model=${client.model} claims=${claims.length} cards=${cards.length}`);

  const results = new Map<string, CardClaimScore[]>();

  for (const claim of claims) {
    const raw = await client.complete(buildPrompt(claim, cards), {
      system: SYSTEM_PROMPT,
      maxTokens: 8000,
    });

    const parsed = extractJson<{ scores: CardClaimScore[] }>(raw);
    const filtered = parsed.scores.filter(
      (s) =>
        s.ambiguity >= config.thresholds.ambiguity ||
        s.surprise >= config.thresholds.surprise,
    );

    results.set(claim.claim_text, filtered);
    console.log(
      `[pass3] "${truncate(claim.claim_text, 50)}": ${parsed.scores.length} scored → ${filtered.length} passed threshold`,
    );
  }

  return results;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
