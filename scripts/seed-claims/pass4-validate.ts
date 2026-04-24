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

const SYSTEM_PROMPT = `Write the player-facing version of each card — a blurb that pulls a player in two directions against a specific claim without tipping them toward the answer.

Raw materials per card: title, blurb, fact, created_at. Use all four. Do not fabricate anything absent from these fields. Always write in third person — use "Ashley" by name, never pronouns as a substitute.

Temporal reasoning rules:
- DIFFERENT time periods + apparent contradiction → may show evolution, not hypocrisy. Weaken the claim in your objection.
- SAME period + contradiction, or a pattern consistent across ALL years → real weight. Strengthen the claim in your proof.
- Surface timing in the rewritten_blurb when it adds tension (e.g., "early in Ashley's career" or "more recently") without signaling which reading it supports.

Output per card (all three fields required):
1. proof — one sentence: how the fact and timing support the claim
2. objection — one sentence: how the fact and timing contradict or complicate the claim
3. rewritten_blurb — synthesize title, blurb, fact, and temporal context into player-facing text that creates genuine tension against this specific claim. Match original blurb length and register. The tension must be claim-specific, not generic.`;

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

function buildPrompt(claim: GeneratedClaim, cards: CardRow[], scores: CardClaimScore[]): string {
  const scoreById = new Map(scores.map((s) => [s.card_id, s]));
  const eligible = cards.filter((c) => scoreById.has(c.objectID));

  const cardBlock = eligible
    .map((c) => {
      const s = scoreById.get(c.objectID)!;
      const date = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : 'unknown';
      return `- id=${c.objectID} [${c.category}] "${c.title}" (created=${date}, ambig=${s.ambiguity}, surprise=${s.surprise})\n    blurb: ${c.blurb}\n    fact: ${c.fact ?? '(none)'}`;
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
    const scores = scoredByClaim.get(claim.id);
    if (!scores) {
      throw new Error(
        `[pass4] No scores found for claim "${claim.claim_text}" (claim_id=${claim.id}) — this is a pipeline bug`,
      );
    }
    const claimCards = scores.map((s) => cardById.get(s.card_id)).filter((c): c is CardRow => !!c);

    const raw = await client.complete(buildPrompt(claim, claimCards, scores), {
      system: SYSTEM_PROMPT,
      maxTokens: 16000,
      schema: SCHEMA,
      reasoning: 'low',
    });

    let parsed: { arguments: CardArgument[] };
    try {
      parsed = JSON.parse(raw) as { arguments: CardArgument[] };
    } catch (err) {
      throw new Error(
        `[pass4] JSON.parse failed for "${claim.claim_text}" (claim_id=${claim.id}).\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
        { cause: err },
      );
    }

    // Build rewrite map. Throw if the model omitted any card — a missing rewrite
    // means the player-facing pool is smaller than expected, distorting survival checks.
    const claimRewrites = new Map(parsed.arguments.map((a) => [a.card_id, a.rewritten_blurb]));
    const missingRewrites = claimCards.filter((c) => !claimRewrites.has(c.objectID));
    if (missingRewrites.length > 0) {
      const missingIds = missingRewrites.map((c) => c.objectID).join(', ');
      throw new Error(
        `[pass4] "${claim.claim_text}" (claim_id=${claim.id}): model omitted ${missingRewrites.length} card(s) from output. Missing card IDs: ${missingIds}. Increase maxTokens or reduce pool size.`,
      );
    }
    rewrites.set(claim.id, claimRewrites);

    // Survival check: minimum playable pool — cards that got a rewrite and cover
    // enough rooms. This is a floor, not a quality bar; pass3 ranking does quality.
    const rewrittenCards = claimCards.filter((c) => claimRewrites.has(c.objectID));
    const coveredRooms = roomsCovered(rewrittenCards);
    const passedCoverage = coveredRooms >= config.targets.minRooms;
    const passedTotal = rewrittenCards.length >= config.targets.minTotalCards;
    const survived = passedCoverage && passedTotal;

    validations.push({
      claim_id: claim.id,
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
