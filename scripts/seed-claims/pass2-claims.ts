/** Pass 2: Claim Generation.
 *
 *  Input:  tension map from Pass 1 + full card corpus.
 *  Output: config.targets.generate candidate claims (default 15), each a single
 *          declarative sentence about Ashley's working style that reads as a
 *          hireable trait under BOTH the "guilty" and "not guilty" verdict.
 *
 *  Recruiter-safety rule: this game is a public artifact. Every claim that
 *  ships must satisfy the dual-hireability test — both verdicts must read as
 *  professional traits a recruiter would respect. Claims that indict character
 *  or morality (e.g. "Ashley takes credit for the team's work") are forbidden:
 *  even when disproven, the surface text plants a defamatory suggestion next
 *  to Ashley's name. Style accusations ("Ashley over-engineers everything")
 *  are fine — guilty reads as rigor, not-guilty reads as pragmatic shipping.
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
  guilty_reading: string;
  not_guilty_reading: string;
}

export const SYSTEM_PROMPT = `You write claims for Architect of Suspicion — a game where players sort Ashley's career facts as "proof" or "objection" against a single claim about Ashley.

A good claim describes Ashley's working style, instinct, approach, or pattern in a way that creates genuine player tension AND satisfies the dual-hireability test: both the "guilty" reading (this is true of Ashley) and the "not guilty" reading (this is not true of Ashley) must land as professional traits a hiring manager would respect. The claim is the surface tension; either resolution must still make Ashley look like a strong hire.

This is non-negotiable. The game is a public artifact viewed by recruiters. A claim that indicts character — competence, integrity, ethics, basic professionalism — is forbidden, even if "disproven" in play. The surface text is what a recruiter reads. Style claims are fine; moral claims are not.

Forbidden claim shapes (these EXACT shapes shipped in earlier seed runs and damaged the public artifact — never regenerate them or anything functionally equivalent):
- "Ashley coasts on reputation rather than earning it" (indicts effort)
- "Ashley takes credit for what the team delivered" (indicts integrity)
- "Ashley prioritizes novelty over reliability" (recruiters read this as "ships broken things")

Output contract:
- Every claim must be a single declarative sentence in the form "Ashley [verb] [working-style observation]"
- Each claim must be grounded in at least 2 tensions from the input
- Rationale must name specific card titles or categories that support the claim
- guilty_reading: one sentence describing the hireable professional trait someone sees if the claim is true
- not_guilty_reading: one sentence describing the hireable professional trait someone sees if the claim is false
- If you cannot honestly write both readings as hireable, the claim fails the test — replace it with one that passes
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
            // The dual-hireability fields are required so the model commits
            // to both readings up front. Self-graded — Pass 3+ never reads
            // them — but the act of writing them forces the test before the
            // claim ships.
            guilty_reading: { type: 'string', minLength: 1 },
            not_guilty_reading: { type: 'string', minLength: 1 },
          },
          required: [
            'claim_text',
            'rationale',
            'tensions_targeted',
            'guilty_reading',
            'not_guilty_reading',
          ],
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
1. Describes a working-style pattern someone could argue either way from the evidence — not a compliment, not neutral, but also not a moral indictment.
2. Specific enough to evaluate against individual cards without insider knowledge.
3. Grounded in at least 2 tensions from the list above — cite them in tensions_targeted.
4. Rationale must reference specific card titles or categories as supporting evidence.
5. Dual-hireability test: write guilty_reading and not_guilty_reading. Both must describe a recognizable professional trait a hiring manager would respect. If you cannot, the claim fails — replace it.
</requirements>

<variety>
Spread claims across these axes:
- Breadth: some claims span 5+ categories; others focus on 3-4 but go deeper.
- Angle: speed vs craft, autonomy vs collaboration, build vs measure, breadth vs depth, plan vs improvise, ship vs polish.
</variety>

<shape_examples>
Each example is paired with the dual-hireability check that lets it ship.
- "Ashley over-engineers everything"
  - guilty: rigor that pays off in production
  - not guilty: ships pragmatically when 80% is enough
- "Ashley would rather build it than buy it"
  - guilty: hands-on craft and deep understanding of her own stack
  - not guilty: pragmatic about leverage and existing tools
- "Ashley always knows better than the room"
  - guilty: confident expert worth listening to
  - not guilty: humble collaborator who genuinely takes input
- "Ashley follows curiosity over plan"
  - guilty: opportunistic, ships things nobody else thought of
  - not guilty: disciplined when the moment requires a plan
- "Ashley solves first, names later"
  - guilty: bias to working code
  - not guilty: cares about clarity and maintainability
</shape_examples>

<rejection_criteria>
Do not generate claims that are:
- Too soft: "Ashley is ambitious" (not falsifiable)
- Too narrow: "Ashley over-tests her code" (too few cards apply)
- Too specific: requires insider knowledge to evaluate
- Character indictments — competence, integrity, ethics, basic professionalism. Examples that are FORBIDDEN even though earlier versions of this prompt accepted them:
  - "Ashley coasts on reputation" (indicts effort)
  - "Ashley takes credit for what the team delivered" (indicts integrity)
  - "Ashley prioritizes novelty over reliability" (indicts judgment in a way recruiters will read as "ships broken things")
  Reframe character claims as style claims that pass the dual-hireability test, or drop them.
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
    const p = parsed.claims[i];
    console.log(`  ${i + 1}. [${c.id}] "${c.claim_text}"`);
    console.log(`     → ${c.rationale}`);
    console.log(`     ✓ guilty:     ${p.guilty_reading}`);
    console.log(`     ✓ not guilty: ${p.not_guilty_reading}`);
  }

  return claims;
}
