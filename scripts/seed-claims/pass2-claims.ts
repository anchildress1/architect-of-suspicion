/** Pass 2: Claim Generation.
 *
 *  Input:  tension map from Pass 1 + full card corpus.
 *  Output: config.targets.generate candidate claims (default 15), each phrased as a provocative accusation.
 *
 *  Model:  gpt-5.4
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, GeneratedClaim, TensionMap } from './types';

interface ParsedClaim {
  claim_text: string;
  rationale: string;
  tensions_targeted: string[];
}

const SYSTEM_PROMPT = `You write claims for Architect of Suspicion — a game where players sort career-evidence cards as "proof" or "objection" against a single claim about the subject, Ashley.

A good claim is a blunt, provocative accusation that a reasonable person could argue either way using the available evidence. Claims are framed from an outsider's perspective — the player has no insider knowledge.

Output contract:
- Every claim must be a single declarative sentence in the form "Ashley [verb] [accusation]"
- Each claim must be grounded in at least 2 tensions from the input
- Rationale must name specific card titles or categories that support the claim
- Return exactly the number of claims requested — no more, no fewer`;

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
Generate exactly ${target} candidate claims. Downstream scoring selects the best ones, so cast a wide net.

Requirements (all must hold for every claim):
1. Framed as an accusation someone could argue either way — not a compliment, not neutral
2. Specific enough to evaluate against individual cards without insider knowledge
3. Grounded in at least 2 tensions from the list above — cite them in tensions_targeted
4. Rationale must reference specific card titles or categories as supporting evidence

Variety axes (spread claims across these):
- Breadth: some claims span 5+ categories; others focus on 3-4 but go deeper
- Angle: productivity vs quality, autonomy vs collaboration, craft vs speed, visibility vs substance, consistency vs adaptability

Shape examples:
- "Ashley prioritizes novelty over reliability"
- "Ashley coasts on reputation rather than earning it"
- "Ashley takes credit for what the team delivered"

Rejection criteria — do not generate claims that are:
- Too soft: "Ashley is ambitious" (not falsifiable)
- Too narrow: "Ashley over-tests her code" (too few cards apply)
- Too specific: requires insider knowledge to evaluate`;
}

export async function runPass2(cards: CardRow[], tensions: TensionMap): Promise<GeneratedClaim[]> {
  const client = clientFor(config.models.pass2);
  console.log(`[pass2] model=${client.model} generate=${config.targets.generate}`);

  const raw = await client.complete(buildPrompt(cards, tensions, config.targets.generate), {
    system: SYSTEM_PROMPT,
    // GPT-5.4 caps output at 128k. At `generate: 18` with medium reasoning
    // effort, the old 5000 ceiling was getting eaten by chain-of-thought
    // tokens before all 18 claims could emit. 16k gives comfortable headroom.
    maxTokens: 16000,
    schema: SCHEMA,
    reasoning: 'medium',
  });

  let parsed: { claims: ParsedClaim[] };
  try {
    parsed = JSON.parse(raw) as { claims: ParsedClaim[] };
  } catch (err) {
    throw new Error(`[pass2] JSON.parse failed.\nRaw (first 500 chars): ${raw.slice(0, 500)}`, {
      cause: err,
    });
  }
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    throw new TypeError('Pass 2 produced no claims');
  }

  const claims: GeneratedClaim[] = parsed.claims.map((claim, index) => ({
    id: `claim-${index + 1}`,
    claim_text: claim.claim_text,
    rationale: claim.rationale,
    tensions_targeted: claim.tensions_targeted,
  }));

  console.log(`[pass2] ${claims.length} claims:`);
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    console.log(`  ${i + 1}. [${c.id}] "${c.claim_text}"`);
    console.log(`     → ${c.rationale}`);
  }

  return claims;
}
