/** Pass 2: Claim Generation.
 *
 *  Input:  tension map from Pass 1 + full card corpus.
 *  Output: 3-5 claims, each phrased as a provocative accusation.
 *
 *  Model:  creative with strong instruction-following (default: gemini-3.1-pro).
 */

import { clientFor, extractJson } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, GeneratedClaim, TensionMap } from './types';

const SYSTEM_PROMPT = `You are writing claims for Architect of Suspicion — a game where players sort career-evidence cards as "proof" or "objection" against a single claim about the subject, Ashley.

A good claim is a blunt, provocative accusation a reasonable person could argue either way. It's framed from outside looking in, so the player has to make judgment calls against the evidence they see.

Return valid JSON only. No prose preamble.`;

function buildPrompt(cards: CardRow[], tensions: TensionMap, target: number): string {
  return `TENSIONS (from Pass 1):
${JSON.stringify(tensions, null, 2)}

CORPUS SUMMARY (${cards.length} cards):
${formatCardCorpus(cards)}

TASK:
Generate ${target} claims. Each claim must:
1. Be framed as an accusation someone could argue either way — not a compliment, not a neutral observation
2. Create ambiguity across MULTIPLE rooms (categories), not just one
3. Be specific enough to evaluate against individual cards
4. Not require insider knowledge — any reader can tell if a card supports or objects to the claim
5. Ground in at least 2-3 tensions from the list above

Examples of the shape:
- "Ashley prioritizes novelty over reliability"
- "Ashley coasts on reputation rather than earning it"
- "Ashley takes credit for what the team delivered"

Reject claims that are too soft ("Ashley is ambitious"), too narrow ("Ashley over-tests her code"), or not falsifiable.

Output JSON:
{
  "claims": [
    {
      "claim_text": "the claim as it will be shown to players",
      "rationale": "1-2 sentences — which tensions this targets and why it should produce cross-room ambiguity",
      "tensions_targeted": ["theme names from the tension map"]
    }
  ]
}`;
}

export async function runPass2(
  cards: CardRow[],
  tensions: TensionMap,
): Promise<GeneratedClaim[]> {
  const client = clientFor(config.models.pass2);
  console.log(`[pass2] model=${client.model} target=${config.targets.claims}`);

  const raw = await client.complete(
    buildPrompt(cards, tensions, config.targets.claims),
    { system: SYSTEM_PROMPT, maxTokens: 3000, jsonMode: true },
  );

  const parsed = extractJson<{ claims: GeneratedClaim[] }>(raw);
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    throw new Error('Pass 2 produced no claims');
  }

  console.log(`[pass2] generated ${parsed.claims.length} claims`);
  return parsed.claims;
}
