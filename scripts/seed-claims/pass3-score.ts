/** Pass 3: Card-Claim Scoring.
 *
 *  Input:  claims from Pass 2 + full card corpus.
 *  Output: per-card scores (ambiguity + surprise) for each claim, filtered
 *          by the PRD thresholds.
 *
 *  Model:  gpt-5.4-mini — cheap/fast, one call per claim.
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardClaimScore, CardRow, GeneratedClaim } from './types';

const SYSTEM_PROMPT = `You score how each card in a corpus plays against a single claim.

Two axes:
- AMBIGUITY (1-5): how torn a player would be classifying this card as proof or objection from title+blurb alone. 5 = both readings are equally defensible. 1 = obvious.
- SURPRISE (1-5): how likely your evaluation (which sees the full "fact") will disagree with the player's gut read of just title+blurb. 5 = the player's gut is almost certainly wrong. 1 = the fact confirms the surface read.

Score every card. Never skip cards.`;

const SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
          ambiguity: { type: 'integer' },
          surprise: { type: 'integer' },
        },
        required: ['card_id', 'ambiguity', 'surprise'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
} as const;

function buildPrompt(claim: GeneratedClaim, cards: CardRow[]): string {
  return `CLAIM: "${claim.claim_text}"
RATIONALE: ${claim.rationale}

CORPUS (${cards.length} cards):
${formatCardCorpus(cards)}

Score every card against the claim.`;
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
      schema: SCHEMA,
    });

    const parsed = JSON.parse(raw) as { scores: CardClaimScore[] };
    const filtered = parsed.scores.filter(
      (s) =>
        s.ambiguity >= config.thresholds.ambiguity ||
        s.surprise >= config.thresholds.surprise,
    );

    const highAmbig = filtered.filter((s) => s.ambiguity >= 4).length;
    const highSurprise = filtered.filter((s) => s.surprise >= 4).length;
    console.log(
      `[pass3] "${claim.claim_text}": ${parsed.scores.length} scored → ${filtered.length} passed (${highAmbig} high-ambig, ${highSurprise} high-surprise)`,
    );

    results.set(claim.claim_text, filtered);
  }

  return results;
}
