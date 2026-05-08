/** Pass 3: Card Scoring + Claim Ranking.
 *
 *  Input:  claims from Pass 2 + full card corpus.
 *  Output: top-N claims ranked by card-pool quality, with their claim-specific
 *          card pools — ready for Pass 4 gameplay validation.
 *
 *  Model:  gemini-3-flash-preview — bulk structured scoring at ~5x lower
 *          cost than gpt-5.4 for the same task. Flash respects the
 *          enum-constrained card_id schema reliably; the post-parse
 *          asserts in assertBatchScores remain the correctness backstop.
 *          Prompt structure was originally tuned for OpenAI's CTCO layout
 *          but Flash also responds well to it.
 *
 *  Card selection per claim:
 *    1. Score all cards (in batches to stay within token limits)
 *    2. Drop cards below cardFloor (ambiguity+surprise minimum)
 *    3. Sort remainder by score descending, keep top topCards (default
 *       10000 = effectively uncapped, so paramount selection in Pass 4
 *       has the full pool to choose from)
 *  Each claim still gets its own pool because the same card scores
 *  differently against different claims.
 *
 *  Claim ranking metric: rooms² × cardCount × avgScore
 *  Quadratic room factor rewards claims whose top-N pool already spans
 *  all 7 gameplay rooms — exactly what Pass 4 requires.
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardClaimScore, CardRow, GeneratedClaim, Pass3Result } from './types';
import { CATEGORY_TO_ROOM, GAMEPLAY_ROOMS } from './types';

// Per GPT-5.2 prompting guide: CTCO layout, tight output spec. Keep the
// system prompt compact — GPT-5.x follows explicit rules more reliably
// than long rationales.
const SYSTEM_PROMPT = `<context>
You are scoring Ashley's career facts against a single accusation-style claim
about Ashley. Scores feed a ranking pipeline that selects which
claims go to final validation; scoring integrity is load-bearing.
</context>

<task>
For each card in the input batch, emit an integer score (1-5) on two axes:
1. AMBIGUITY — how torn a player would be classifying the card as proof or objection from title+blurb alone.
   5 = both readings equally defensible. 3 = leans one way but arguable. 1 = obvious classification.
2. SURPRISE — how likely the hidden "fact" contradicts the player's gut read of title+blurb.
   5 = gut read is almost certainly wrong. 3 = fact adds nuance. 1 = fact confirms surface read.
</task>

<constraints>
Use tags, projects, and fact to calibrate AMBIGUITY and SURPRISE. Do NOT emit work/play or deadline as separate outputs.

Work vs play:
- "THD" or other employer/client tags → WORK inside a corporate layer: narrower latitude, reviewers, compliance.
- Projects tagged "CheckMark", "System Notes", "Legacy Smelter", "Carbon Trace", "Underfoot Travel" → PLAY: personal projects outside corporate constraints, Ashley sets the rules.
- Surface read says one, tags/fact reveal the other → raise SURPRISE. Genuinely unclear from the surface → raise AMBIGUITY.

Deadline + stack familiarity:
- "DEV Challenge" tag (any variant like "DEV Challenge > WeCoded 2026") → STRICT external deadline. Stack is usually announced AT the start; assume Ashley did NOT know the stack going in unless the fact says otherwise.
- Hackathons, Advent calendars, contests, jam submissions → strict deadline.
- "THD" / employer-work tags → corporate cadence deadlines (sprint, release, SLA), negotiable within the layer, usually familiar stack.
- Personal projects with no challenge marker → no external deadline; self-paced; stack chosen ahead.
- Unfamiliar-stack + hard-deadline combination raises tension against almost every claim about speed, quality, scope, reliability, or novelty — surface it.

Rule: when the player cannot infer work/play, deadline, or stack-familiarity from title+blurb alone but it materially changes the reading, raise BOTH AMBIGUITY and SURPRISE. When hidden context confirms the surface read, keep both low.

Irrelevant card → ambiguity=1, surprise=1.
Card has no fact → score surprise only on whether title+blurb alone is deceptive about work/play or timing.

Do NOT:
- Invent, substitute, approximate, or reformat card_id values. Use the EXACT UUIDs from the CORPUS block.
- Skip, duplicate, or reorder cards. Return exactly one score object per card in the batch.
- Emit commentary, reasoning, confidence scores, or any fields beyond {card_id, ambiguity, surprise}.
- Round 0 or 6 into range — values outside 1..5 are invalid, not clamp targets.
</constraints>

<output>
Strict JSON matching the provided schema. One object per card. No prose.
</output>`;

/** Build a batch-specific schema that constrains `card_id` to the exact UUID
 *  set in the batch via JSON Schema `enum`. Drops `minItems`/`maxItems` and
 *  `additionalProperties: false` to stay inside Gemini's `responseJsonSchema`
 *  validator (Pass 3 now runs on gemini-3-flash-preview; the prior gpt-5.4
 *  configuration accepted those keywords under strict mode). Post-parse
 *  asserts in assertBatchScores below enforce batch-size and required-field
 *  presence in JS, so correctness is preserved without provider-side
 *  enforcement. */
