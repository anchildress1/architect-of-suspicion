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
 *  Recruiter-safety floor: the surface claim is a public artifact. Style
 *  framings only — claims describe a working-style posture a hiring manager
 *  reads as substance ("Ashley over-engineers everything", "Ashley uses AI
 *  too much"). Both surface and truth stay in working-style territory.
 *
 *  Abstraction floor: claims need to travel across the corpus. The verb
 *  describes a recurring posture, not a particular tool or activity, so
 *  ~5+ categories of evidence can plausibly attach. A claim that mentions
 *  a specific tool ("with lint rules", "via ADRs") or activity ("over-tests
 *  her code") locks the evidence pool to one chamber and starves the
 *  game's witness flow.
 *
 *  Model:  claude-opus-4-7 — adaptive thinking pays off here because the
 *          model has to anchor each claim to a specific truth, decide
 *          desired_verdict from corpus evidence, hit the right abstraction
 *          level, and stay inside the recruiter-safety floor at once.
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

export const SYSTEM_PROMPT = `You write claims for Architect of Suspicion. Each claim has three fields:

1. claim_text — single declarative sentence: "Ashley [verb] [observation]". A working-style accusation that creates reasonable doubt.
2. hireable_truth — single declarative sentence. The trait the brief reveals at the end. Sharper than the surface; drawn from Pass 1's truths or a refinement of one.
3. desired_verdict — accuse if claim_text is roughly TRUE of Ashley (truth is the hireable refinement); pardon if claim_text is FALSE (truth contradicts it).

The brief reveals the hireable_truth regardless of verdict. Verdict only swings the rhetorical opener; it does not change the trait.

QUALITY FLOOR — every claim satisfies all of:

A. Style framing only. Claims describe Ashley's working style — over-engineers, ships rough drafts, leans on AI heavily, builds constraints before features. They never indict competence, integrity, ethics, or basic professionalism. Two recruiters reading two playthroughs of this claim walk away with the same conclusion about Ashley.

B. Presence, not absence. The predicate must describe a posture in action — a thing Ashley does, ships, builds, leans into, structures around. The grammar points at her work, not at what is missing from it. Truth refinements only sharpen postures; they cannot rescue a predicate built around a deficit. Recruiters read the surface first.

  Presence-shape predicates (use these grammars):
  - "[verb] [observable thing]" → "over-engineers everything", "ships rough drafts", "leans on AI heavily"
  - "[verb] [scope] before [scope]" → "builds constraints before features"
  - "[verb] [object]" → "weaponizes AI", "polices process"

  Absence-shape predicates (deficit framing — the surface verb may read positive but the predicate posts a loss column, and the hireable_truth cannot recover it):
  - "X at the cost of Y" / "X at the expense of Y" — predicate names what is being paid
  - "X instead of Y" / "X rather than Y" — predicate names what she should be doing instead
  - "X without Y" — predicate names a missing thing
  - "X to do her actual Y" — predicate names what she is supposedly avoiding

  Worked examples:
  - presence ✓ "Ashley leans on AI too heavily" → truth "Ashley weaponizes AI"
  - absence ✗ "Ashley leans on AI too heavily to do her actual thinking" → "to do her actual thinking" names missing thinking
  - presence ✓ "Ashley enables others through standardization" → truth "Ashley scales impact through standardization"
  - absence ✗ "Ashley enables others at the cost of her own delivery" → "at the cost of" posts a delivery loss column

  Before finalizing each claim, check the predicate. If it takes any absence shape, scrap the predicate and rewrite around what Ashley is actively DOING in the same territory.

C. Abstraction floor — verbs that travel. The verb names a posture that surfaces across 5+ chambers, not a particular tool or activity. If a claim names a specific tool, language, or scope ("with lint rules", "via ADRs", "in TypeScript", "in her side projects"), broaden the verb until the same posture shows up anywhere.
  - narrow: "Ashley over-polices process with lint rules" (only lint cards attach)
  - wide: "Ashley over-polices process" (lint, ADRs, code review, team standards, docs all attach)

D. Falsifiable. A reasonable observer reading the corpus could disagree. "Ashley is ambitious" fails — no card could counter it.

E. Truth-claim consistency. hireable_truth lives in the same working-style territory as claim_text — a sharper version of the same posture, not a non-sequitur exoneration.

F. Drawn from at least 2 truths in the input. Cite them in truths_targeted.

G. Rationale names specific card titles or categories supporting the claim.

HONESTY: Pass 4 cross-checks declared desired_verdict against the average ai_score sign of the claim's surviving pool. Mismatch drops the claim. Declare the verdict the evidence actually leans toward.`;

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
  return `<truths>
${JSON.stringify(truths, null, 2)}
</truths>

<corpus count="${cards.length}">
${formatCardCorpus(cards)}
</corpus>

<task>
Generate exactly ${target} candidate claims. Downstream scoring picks the best — cast a wide net.

Spread across:
- Breadth: each claim pulls from 5+ categories.
- Angle: speed vs craft, autonomy vs collaboration, build vs measure, breadth vs depth, plan vs improvise, ship vs polish.
- Verdict mix: ~half accuse-leaning, ~half pardon-leaning.
</task>

<shape_examples>
- "Ashley over-engineers everything"
  truth: "Ashley builds constraints before features so failure modes become design tools."
  verdict: accuse (surface true; truth sharpens it)
- "Ashley uses AI too much"
  truth: "Ashley weaponizes AI — teaches it, constrains it, holds it to the engineering standards she holds herself."
  verdict: pardon (surface false; truth contradicts)
- "Ashley would rather build it than buy it"
  truth: "Ashley prefers depth in load-bearing systems and leverage everywhere else."
  verdict: accuse
- "Ashley always knows better than the room"
  truth: "Ashley arrives with the call already loaded but tests it against the room before committing."
  verdict: pardon (surface reads as conviction; truth shows disciplined collaboration)
- "Ashley solves first, names later"
  truth: "Ashley ships drafts that work, then iterates names and structure once the shape is real."
  verdict: accuse
</shape_examples>`;
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

  const allClaims: GeneratedClaim[] = parsed.claims.map((claim, index) => {
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

  const claims: GeneratedClaim[] = [];
  for (const claim of allClaims) {
    const absence = detectAbsenceShape(claim.claim_text);
    if (absence) {
      console.log(
        `[pass2] DROPPED absence-shape "${claim.claim_text}" — ${absence.shape} via "${absence.match}"`,
      );
      continue;
    }
    claims.push(claim);
  }

  if (claims.length === 0) {
    throw new Error(
      `[pass2] every candidate claim had absence-shape predicates — re-run, raise reasoning effort, or tighten Rule B contrast examples`,
    );
  }

  console.log(`[pass2] ${claims.length} claims (after absence-shape filter):`);
  for (const claim of claims) {
    console.log(`  - [${claim.id}] (${claim.desired_verdict.toUpperCase()}) "${claim.claim_text}"`);
    console.log(`     truth: ${claim.hireable_truth}`);
    console.log(`     → ${claim.rationale}`);
  }

  return claims;
}

interface AbsenceMatch {
  shape: string;
  match: string;
}

/**
 * Backstop for Rule B (Presence, not absence). Pass 2's prompt teaches the
 * cut, but Opus 4.7 occasionally emits absence-shape predicates anyway when
 * the surface verb reads positive ("enables others at the cost of …"). The
 * connectives below are the dominant failure surface — match conservatively
 * to avoid false positives on presence-shape phrasings that share words
 * (e.g. "Ashley would rather build than buy" uses "rather X than Y", not
 * "rather than" as a substitution connective).
 */
export function detectAbsenceShape(claimText: string): AbsenceMatch | null {
  const patterns: Array<{ shape: string; pattern: RegExp }> = [
    { shape: 'cost frame', pattern: /\bat the (?:cost|expense) of\b/i },
    { shape: 'instead-of frame', pattern: /\binstead of\b/i },
    { shape: 'substitution frame', pattern: /\brather than\b/i },
    { shape: 'avoidance frame', pattern: /\bto do (?:her|the) actual\b/i },
  ];
  for (const { shape, pattern } of patterns) {
    const found = claimText.match(pattern);
    if (found) return { shape, match: found[0] };
  }
  return null;
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
