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
import type {
  CardClaimScore,
  CardRow,
  GeneratedClaim,
  Pass3Result,
} from './types';
import { CATEGORY_TO_ROOM, GAMEPLAY_ROOMS } from './types';

const SYSTEM_PROMPT = `You score how each card in a corpus plays against a single claim.

Two axes:
- AMBIGUITY (1-5): how torn a player would be classifying this card as proof or objection from title+blurb alone. 5 = both readings are equally defensible. 1 = obvious.
- SURPRISE (1-5): how likely your evaluation (which sees the full "fact") will disagree with the player's gut read of just title+blurb. 5 = the player's gut is almost certainly wrong. 1 = the fact confirms the surface read.

Score every card. Never skip cards.`;

const SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
          ambiguity: { type: 'integer' },
          surprise: { type: 'integer' },
        },
        required: ['card_id', 'ambiguity', 'surprise'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
} as const;

function buildPrompt(claim: GeneratedClaim, cards: CardRow[]): string {
  return `CLAIM: "${claim.claim_text}"
RATIONALE: ${claim.rationale}

CORPUS (${cards.length} cards):
${formatCardCorpus(cards)}

Score every card against the claim.`;
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
    floorCards.reduce((sum, s) => sum + s.ambiguity + s.surprise, 0) /
    floorCards.length;

  return rooms.size * rooms.size * floorCards.length * avgScore;
}

export async function runPass3(
  cards: CardRow[],
  claims: GeneratedClaim[],
): Promise<Pass3Result> {
  const client = clientFor(config.models.pass3);
  const batches = Math.ceil(cards.length / config.thresholds.scoreBatch);
  console.log(
    `[pass3] model=${client.model} claims=${claims.length} cards=${cards.length} batches=${batches} floor=${config.thresholds.cardFloor} topCards=${config.targets.topCards}`,
  );

  const scored = new Map<string, CardClaimScore[]>();
  const qualities = new Map<string, number>();
  const batchSize = config.thresholds.scoreBatch;

  for (const claim of claims) {
    // Score in batches to keep output tokens bounded per call.
    const allScores: CardClaimScore[] = [];
    for (let offset = 0; offset < cards.length; offset += batchSize) {
      const batch = cards.slice(offset, offset + batchSize);
      const raw = await client.complete(buildPrompt(claim, batch), {
        system: SYSTEM_PROMPT,
        maxTokens: 4000,
        schema: SCHEMA,
      });
      const { scores } = JSON.parse(raw) as { scores: CardClaimScore[] };
      allScores.push(...scores);
    }

    // Build a claim-specific pool: drop below-floor cards, sort by combined
    // score descending, keep the top N. Pools are distinct across claims
    // because the same card scores differently against different accusations.
    const pool = allScores
      .filter((s) => s.ambiguity + s.surprise >= config.thresholds.cardFloor)
      .sort((a, b) => (b.ambiguity + b.surprise) - (a.ambiguity + a.surprise))
      .slice(0, config.targets.topCards);

    const quality = claimQuality(pool, cards);
    scored.set(claim.claim_text, pool);
    qualities.set(claim.claim_text, quality);

    const cardById = new Map(cards.map((c) => [c.objectID, c]));
    const rooms = new Set(
      pool
        .map((s) => CATEGORY_TO_ROOM[cardById.get(s.card_id)?.category ?? ''])
        .filter(Boolean),
    );

    console.log(
      `[pass3] "${claim.claim_text}": ${allScores.length} scored → ${pool.length} in pool (${rooms.size}/${GAMEPLAY_ROOMS.length} rooms, quality=${quality.toFixed(0)})`,
    );
  }

  // Rank all claims by quality and select the top N for Pass 4.
  const ranked = [...claims].sort(
    (a, b) => (qualities.get(b.claim_text) ?? 0) - (qualities.get(a.claim_text) ?? 0),
  );
  const selected = ranked.slice(0, config.targets.select);

  console.log(
    `[pass3] selected top ${selected.length} of ${claims.length} for validation:`,
  );
  for (const c of selected) {
    console.log(
      `  • (quality=${(qualities.get(c.claim_text) ?? 0).toFixed(0)}) "${c.claim_text}"`,
    );
  }

  return { scored, selected };
}
