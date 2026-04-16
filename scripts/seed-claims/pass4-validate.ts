/** Pass 4: Claim Validation.
 *
 *  Input:  claims (Pass 2) + scored pairs (Pass 3) + the cards that survived
 *          threshold filtering.
 *  Output: validated claims with final card pools. Claims that fail coverage
 *          are cut.
 *
 *  Model:  adversarial — MUST be different vendor than Pass 2. Default is
 *          gpt-5-mini (cross-checks Gemini-generated claims).
 */

import { clientFor, extractJson } from './clients';
import { config } from './config';
import type {
  CardClaimScore,
  CardRow,
  ClaimValidation,
  GeneratedClaim,
} from './types';
import { GAMEPLAY_ROOMS, type RoomSlug } from './types';

const SYSTEM_PROMPT = `You pressure-test claims by arguing BOTH sides of every card.

For each card, you write a one-sentence "proof" justification and a one-sentence "objection" justification. Then you flag cards where one side is visibly weaker — that's false ambiguity: the Pass 3 scorer said it was torn, but when you actually argue both sides one collapses.

Return valid JSON only. No prose preamble.`;

const CATEGORY_TO_ROOM: Record<string, RoomSlug> = {
  Awards: 'gallery',
  Constraints: 'control-room',
  Decisions: 'parlor',
  Philosophy: 'library',
  Experimentation: 'workshop',
  'Work Style': 'cellar',
  Experience: 'back-hall',
  Role: 'mansion',
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

For each card, write both justifications, then flag false ambiguity. Output JSON:
{
  "arguments": [
    { "card_id": "<id>", "proof": "...", "objection": "...", "false_ambiguity": false }
  ]
}`;
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
      jsonMode: true,
    });

    const { arguments: args } = extractJson<{ arguments: CardArgument[] }>(raw);
    const falseAmbiguityIds = new Set(
      args.filter((a) => a.false_ambiguity).map((a) => a.card_id),
    );

    const survivingCards = claimCards.filter(
      (c) => !falseAmbiguityIds.has(c.objectID),
    );

    const roomCoverage = coverageByRoom(survivingCards);
    const passedCoverage = roomCoverage.roomsMeetingMin >= GAMEPLAY_ROOMS.length;
    const passedTotal = survivingCards.length >= config.targets.minTotalCards;
    const survived = passedCoverage && passedTotal;

    results.push({
      claim_text: claim.claim_text,
      room_coverage: roomCoverage.roomsMeetingMin,
      total_eligible_cards: survivingCards.length,
      survived,
      cut_reason: survived
        ? undefined
        : !passedCoverage
          ? `only ${roomCoverage.roomsMeetingMin}/${GAMEPLAY_ROOMS.length} rooms have ≥${config.targets.minCardsPerRoom} cards`
          : `only ${survivingCards.length} cards eligible (need ≥${config.targets.minTotalCards})`,
      eligible_card_ids: survivingCards.map((c) => c.objectID),
      false_ambiguity_card_ids: [...falseAmbiguityIds],
    });

    console.log(
      `[pass4] "${truncate(claim.claim_text, 50)}": ${survived ? 'SURVIVED' : 'CUT'} (${survivingCards.length} cards, ${roomCoverage.roomsMeetingMin} rooms, ${falseAmbiguityIds.size} false-ambig)`,
    );
  }

  return results;
}

function coverageByRoom(cards: CardRow[]): {
  roomsMeetingMin: number;
  perRoom: Map<RoomSlug, number>;
} {
  const perRoom = new Map<RoomSlug, number>();
  for (const card of cards) {
    const room = roomFor(card);
    if (room) perRoom.set(room, (perRoom.get(room) ?? 0) + 1);
  }
  let roomsMeetingMin = 0;
  for (const count of perRoom.values()) {
    if (count >= config.targets.minCardsPerRoom) roomsMeetingMin++;
  }
  return { roomsMeetingMin, perRoom };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
