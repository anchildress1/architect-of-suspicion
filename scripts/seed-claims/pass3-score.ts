/** Pass 3: Card Scoring + Claim Ranking.
 *
 *  Input:  claims from Pass 2 + full card corpus.
 *  Output: top-N claims ranked by card-pool quality, with their floor-cleared
 *          card scores — ready for Pass 4 gameplay validation.
 *
 *  Model:  gpt-5.4-mini — cheap/fast, one call per claim.
 *
 *  Quality metric per claim: rooms² × cardCount × avgScore
 *  The quadratic room factor heavily rewards cross-category coverage, since
 *  Pass 4 requires all 7 gameplay rooms to have at least one eligible card.
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
  console.log(
    `[pass3] model=${client.model} claims=${claims.length} cards=${cards.length} floor=${config.thresholds.cardFloor}`,
  );

  const scored = new Map<string, CardClaimScore[]>();
  const qualities = new Map<string, number>();

  for (const claim of claims) {
    const raw = await client.complete(buildPrompt(claim, cards), {
      system: SYSTEM_PROMPT,
      maxTokens: 16000,
      schema: SCHEMA,
    });

    const { scores: allScores } = JSON.parse(raw) as { scores: CardClaimScore[] };

    // Keep cards that clear the combined ambiguity+surprise floor.
    const floorCleared = allScores.filter(
      (s) => s.ambiguity + s.surprise >= config.thresholds.cardFloor,
    );

    const quality = claimQuality(floorCleared, cards);
    scored.set(claim.claim_text, floorCleared);
    qualities.set(claim.claim_text, quality);

    // Count room coverage for the log
    const cardById = new Map(cards.map((c) => [c.objectID, c]));
    const rooms = new Set(
      floorCleared
        .map((s) => CATEGORY_TO_ROOM[cardById.get(s.card_id)?.category ?? ''])
        .filter(Boolean),
    );

    console.log(
      `[pass3] "${claim.claim_text}": ${allScores.length} scored → ${floorCleared.length} cleared floor (${rooms.size}/${GAMEPLAY_ROOMS.length} rooms, quality=${quality.toFixed(0)})`,
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
