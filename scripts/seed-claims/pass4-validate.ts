/** Pass 4: Claim Validation + Card Rewrite.
 *
 *  Input:  claims (Pass 2) + scored pairs (Pass 3) + the eligible card pools.
 *  Output: validated claims with final card pools, AND claim-specific blurb
 *          rewrites for every surviving card. Both happen in a single call per
 *          claim — no extra round-trip.
 *
 *  Model:  gemini-3.1-flash-lite-preview — different vendor than Pass 2 (Anthropic).
 */

import { clientFor } from './clients';
import { config } from './config';
import type {
  CardClaimScore,
  CardRow,
  ClaimValidation,
  GeneratedClaim,
  Pass4Output,
} from './types';
import { CATEGORY_TO_ROOM, type RoomSlug } from './types';

const SYSTEM_PROMPT = `You rewrite each card's blurb so players cannot tell from title+blurb alone whether the card supports or contradicts the active claim.

The fact field is the only constraint — it cannot change and nothing may be fabricated from it. The blurb is malleable.

For each card:
1. proof — one sentence: how the card's fact supports the claim
2. objection — one sentence: how the card's fact contradicts or complicates the claim
3. rewritten_blurb — rewrite the blurb so a player reading title+blurb is genuinely uncertain which way it goes. Use omission, framing, or true-but-misleading emphasis grounded only in the fact. Tension must be specific to this claim, not generic. Match original blurb length.

Rewrite every card. A fact that currently leans one way can still be framed to create doubt — that is the job.`;

const SCHEMA = {
  type: 'object',
  properties: {
    arguments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
          proof: { type: 'string' },
          objection: { type: 'string' },
          rewritten_blurb: { type: 'string' },
        },
        required: ['card_id', 'proof', 'objection', 'rewritten_blurb'],
        additionalProperties: false,
      },
    },
  },
  required: ['arguments'],
  additionalProperties: false,
} as const;

function roomFor(card: CardRow): RoomSlug | null {
  return CATEGORY_TO_ROOM[card.category] ?? null;
}

function buildPrompt(
  claim: GeneratedClaim,
  cards: CardRow[],
  scores: CardClaimScore[],
): string {
  const scoreById = new Map(scores.map((s) => [s.card_id, s]));
  const eligible = cards.filter((c) => scoreById.has(c.objectID));

  const cardBlock = eligible
    .map((c) => {
      const s = scoreById.get(c.objectID)!;
      return `- id=${c.objectID} [${c.category}] "${c.title}" (ambig=${s.ambiguity}, surprise=${s.surprise})\n    blurb: ${c.blurb}\n    fact: ${c.fact ?? '(none)'}`;
    })
    .join('\n');

  return `CLAIM: "${claim.claim_text}"

ELIGIBLE CARDS (${eligible.length}):
${cardBlock}

For each card: write proof and objection from the fact, then rewrite the blurb to make the player uncertain which way it goes.`;
}

interface CardArgument {
  card_id: string;
  proof: string;
  objection: string;
  rewritten_blurb: string;
}

export async function runPass4(
  claims: GeneratedClaim[],
  scoredByClaim: Map<string, CardClaimScore[]>,
  cards: CardRow[],
): Promise<Pass4Output> {
  const client = clientFor(config.models.pass4);
  console.log(`[pass4] model=${client.model} validating ${claims.length} claims`);

  const cardById = new Map(cards.map((c) => [c.objectID, c]));
  const validations: ClaimValidation[] = [];
  const rewrites: Map<string, Map<string, string>> = new Map();

  for (const claim of claims) {
    const scores = scoredByClaim.get(claim.claim_text) ?? [];
    const claimCards = scores
      .map((s) => cardById.get(s.card_id))
      .filter((c): c is CardRow => !!c);

    const raw = await client.complete(buildPrompt(claim, claimCards, scores), {
      system: SYSTEM_PROMPT,
      maxTokens: 16000,
      schema: SCHEMA,
    });

    const { arguments: args } = JSON.parse(raw) as { arguments: CardArgument[] };

    // Build rewrite map. Warn if the model omitted any card — pipeline will throw
    // at persist time rather than silently writing an empty blurb.
    const claimRewrites = new Map(args.map((a) => [a.card_id, a.rewritten_blurb]));
    const missingRewrites = claimCards.filter((c) => !claimRewrites.has(c.objectID));
    if (missingRewrites.length > 0) {
      console.warn(
        `[pass4] "${claim.claim_text}": model omitted ${missingRewrites.length} card(s) from output`,
      );
    }
    rewrites.set(claim.claim_text, claimRewrites);

    // Survival check: minimum playable pool — cards that got a rewrite and cover
    // enough rooms. This is a floor, not a quality bar; pass3 ranking does quality.
    const rewrittenCards = claimCards.filter((c) => claimRewrites.has(c.objectID));
    const coveredRooms = roomsCovered(rewrittenCards);
    const passedCoverage = coveredRooms >= config.targets.minRooms;
    const passedTotal = rewrittenCards.length >= config.targets.minTotalCards;
    const survived = passedCoverage && passedTotal;

    validations.push({
      claim_text: claim.claim_text,
      room_coverage: coveredRooms,
      total_eligible_cards: rewrittenCards.length,
      survived,
      cut_reason: survived
        ? undefined
        : !passedCoverage
          ? `only ${coveredRooms}/${config.targets.minRooms} rooms covered`
          : `only ${rewrittenCards.length} rewritten cards (need ≥${config.targets.minTotalCards})`,
      eligible_card_ids: rewrittenCards.map((c) => c.objectID),
    });

    console.log(
      `[pass4] "${claim.claim_text}": ${survived ? 'SURVIVED' : 'CUT'} (${rewrittenCards.length} cards, ${coveredRooms} rooms)`,
    );
  }

  return { validations, rewrites };
}

function roomsCovered(cards: CardRow[]): number {
  const rooms = new Set<RoomSlug>();
  for (const card of cards) {
    const room = roomFor(card);
    if (room) rooms.add(room);
  }
  return rooms.size;
}
