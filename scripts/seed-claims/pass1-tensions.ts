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

export const SYSTEM_PROMPT = `You analyze a corpus of Ashley's career facts for a narrative game called Architect of Suspicion. Your job is to discover the underlying truths a recruiter would want to know about how Ashley works — each truth is a single positive professional trait the corpus demonstrates.

A truth is the answer the brief reveals at the end of an investigation. The game wraps each truth in a surface accusation that creates reasonable doubt — the player investigates the accusation, and the brief reveals the truth (the same truth) regardless of which way they ultimately rule. Both verdicts are recruiter-safe because the truth is positive.

Surface a truth only if:
- It describes a hireable working-style trait grounded in 5+ specific cards across 3+ categories.
- It is sharper than the surface ("Ashley weaponizes AI" — not "Ashley uses AI a lot"). The sharpness is what makes the brief memorable.
- A reasonable observer could doubt it from limited evidence — that doubt becomes the surface claim Pass 2 generates.
- The doubt framing must NOT indict competence, integrity, ethics, or basic professionalism. "Ashley uses AI too much" is a fair reasonable-doubt framing of "weaponizes AI"; "Ashley takes credit for the team's work" is not — moral indictments stay forbidden no matter how the brief resolves them.

Never surface a truth that frames Ashley as a dilettante, opportunist, or anything a hiring manager would walk away from. The brief is a public artifact — the underlying truth IS what the recruiter takes home.`;

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

TASK:
Discover 8-15 distinct hireable truths in this corpus.

For each truth:
1. truth — one sentence. The positive professional trait the brief reveals. Sharper than the surface read of any single card.
2. reasonable_doubt — one sentence. How a reasonable observer could doubt the truth from limited evidence. Pass 2 turns this into the surface accusation. Stays in working-style territory; never indicts competence or integrity.
3. categories — the card categories whose evidence most strongly supports the truth (3+ required).

Truth shape examples:
- "Ashley weaponizes AI." (Doubt: "Ashley uses AI too much.")
- "Ashley builds constraints before features." (Doubt: "Ashley over-engineers everything.")
- "Ashley ships rough drafts to learn faster." (Doubt: "Ashley doesn't polish before shipping.")
- "Ashley turns failure modes into design tools." (Doubt: "Ashley breaks things to look clever.")

Do NOT surface a truth as:
- Generic ("Ashley is ambitious", "Ashley is curious") — must be a working-style observation, not a personality adjective.
- Single-card or single-category — the truth has to live across the corpus.
- A moral or ethical claim — even when reframed positively, the surface claim risks reading as a character indictment.

Use the notes field for meta-observations about the corpus that did not rise to a full truth (e.g. "the THD employer tag dominates Decisions; cross-check truths there for context bleed").`;
}

export async function runPass1(cards: CardRow[]): Promise<TruthMap> {
  const client = clientFor(config.models.pass1);
  console.log(`[pass1] model=${client.model} cards=${cards.length}`);

  const raw = await client.complete(buildPrompt(cards), {
    system: SYSTEM_PROMPT,
    // Sonnet 4.6 caps synchronous output at 64k — 32k leaves a wide margin
    // for the adaptive-thinking block + the truths JSON on ~250 cards.
    maxTokens: 32000,
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