function schemaForBatch(batchIds: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            card_id: { type: 'string', enum: batchIds },
            ambiguity: { type: 'integer', minimum: 1, maximum: 5 },
            surprise: { type: 'integer', minimum: 1, maximum: 5 },
          },
          required: ['card_id', 'ambiguity', 'surprise'],
        },
      },
    },
    required: ['scores'],
  };
}

function buildPrompt(claim: GeneratedClaim, cards: CardRow[]): string {
  return `<claim>${claim.claim_text}</claim>
<rationale>${claim.rationale}</rationale>

<corpus count="${cards.length}">
${formatCardCorpus(cards)}
</corpus>

<instruction>
Score every card against the claim. Return exactly ${cards.length} score objects, one per card, in any order. Every card_id must come EXACTLY from the corpus block above — do not invent, substitute, or mistype.
</instruction>`;
}

/** Clean up provider-side schema slop. Returns the cleaned scores plus any
 *  card IDs from `batch` that didn't show up in `scores`. The caller decides
 *  whether to retry or accept the partial result. */
function cleanBatchScores(
  claim: GeneratedClaim,
  batch: CardRow[],
  scores: CardClaimScore[],
): {
  cleaned: CardClaimScore[];
  missingIds: string[];
  droppedOutOfBatch: number;
  droppedDuplicates: number;
} {
  const allowedIds = new Set(batch.map((c) => c.objectID));
  const cleaned: CardClaimScore[] = [];
  const seen = new Set<string>();
  let droppedOutOfBatch = 0;
  let droppedDuplicates = 0;

  for (const score of scores) {
    if (!allowedIds.has(score.card_id)) {
      droppedOutOfBatch += 1;
      continue;
    }
    if (seen.has(score.card_id)) {
      droppedDuplicates += 1;
      continue;
    }
    if (!Number.isInteger(score.ambiguity) || score.ambiguity < 1 || score.ambiguity > 5) {
      throw new Error(
        `[pass3] invalid ambiguity=${score.ambiguity} for card_id=${score.card_id} (claim_id=${claim.id}). Expected integer 1..5.`,
      );
    }
    if (!Number.isInteger(score.surprise) || score.surprise < 1 || score.surprise > 5) {
      throw new Error(
        `[pass3] invalid surprise=${score.surprise} for card_id=${score.card_id} (claim_id=${claim.id}). Expected integer 1..5.`,
      );
    }
    seen.add(score.card_id);
    cleaned.push(score);
  }

  const missingIds = batch.filter((c) => !seen.has(c.objectID)).map((c) => c.objectID);
  return { cleaned, missingIds, droppedOutOfBatch, droppedDuplicates };
}

/** Compute a quality score for a claim given its floor-cleared cards.
 *  rooms² × cardCount × avgScore — quadratic room factor prioritises
 *  claims that naturally span the most gameplay rooms. */
function claimQuality(floorCards: CardClaimScore[], allCards: CardRow[]): number {
  if (floorCards.length === 0) return 0;

  const cardById = new Map(allCards.map((c) => [c.objectID, c]));
  const rooms = new Set<string>();
  for (const s of floorCards) {
    const card = cardById.get(s.card_id);
    const room = card ? CATEGORY_TO_ROOM[card.category] : undefined;
    if (room) rooms.add(room);
  }

  const avgScore =
    floorCards.reduce((sum, s) => sum + s.ambiguity + s.surprise, 0) / floorCards.length;

  return rooms.size * rooms.size * floorCards.length * avgScore;
}

/** One scoring call against `batch`. Parses, cleans for provider slop,
 *  returns whatever survived plus a list of card IDs the model didn't
 *  return. Caller decides whether to retry the missing or accept partial. */
