/** Pass 2: Claim Generation.
 *
 *  Input:  truth map from Pass 1 + full card corpus.
 *  Output: config.targets.generate candidate claims (default 15). Each claim
 *          carries a single underlying hireable_truth (the trait the brief
 *          will reveal) plus a desired_verdict that flags whether the surface
 *          claim is TRUE of Ashley (player Accuses to align) or FALSE (player
 *          Pardons to align).
 *
 *  Why this shape: the brief lands the same hireable_truth regardless of
 *  verdict. The verdict only swings the rhetorical opener — match means the
 *  player saw the truth clearly, miss means the record corrects them. Two
 *  recruiters investigating the same claim reach the same conclusion about
 *  Ashley; only the storytelling differs.
 *
 *  Recruiter-safety rule (unchanged): the surface claim is a public artifact.
 *  Style claims ("Ashley over-engineers everything", "Ashley uses AI too
 *  much") are fine — both readings, and the underlying truth, describe a
 *  hireable working-style trait. Moral indictments ("Ashley takes credit",
 *  "Ashley coasts on reputation") stay forbidden — they damage the artifact
 *  no matter how the verdict resolves.
 *
 *  Model:  claude-opus-4-7 — adaptive thinking pays off here because the
 *          model has to anchor each claim to a specific truth, decide
 *          desired_verdict from corpus evidence, and stay inside the
 *          recruiter-safety constraint simultaneously.
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, GeneratedClaim, TruthMap } from './types';

interface ParsedClaim {
  claim_text: string;
  rationale: string;
  truths_targeted: string[];
  hireable_truth: string;
  desired_verdict: 'accuse' | 'pardon';
}

export const SYSTEM_PROMPT = `You write claims for Architect of Suspicion — a game where players sort Ashley's career facts as "proof" or "objection" against a single claim about Ashley, then render Accuse or Pardon. The brief at the end always reveals a single underlying hireable_truth about how Ashley works; the verdict only swings the rhetorical opener (player saw the truth vs the record corrects them).

Each claim you write has three parts:
1. claim_text — the surface accusation, the question the player investigates. A reasonable-doubt framing of the underlying truth.
2. hireable_truth — the single positive professional trait the brief reveals at the end. Drawn from Pass 1's truths or a sharper version of one.
3. desired_verdict — the verdict that aligns with reality. accuse if the surface claim_text is TRUE of Ashley (the player accuses correctly to align with the truth); pardon if claim_text is FALSE (the truth contradicts the surface accusation).

Recruiter-safety rule (non-negotiable): the game is a public artifact viewed by recruiters. Both the claim_text AND the hireable_truth must read as a recognizable professional trait a hiring manager would respect — even when the brief contradicts the surface claim. A claim that indicts competence, integrity, ethics, or basic professionalism is forbidden, even if the brief "exonerates" Ashley by surfacing the contradicting truth. Style framings only.

Forbidden claim shapes (these EXACT shapes shipped in earlier seed runs and damaged the public artifact — never regenerate them or anything functionally equivalent):
- "Ashley coasts on reputation rather than earning it" (indicts effort)
- "Ashley takes credit for what the team delivered" (indicts integrity)
- "Ashley prioritizes novelty over reliability" (recruiters read this as "ships broken things")

Output contract:
- claim_text is a single declarative sentence: "Ashley [verb] [working-style observation]"
- hireable_truth is a single declarative sentence: the trait the brief reveals
- The relationship between claim_text and hireable_truth is reasonable doubt: someone reading the corpus quickly could plausibly believe claim_text; the full evidence reveals hireable_truth instead
- desired_verdict reflects which way the FULL evidence actually leans:
   - accuse: claim_text is roughly TRUE of Ashley, sharpened by hireable_truth (e.g. claim "Ashley over-engineers everything"; truth "Ashley builds constraints before features"; desired_verdict accuse — the surface claim is true, the truth is the hireable refinement)
   - pardon: claim_text is roughly FALSE of Ashley; hireable_truth is the actual story (e.g. claim "Ashley uses AI too much"; truth "Ashley weaponizes AI — teaches and constrains it"; desired_verdict pardon — the surface accusation collapses under the truth)
- Each claim must draw on at least 2 truths from the input
- Rationale must name specific card titles or categories that support the claim
- Return exactly the number of claims requested — no more, no fewer

Honesty contract: downstream Pass 4 cross-checks the desired_verdict you declare against the average ai_score sign of the claim's surviving card pool. A mismatch (claim says accuse but evidence leans pardon, or vice versa) drops the claim from the seed entirely. There is no benefit to fudging the desired_verdict — the cross-check catches it and you lose the claim anyway.`;

/** Anthropic's structured-outputs API (`output_config.format.schema`) rejects
 *  any `minItems` value other than 0 or 1, so we can't pin array length in the
 *  schema the way we used to. The prompt asks for the exact count and the
 *  truths floor; assertOutputShape() below rejects any drift after parse. */
function schemaForTarget(_target: number): Record<string, unknown> {
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
            truths_targeted: {
              type: 'array',
              items: { type: 'string' },
            },
            hireable_truth: { type: 'string', minLength: 1 },
            desired_verdict: { type: 'string', enum: ['accuse', 'pardon'] },
          },
          required: [
            'claim_text',
            'rationale',
            'truths_targeted',
            'hireable_truth',
            'desired_verdict',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['claims'],
    additionalProperties: false,
  };
}

