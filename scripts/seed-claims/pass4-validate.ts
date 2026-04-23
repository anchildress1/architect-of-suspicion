/** Pass 4: Claim Validation.
 *
 *  Input:  claims (Pass 2) + scored pairs (Pass 3) + the cards that survived
 *          threshold filtering.
 *  Output: validated claims with final card pools. Claims that fail coverage
 *          are cut.
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
} from './types';
import { GAMEPLAY_ROOMS, type RoomSlug } from './types';

const SYSTEM_PROMPT = `You pressure-test claims by arguing BOTH sides of every card.

For each card, you write a one-sentence "proof" justification and a one-sentence "objection" justification. Then you flag cards where one side is visibly weaker — that's false ambiguity: the Pass 3 scorer said it was torn, but when you actually argue both sides one collapses.`;

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
        },
        required: ['card_id', 'proof', 'objection', 'false_ambiguity'],
        additionalProperties: false,
      },
    },
  },
  required: ['arguments'],
  additionalProperties: false,
} as const;

// Mirrors the isPlayable rooms in src/lib/rooms.ts. Categories not listed
// here (Architecture, Principle, Process) have no playable room and don't
// contribute to coverage counts.
const CATEGORY_TO_ROOM: Record<string, RoomSlug> = {
  Awards: 'gallery',
  Constraints: 'control-room',
  Decisions: 'parlor',
  Philosophy: 'library',
  Experimentation: 'workshop',
  'Work Style': 'cellar',
  Experience: 'back-hall',
};

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
}

export async function runPass4(
  claims: GeneratedClaim[],
  scoredByClaim: Map<string, CardClaimScore[]>,
  cards: CardRow[],
): Promise<ClaimValidation[]> {
  const client = clientFor(config.models.pass4);
  console.log(`[pass4] model=${client.model} validating ${claims.length} claims`);

  const cardById = new Map(cards.map((c) => [c.objectID, c]));
  const results: ClaimValidation[] = [];

  for (const claim of claims) {
    const scores = scoredByClaim.get(claim.claim_text) ?? [];
    const claimCards = scores
      .map((s) => cardById.get(s.card_id))
      .filter((c): c is CardRow => !!c);

    const raw = await client.complete(buildPrompt(claim, claimCards, scores), {
      system: SYSTEM_PROMPT,
      maxTokens: 10000,
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

    const coveredRooms = roomsCovered(survivingCards);
    const passedCoverage = coveredRooms >= GAMEPLAY_ROOMS.length;
    const passedTotal = survivingCards.length >= config.targets.minTotalCards;
    const survived = passedCoverage && passedTotal;

    results.push({
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
      `[pass4] "${claim.claim_text}": ${survived ? 'SURVIVED' : 'CUT'} (${survivingCards.length} cards, ${coveredRooms} rooms)`,
    );
  }

  return results;
}

function roomsCovered(cards: CardRow[]): number {
  const rooms = new Set<RoomSlug>();
  for (const card of cards) {
    const room = roomFor(card);
    if (room) rooms.add(room);
  }
  return rooms.size;
}
