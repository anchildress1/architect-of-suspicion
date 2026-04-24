/** Pass 3: Card Scoring + Claim Ranking.
 *
 *  Input:  claims from Pass 2 + full card corpus.
 *  Output: top-N claims ranked by card-pool quality, with their claim-specific
 *          card pools — ready for Pass 4 gameplay validation.
 *
 *  Model:  gpt-5.4-mini — cheap/fast, one call per claim per batch.
 *
 *  Card selection per claim:
 *    1. Score all cards (in batches to stay within token limits)
 *    2. Drop cards below cardFloor (ambiguity+surprise minimum)
 *    3. Sort remainder by score descending, keep top topCards
 *  This produces a claim-specific pool — the same card may rank in the
 *  top-50 for one claim and not another, so pools diverge naturally.
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

const SYSTEM_PROMPT = `Score every card. Return one score object per card — never skip, never duplicate, never invent card IDs.

Scoring axes (integer 1-5 each):
1. AMBIGUITY — how torn a player would be classifying this card as proof or objection from title+blurb alone.
   5 = both readings equally defensible. 3 = leans one way but arguable. 1 = obvious classification.
2. SURPRISE — how likely the hidden "fact" field contradicts the player's gut read of title+blurb.
   5 = gut read is almost certainly wrong. 3 = fact adds nuance. 1 = fact confirms surface read.

Context levers — use these to calibrate the above two scores. They are NOT separate outputs. Look at tags, projects, and fact to infer them:
- WORK vs PLAY.
    • "THD" tag (or other employer/client tags) → WORK inside a corporate layer with stricter guidance, reviewers, compliance, and negotiated latitude.
    • Projects like "CheckMark", "System Notes", "Legacy Smelter", "Carbon Trace", "Underfoot Travel" → PLAY projects designed to operate OUTSIDE corporate constraints. Ashley sets the rules.
    • Work implies narrower trade-off latitude; play implies wider latitude and self-imposed constraints.
    • If title+blurb reads as one but tags/projects/fact reveal the other, raise SURPRISE. If the nature is genuinely unclear from the surface, raise AMBIGUITY.
- DEADLINE + STACK FAMILIARITY.
    • "DEV Challenge" tag (any form, e.g. "DEV Challenge > Algolia Agent Studio", "DEV Challenge > WeCoded 2026") → STRICT deadline. Time-boxed community challenge. Stack is often announced AT the start, so assume Ashley did NOT know the stack going in unless the fact says otherwise.
    • Hackathons, Advent calendars, contests, jam submissions → strict deadline.
    • "THD" or other employer-work tags → corporate cadence deadlines (sprint, release, incident SLA) — deadline present but negotiable within the layer. Usually a familiar stack.
    • Personal projects without a challenge marker → no external deadline; pacing is self-imposed; stack is typically chosen in advance.
    • If the fact reveals the stack was unfamiliar AND a deadline existed, that combination massively raises tension against claims about speed, quality, scope discipline, reliability, or novelty — surface that.
  When the player would assume a different deadline posture than the tags/fact reveal, raise SURPRISE. Hidden deadlines (especially with unfamiliar stacks) almost always raise AMBIGUITY too, because they reframe every trade-off in the card.

Rule of thumb: when the player can't infer work/play, deadline, or stack-familiarity context from title+blurb alone, but it materially changes how the card reads against the claim, both AMBIGUITY and SURPRISE should move up. Evidence where the hidden context confirms the surface read stays low on both.

Edge cases:
- Card seems irrelevant to the claim → ambiguity=1, surprise=1
- Card has no fact → score surprise based on whether title+blurb alone is deceptive on work/play or timing`;

/** Build a batch-specific schema that constrains `card_id` to the exact UUID
 *  set in the batch via JSON Schema `enum`. OpenAI strict mode enforces this,
 *  so the model cannot hallucinate or mistype a UUID — GPT-5.4-mini was doing
 *  both on ~250-card runs with 50-card batches. */
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
          additionalProperties: false,
        },
        minItems: batchIds.length,
        maxItems: batchIds.length,
      },
    },
    required: ['scores'],
    additionalProperties: false,
  };
}

function buildPrompt(claim: GeneratedClaim, cards: CardRow[]): string {
  return `CLAIM: "${claim.claim_text}"
RATIONALE: ${claim.rationale}

CORPUS (${cards.length} cards):
${formatCardCorpus(cards)}

Score every card against the claim.`;
}

function assertBatchScores(
  claim: GeneratedClaim,
  batch: CardRow[],
  scores: CardClaimScore[],
  offset: number,
): void {
  if (scores.length !== batch.length) {
    const missingIds = batch
      .filter((c) => !scores.find((s) => s.card_id === c.objectID))
      .map((c) => c.objectID);
    throw new Error(
      `[pass3] model returned ${scores.length} scores for ${batch.length} cards (claim="${claim.claim_text}", claim_id=${claim.id}, batch offset=${offset}). Missing card IDs: ${missingIds.join(', ')}`,
    );
  }

  const allowedIds = new Set(batch.map((c) => c.objectID));
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const unexpectedIds: string[] = [];
  for (const score of scores) {
    if (!allowedIds.has(score.card_id)) {
      unexpectedIds.push(score.card_id);
    }
    if (seen.has(score.card_id)) {
      duplicateIds.push(score.card_id);
    }
    seen.add(score.card_id);
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
  }
  if (unexpectedIds.length > 0) {
    throw new Error(
      `[pass3] model returned out-of-batch card IDs: ${unexpectedIds.join(', ')} (claim_id=${claim.id}, batch offset=${offset})`,
    );
  }
  if (duplicateIds.length > 0) {
    throw new Error(
      `[pass3] model returned duplicate card IDs: ${duplicateIds.join(', ')} (claim_id=${claim.id}, batch offset=${offset})`,
    );
  }
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
      const raw = await client.complete(buildPrompt(claim, batch), {
        system: SYSTEM_PROMPT,
        maxTokens: 4000,
        schema: schemaForBatch(batch.map((c) => c.objectID)),
        reasoning: 'low',
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
      const { scores } = batchResult;
      assertBatchScores(claim, batch, scores, offset);
      allScores.push(...scores);
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