function buildPrompt(cards: CardRow[], truths: TruthMap, target: number): string {
  // Claude responds cleanly to clear XML-ish section tags — keep the same
  // content but wrap inputs so Opus's long-context attention can separate
  // raw material from task instructions.
  return `<truths>
${JSON.stringify(truths, null, 2)}
</truths>

<corpus count="${cards.length}">
${formatCardCorpus(cards)}
</corpus>

<task>
Generate exactly ${target} candidate claims. Downstream scoring selects the best ones, so cast a wide net.
</task>

<requirements>
1. Each claim_text is a working-style accusation a reasonable observer could doubt the truth of — not a compliment, not neutral, not a moral indictment.
2. Specific enough to evaluate against individual cards without insider knowledge.
3. Grounded in at least 2 truths from the input — cite them in truths_targeted.
4. Rationale must reference specific card titles or categories as supporting evidence.
5. hireable_truth is the brief's reveal: a single sharper, hireable trait the FULL evidence demonstrates.
6. desired_verdict reflects the FULL evidence's verdict against the surface claim_text — accuse if true of Ashley, pardon if not. Be honest; downstream cross-checks compare desired_verdict against the average ai_score sign of the claim's pool, and a mismatch drops the claim.
</requirements>

<variety>
Spread claims across these axes:
- Breadth: some claims span 5+ categories; others focus on 3-4 but go deeper.
- Angle: speed vs craft, autonomy vs collaboration, build vs measure, breadth vs depth, plan vs improvise, ship vs polish.
- Verdict mix: aim for roughly half accuse-leaning and half pardon-leaning across the batch so downstream selection has both shapes.
</variety>

<shape_examples>
Each example is paired with the underlying truth and desired verdict.
- "Ashley over-engineers everything"
  - hireable_truth: "Ashley builds constraints before features so failure modes become design tools."
  - desired_verdict: accuse (surface claim is roughly true; truth is the hireable refinement)
- "Ashley uses AI too much"
  - hireable_truth: "Ashley weaponizes AI — teaches it, constrains it, holds it to the engineering standards she holds herself."
  - desired_verdict: pardon (surface claim is false; the truth contradicts it)
- "Ashley would rather build it than buy it"
  - hireable_truth: "Ashley prefers depth in load-bearing systems and leverage everywhere else."
  - desired_verdict: accuse (rough true; truth sharpens the trade-off into a hireable rule)
- "Ashley always knows better than the room"
  - hireable_truth: "Ashley arrives with the call already loaded but tests it against the room before committing."
  - desired_verdict: pardon (surface reads as arrogance; the truth shows disciplined collaboration)
- "Ashley solves first, names later"
  - hireable_truth: "Ashley ships drafts that work, then iterates names and structure once the shape is real."
  - desired_verdict: accuse
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
  Reframe character claims as style claims that pass the recruiter-safety test, or drop them.
- Truth-claim mismatches — hireable_truth must be the SAME working-style territory as claim_text, not a non-sequitur exoneration.
</rejection_criteria>`;
}

export async function runPass2(cards: CardRow[], truths: TruthMap): Promise<GeneratedClaim[]> {
  const client = clientFor(config.models.pass2);
  const target = config.targets.generate;
  console.log(`[pass2] model=${client.model} generate=${target}`);

  const raw = await client.complete(buildPrompt(cards, truths, target), {
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
      `[pass2] expected ${target} claims, got ${parsed.claims.length} — Anthropic structured outputs can't enforce minItems/maxItems > 1, so the prompt is the only count guard. Re-run, or raise reasoning effort.`,
    );
  }

  const claims: GeneratedClaim[] = parsed.claims.map((claim, index) => {
    assertNonEmpty(claim.hireable_truth, 'hireable_truth', claim.claim_text);
    assertVerdict(claim.desired_verdict, claim.claim_text);
    assertTruthsTargeted(claim.truths_targeted, claim.claim_text);
    return {
      id: `claim-${index + 1}`,
      claim_text: claim.claim_text,
      rationale: claim.rationale,
      truths_targeted: claim.truths_targeted,
      hireable_truth: claim.hireable_truth.trim(),
      desired_verdict: claim.desired_verdict,
    };
  });

  console.log(`[pass2] ${claims.length} claims:`);
  for (const claim of claims) {
    console.log(`  - [${claim.id}] (${claim.desired_verdict.toUpperCase()}) "${claim.claim_text}"`);
    console.log(`     truth: ${claim.hireable_truth}`);
    console.log(`     → ${claim.rationale}`);
  }

  return claims;
}

// Both fields are persisted to suspicion.claims (NOT NULL with CHECK
// constraints) and consumed at runtime by the cover letter prompt. Validate
// at the pipeline edge — a downstream nullish value is a pipeline bug, not
// something runtime should silently paper over.
function assertNonEmpty(value: unknown, field: string, claimText: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `[pass2] missing ${field} for claim "${claimText}" — schema should have prevented this`,
    );
  }
}

function assertVerdict(value: unknown, claimText: string): void {
  if (value !== 'accuse' && value !== 'pardon') {
    throw new Error(
      `[pass2] invalid desired_verdict=${String(value)} for claim "${claimText}" — schema should have prevented this`,
    );
  }
}

// Anthropic's `output_config.format.schema` only allows minItems 0 or 1, so
// the "≥ 2 truths" floor moved out of the JSON Schema and lives here.
function assertTruthsTargeted(value: unknown, claimText: string): void {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(
      `[pass2] truths_targeted must include at least 2 truths for claim "${claimText}" (got ${
        Array.isArray(value) ? value.length : typeof value
      })`,
    );
  }
}
