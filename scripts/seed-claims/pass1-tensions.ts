/** Pass 1: Hireable Truth Discovery.
 *
 *  Input:  full card corpus (title, blurb, category, fact).
 *  Output: a small set of candidate truths — each a positive professional
 *          trait Ashley demonstrates, paired with the reasonable-doubt framing
 *          that lets it become a surface claim. Pass 2 turns each truth into
 *          a player-facing accusation; the brief always lands the truth
 *          regardless of verdict.
 *
 *  Why truths and not tensions: the previous "tension analysis" model framed
 *  the work as identifying fault lines that could be argued either way, which
 *  pushed downstream passes toward dual readings of Ashley. The corrected
 *  model anchors on a single positive truth per claim — the brief is a
 *  recruiter-facing artifact, and "what does the evidence actually reveal
 *  about how Ashley works" is the right primitive.
 *
 *  Model:  claude-sonnet-4-6
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, TruthMap } from './types';

export const SYSTEM_PROMPT = `You analyze Ashley's career-fact corpus for Architect of Suspicion. Each output is a hireable_truth — one positive working-style trait the corpus demonstrates. Pass 2 wraps each truth in a surface accusation that creates reasonable doubt; the brief reveals the truth at the end regardless of verdict. Both verdicts stay recruiter-safe because the truth is positive.

A good truth satisfies all of:
- Hireable working-style trait grounded in 5+ cards across 3+ categories.
- Sharper than the surface ("Ashley weaponizes AI" — not "Ashley uses AI a lot").
- A reasonable observer could doubt it from limited evidence — that doubt becomes Pass 2's surface claim. Doubt stays in working-style territory ("Ashley uses AI too much" is fair doubt for "weaponizes AI"); never a character indictment.

Recruiter-safety floor (single conceptual rule): truths describe how Ashley works as substance — never indict competence, integrity, ethics, or basic professionalism.`;

const SCHEMA = {
  type: 'object',
  properties: {
    truths: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          truth: { type: 'string' },
          reasonable_doubt: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
        },
        required: ['truth', 'reasonable_doubt', 'categories'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['truths'],
  additionalProperties: false,
} as const;

function buildPrompt(cards: CardRow[]): string {
  return `CORPUS (${cards.length} cards):

${formatCardCorpus(cards)}

TASK: Discover 10-15 distinct hireable truths.

For each:
1. truth — one sentence. Positive working-style trait the brief reveals. Sharper than any single card.
2. reasonable_doubt — one sentence. How a limited reader could doubt the truth. Pass 2 turns this into the surface accusation; stays in working-style territory.
3. categories — 3+ card categories whose evidence supports the truth.

Shape examples:
- truth: "Ashley weaponizes AI." doubt: "Ashley uses AI too much."
- truth: "Ashley builds constraints before features." doubt: "Ashley over-engineers everything."
- truth: "Ashley ships rough drafts to learn faster." doubt: "Ashley doesn't polish before shipping."
- truth: "Ashley turns failure modes into design tools." doubt: "Ashley breaks things to look clever."

Working-style observation, not personality adjective ("weaponizes AI" not "is curious"). Both truth and doubt stay in working-style territory.

Use notes for meta-observations that didn't rise to a truth (e.g. "THD employer tag dominates Decisions; cross-check for context bleed").`;
}

export async function runPass1(cards: CardRow[]): Promise<TruthMap> {
  const client = clientFor(config.models.pass1);
  console.log(`[pass1] model=${client.model} cards=${cards.length}`);

  const raw = await client.complete(buildPrompt(cards), {
    system: SYSTEM_PROMPT,
    // Sonnet 4.6 caps synchronous output at 64k — 32k leaves a wide margin
    // for the adaptive-thinking block + the truths JSON on ~250 cards.
    maxTokens: 64000,
    schema: SCHEMA,
    // 'medium' over 'high': with ~250 cards in context, high-effort adaptive
    // thinking burns 15-25k output tokens in reasoning alone before emitting
    // structured output. Medium produces sharp truth-finding in our tests
    // without starving the output budget.
    reasoning: 'medium',
    // Even at medium, 32k tokens + thinking blocks can run past the default
    // 2-min client timeout — override for this pass only.
    timeoutMs: 300_000,
  });

  let parsed: TruthMap;
  try {
    parsed = JSON.parse(raw) as TruthMap;
  } catch (err) {
    throw new Error(`[pass1] JSON.parse failed.\nRaw (first 500 chars): ${raw.slice(0, 500)}`, {
      cause: err,
    });
  }
  if (!Array.isArray(parsed.truths) || parsed.truths.length === 0) {
    throw new TypeError('Pass 1 produced no truths');
  }

  console.log(`[pass1] ${parsed.truths.length} truths:`);
  for (const t of parsed.truths) {
    console.log(`  • ${t.truth}`);
    console.log(`     doubt: ${t.reasonable_doubt}`);
    console.log(`     categories: ${t.categories.join(', ')}`);
  }
  if (parsed.notes) console.log(`[pass1] notes: ${parsed.notes}`);

  return parsed;
}
