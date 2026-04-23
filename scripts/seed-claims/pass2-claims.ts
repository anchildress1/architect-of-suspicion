/** Pass 2: Claim Generation.
 *
 *  Input:  tension map from Pass 1 + full card corpus.
 *  Output: 3-5 claims, each phrased as a provocative accusation.
 *
 *  Model:  claude-sonnet-4-6
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, GeneratedClaim, TensionMap } from './types';

const SYSTEM_PROMPT = `You are writing claims for Architect of Suspicion — a game where players sort career-evidence cards as "proof" or "objection" against a single claim about the subject, Ashley.

A good claim is a blunt, provocative accusation a reasonable person could argue either way. It's framed from outside looking in, so the player has to make judgment calls against the evidence they see.`;

const SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_text: { type: 'string' },
          rationale: { type: 'string' },
          tensions_targeted: { type: 'array', items: { type: 'string' } },
        },
        required: ['claim_text', 'rationale', 'tensions_targeted'],
        additionalProperties: false,
      },
    },
  },
  required: ['claims'],
  additionalProperties: false,
} as const;

function buildPrompt(cards: CardRow[], tensions: TensionMap, target: number): string {
  return `TENSIONS (from Pass 1):
${JSON.stringify(tensions, null, 2)}

CORPUS SUMMARY (${cards.length} cards):
${formatCardCorpus(cards)}

TASK:
Generate ${target} candidate claims. Downstream scoring will pick the best ones, so cast a wide net:
- Vary the breadth: some claims should span many categories (Awards, Experience, Decisions, Work Style, Philosophy, Constraints, Experimentation); some can be more focused but must cover at least 3-4 categories
- Vary the angle: productivity vs quality, autonomy vs collaboration, craft vs speed, visibility vs substance
- Each claim must be framed as an accusation someone could argue either way — not a compliment, not a neutral observation
- Specific enough to evaluate against individual cards, no insider knowledge required
- Ground in at least 2 tensions from the list above

Examples of the shape:
- "Ashley prioritizes novelty over reliability"
- "Ashley coasts on reputation rather than earning it"
- "Ashley takes credit for what the team delivered"

Reject claims that are too soft ("Ashley is ambitious"), too narrow ("Ashley over-tests her code"), or not falsifiable.`;
}

export async function runPass2(
  cards: CardRow[],
  tensions: TensionMap,
): Promise<GeneratedClaim[]> {
  const client = clientFor(config.models.pass2);
  console.log(`[pass2] model=${client.model} generate=${config.targets.generate}`);

  const raw = await client.complete(
    buildPrompt(cards, tensions, config.targets.generate),
    { system: SYSTEM_PROMPT, maxTokens: 5000, schema: SCHEMA },
  );

  const parsed = JSON.parse(raw) as { claims: GeneratedClaim[] };
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    throw new TypeError('Pass 2 produced no claims');
  }

  console.log(`[pass2] ${parsed.claims.length} claims:`);
  for (let i = 0; i < parsed.claims.length; i++) {
    const c = parsed.claims[i];
    console.log(`  ${i + 1}. "${c.claim_text}"`);
    console.log(`     → ${c.rationale}`);
  }

  return parsed.claims;
}