async function scoreOnce(
  client: ReturnType<typeof clientFor>,
  claim: GeneratedClaim,
  batch: CardRow[],
  offset: number,
): Promise<{ cleaned: CardClaimScore[]; missingIds: string[] }> {
  if (batch.length === 0) return { cleaned: [], missingIds: [] };
  const raw = await client.complete(buildPrompt(claim, batch), {
    system: SYSTEM_PROMPT,
    // 16k accommodates Flash's default thinking budget on top of the
    // ~2.5k JSON output for 50 score objects.
    maxTokens: 16000,
    schema: schemaForBatch(batch.map((c) => c.objectID)),
    reasoning: 'low',
    verbosity: 'low',
  });
  let batchResult: { scores: CardClaimScore[] };
  try {
    batchResult = JSON.parse(raw) as { scores: CardClaimScore[] };
  } catch (err) {
    throw new Error(
      `[pass3] JSON.parse failed for "${claim.claim_text}" (claim_id=${claim.id}) batch offset=${offset}.\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
      { cause: err },
    );
  }
  const { cleaned, missingIds, droppedOutOfBatch, droppedDuplicates } = cleanBatchScores(
    claim,
    batch,
    batchResult.scores,
  );
  if (droppedOutOfBatch > 0 || droppedDuplicates > 0) {
    console.warn(
      `[pass3] cleaned ${droppedOutOfBatch} out-of-batch + ${droppedDuplicates} duplicate score(s) for "${claim.claim_text}" (offset=${offset}); kept ${cleaned.length}`,
    );
  }
  return { cleaned, missingIds };
}

export async function runPass3(cards: CardRow[], claims: GeneratedClaim[]): Promise<Pass3Result> {
  const client = clientFor(config.models.pass3);
  const batches = Math.ceil(cards.length / config.thresholds.scoreBatch);
  console.log(
    `[pass3] model=${client.model} claims=${claims.length} cards=${cards.length} batches=${batches} floor=${config.thresholds.cardFloor} topCards=${config.targets.topCards}`,
  );

  const scored = new Map<string, CardClaimScore[]>();
  const qualities = new Map<string, number>();
  const batchSize = config.thresholds.scoreBatch;
  const cardById = new Map(cards.map((c) => [c.objectID, c]));

  for (const claim of claims) {
    // Score in batches to keep output tokens bounded per call.
    const allScores: CardClaimScore[] = [];
    for (let offset = 0; offset < cards.length; offset += batchSize) {
      const batch = cards.slice(offset, offset + batchSize);
      const primary = await scoreOnce(client, claim, batch, offset);
      allScores.push(...primary.cleaned);

      // Flash occasionally drops cards mid-batch even with the schema's
      // enum constraint. Retry once with just the missing IDs — a small
      // batch size makes truncation/skipping much less likely. Cards still
      // missing after the retry are skipped with a prominent warning so
      // one model hiccup doesn't tank the whole seed run.
      if (primary.missingIds.length > 0) {
        const missingCards = batch.filter((c) => primary.missingIds.includes(c.objectID));
        console.warn(
          `[pass3] retrying ${missingCards.length} missing card(s) for "${claim.claim_text}" (offset=${offset}): ${primary.missingIds.join(', ')}`,
        );
        const retry = await scoreOnce(client, claim, missingCards, offset);
        allScores.push(...retry.cleaned);
        if (retry.missingIds.length > 0) {
          console.warn(
            `[pass3] SKIPPED ${retry.missingIds.length} card(s) after retry for "${claim.claim_text}": ${retry.missingIds.join(', ')}`,
          );
        }
      }
    }

    // Verify all returned card IDs are in the corpus — hallucinated IDs distort
    // room coverage and quality metrics.
    const unknownIds = allScores.filter((s) => !cardById.has(s.card_id)).map((s) => s.card_id);
    if (unknownIds.length > 0) {
      throw new Error(
        `[pass3] model returned scores for unknown card IDs: ${unknownIds.join(', ')} (claim_id=${claim.id}, claim="${claim.claim_text}")`,
      );
    }

    // Build a claim-specific pool: drop below-floor cards, sort by combined
    // score descending, keep the top N. Pools are distinct across claims
    // because the same card scores differently against different accusations.
    const pool = allScores
      .filter((s) => s.ambiguity + s.surprise >= config.thresholds.cardFloor)
      .sort((a, b) => b.ambiguity + b.surprise - (a.ambiguity + a.surprise))
      .slice(0, config.targets.topCards);

    const quality = claimQuality(pool, cards);
    scored.set(claim.id, pool);
    qualities.set(claim.id, quality);

    const rooms = new Set(
      pool.map((s) => CATEGORY_TO_ROOM[cardById.get(s.card_id)?.category ?? '']).filter(Boolean),
    );

    console.log(
      `[pass3] "${claim.claim_text}": ${allScores.length} scored → ${pool.length} in pool (${rooms.size}/${GAMEPLAY_ROOMS.length} rooms, quality=${quality.toFixed(0)})`,
    );
  }

  // Rank all claims by quality and select the top N for Pass 4.
  const ranked = [...claims].sort(
    (a, b) => (qualities.get(b.id) ?? 0) - (qualities.get(a.id) ?? 0),
  );
  const selected = ranked.slice(0, config.targets.select);

  console.log(`[pass3] selected top ${selected.length} of ${claims.length} for validation:`);
  for (const c of selected) {
    console.log(
      `  • (quality=${(qualities.get(c.id) ?? 0).toFixed(0)}) [${c.id}] "${c.claim_text}"`,
    );
  }

  return { scored, selected };
}
