/** Pass 2: Claim Generation.
 *
 *  Input:  tension map from Pass 1 + full card corpus.
 *  Output: config.targets.generate candidate claims (default 15), each phrased as a provocative accusation.
 *
 *  Model:  claude-opus-4-7 — tuned for Opus's adaptive thinking + effort
 *          knobs. Single call, generous output budget, explicit count pin.
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

/** Pin the output array length in the schema itself. Opus strict-mode
 *  honors minItems/maxItems so the model physically cannot over- or
 *  under-produce, and we save the retries we used to burn when a loose
 *  schema let it return 12 claims when we asked for 18. */
function schemaForTarget(target: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim_text: { type: 'string', minLength: 1 },
            rationale: { type: 'string', minLength: 1 },
            tensions_targeted: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
            },
          },
          required: ['claim_text', 'rationale', 'tensions_targeted'],
          additionalProperties: false,
        },
        minItems: target,
        maxItems: target,
      },
    },
    required: ['claims'],
    additionalProperties: false,
  };
}

function buildPrompt(cards: CardRow[], tensions: TensionMap, target: number): string {
  // Claude responds cleanly to clear XML-ish section tags — keep the same
  // content but wrap inputs so Opus's long-context attention can separate
  // raw material from task instructions.
  return `<tensions>
${JSON.stringify(tensions, null, 2)}
</tensions>

<corpus count="${cards.length}">
${formatCardCorpus(cards)}
</corpus>

<task>
Generate exactly ${target} candidate claims. Downstream scoring selects the best ones, so cast a wide net.
</task>

<requirements>
1. Framed as an accusation someone could argue either way — not a compliment, not neutral.
2. Specific enough to evaluate against individual cards without insider knowledge.
3. Grounded in at least 2 tensions from the list above — cite them in tensions_targeted.
4. Rationale must reference specific card titles or categories as supporting evidence.
</requirements>

<variety>
Spread claims across these axes:
- Breadth: some claims span 5+ categories; others focus on 3-4 but go deeper.
- Angle: productivity vs quality, autonomy vs collaboration, craft vs speed, visibility vs substance, consistency vs adaptability.
</variety>

<shape_examples>
- "Ashley prioritizes novelty over reliability"
- "Ashley coasts on reputation rather than earning it"
- "Ashley takes credit for what the team delivered"
</shape_examples>

<rejection_criteria>
Do not generate claims that are:
- Too soft: "Ashley is ambitious" (not falsifiable)
- Too narrow: "Ashley over-tests her code" (too few cards apply)
- Too specific: requires insider knowledge to evaluate
</rejection_criteria>`;
}

export async function runPass2(cards: CardRow[], tensions: TensionMap): Promise<GeneratedClaim[]> {
  const client = clientFor(config.models.pass2);
  const target = config.targets.generate;
  console.log(`[pass2] model=${client.model} generate=${target}`);

  const raw = await client.complete(buildPrompt(cards, tensions, target), {
    system: SYSTEM_PROMPT,
    // Opus 4.7 sync output cap is 64k and its new tokenizer runs ~35% more
    // tokens for the same text. Adaptive-thinking at medium effort eats a
    // chunk before the JSON emits — 32k leaves comfortable headroom for
    // target=18 claims plus the reasoning block, without nearing the cap.
    maxTokens: 32000,
    schema: schemaForTarget(target),
    reasoning: 'medium',
    // At 32k tokens + medium thinking, wall-clock exceeds the default 2-min
    // client timeout on corpus-sized runs — mirror Pass 1's override.
    timeoutMs: 300_000,
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
  if (parsed.claims.length !== target) {
    throw new Error(
      `[pass2] expected ${target} claims, got ${parsed.claims.length} — strict-schema minItems/maxItems should have prevented this`,
    );
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
