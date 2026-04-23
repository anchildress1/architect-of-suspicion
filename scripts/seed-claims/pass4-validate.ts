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
import { CATEGORY_TO_ROOM, GAMEPLAY_ROOMS, type RoomSlug } from './types';

const SYSTEM_PROMPT = `You pressure-test claims by arguing BOTH sides of every card, then rewrite the blurb to maximise player uncertainty against this specific claim.

For each card:
1. proof — one sentence: how the card supports the claim
2. objection — one sentence: how the card contradicts the claim
3. false_ambiguity — true if one side clearly collapses when argued seriously (the card is not genuinely torn against THIS claim)
4. rewritten_blurb — only write this if false_ambiguity is false. Rewrite the blurb so a player reading it cannot tell whether it supports or contradicts the active claim. Ground it only in the fact field — no invented information. The tension must be specific to the claim, not generic. Use omission, framing, or a true-but-misleading emphasis to increase both ambiguity (torn read) and surprise (fact undermines the surface impression). Match the original blurb length. If false_ambiguity is true, set rewritten_blurb to an empty string.`;

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
          false_ambiguity: { type: 'boolean' },
          rewritten_blurb: { type: 'string' },
        },
        required: ['card_id', 'proof', 'objection', 'false_ambiguity', 'rewritten_blurb'],
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

For each card, write both justifications, then flag false ambiguity.`;
}

interface CardArgument {
  card_id: string;
  proof: string;
  objection: string;
  false_ambiguity: boolean;
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
    const falseAmbiguityIds = new Set(
      args.filter((a) => a.false_ambiguity).map((a) => a.card_id),
    );

    if (falseAmbiguityIds.size > 0) {
      console.log(`[pass4] "${claim.claim_text}": ${falseAmbiguityIds.size} false-ambig stripped`);
    }

    const survivingCards = claimCards.filter(
      (c) => !falseAmbiguityIds.has(c.objectID),
    );

    // Collect rewritten blurbs for surviving cards. Warn if the model dropped
    // any card from its output — the caller will fall back to the original blurb.
    const claimRewrites = new Map(
      args
        .filter((a) => !a.false_ambiguity)
        .map((a) => [a.card_id, a.rewritten_blurb]),
    );
    const missingRewrites = survivingCards.filter(
      (c) => !claimRewrites.has(c.objectID),
    );
    if (missingRewrites.length > 0) {
      console.warn(
        `[pass4] "${claim.claim_text}": model omitted rewrites for ${missingRewrites.length} card(s) — falling back to original blurb`,
      );
    }
    rewrites.set(claim.claim_text, claimRewrites);

    const coveredRooms = roomsCovered(survivingCards);
    const passedCoverage = coveredRooms >= GAMEPLAY_ROOMS.length;
    const passedTotal = survivingCards.length >= config.targets.minTotalCards;
    const survived = passedCoverage && passedTotal;

    validations.push({
      claim_text: claim.claim_text,
      room_coverage: coveredRooms,
      total_eligible_cards: survivingCards.length,
      survived,
      cut_reason: survived
        ? undefined
        : !passedCoverage
          ? `only ${coveredRooms}/${GAMEPLAY_ROOMS.length} rooms have eligible cards`
          : `only ${survivingCards.length} total cards (need ≥${config.targets.minTotalCards})`,
      eligible_card_ids: survivingCards.map((c) => c.objectID),
      false_ambiguity_card_ids: [...falseAmbiguityIds],
    });

    console.log(
      `[pass4] "${claim.claim_text}": ${survived ? 'SURVIVED' : 'CUT'} (${survivingCards.length} cards, ${coveredRooms} rooms, ${claimRewrites.size} rewrites)`,
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
