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
  CardArgument,
  CardClaimScore,
  CardRow,
  ClaimValidation,
  GeneratedClaim,
  Pass4Output,
} from './types';
import { CATEGORY_TO_ROOM, type RoomSlug } from './types';

const SYSTEM_PROMPT = `Write the player-facing version of each card — a blurb that pulls a player in two directions against a specific claim without tipping them toward the answer — and assign the card a directional score against the claim.

Raw materials per card: title, blurb, fact, created_at. Use all four. Do not fabricate anything absent from these fields. Always write in third person — use "Ashley" by name, never pronouns as a substitute.

Temporal reasoning rules:
- DIFFERENT time periods + apparent contradiction → may show evolution, not hypocrisy. Weaken the claim in your objection.
- SAME period + contradiction, or a pattern consistent across ALL years → real weight. Strengthen the claim in your proof.
- Surface timing in the rewritten_blurb when it adds tension (e.g., "early in Ashley's career" or "more recently") without signaling which reading it supports.

Output per card (all five fields required):
1. proof — one sentence: how the fact and timing support the claim
2. objection — one sentence: how the fact and timing contradict or complicate the claim
3. rewritten_blurb — synthesize title, blurb, fact, and temporal context into player-facing text that creates genuine tension against this specific claim. Match original blurb length and register. The tension must be claim-specific, not generic.
4. ai_score — a number in [-1.0, 1.0] judging which way the FULL evidence (including the hidden fact) actually leans against the claim. Positive = the evidence supports the claim. Negative = the evidence undermines it. Magnitude = confidence: 0.1 = nearly neutral, 0.9 = decisive. Use the full range; do not bunch around 0.5. This score is hidden from the player and drives the Architect's reactions at runtime.
5. notes — server-only auditor note (1-3 sentences, plain prose, not seen by the player). State the tension levers this rewrite pulls, how work/play context and any deadline signal were handled, and anything a reviewer should sanity-check (e.g. "leans on hidden DEV challenge deadline — player won't know this was a 2-week constraint", or "work-vs-play ambiguity intentional; blurb reads as production but the fact is a hackathon build"). This is the QA trail for each rewrite.`;

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
          ai_score: { type: 'number', minimum: -1, maximum: 1 },
          notes: { type: 'string', minLength: 1 },
        },
        required: ['card_id', 'proof', 'objection', 'rewritten_blurb', 'ai_score', 'notes'],
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

interface RawCardArgument {
  card_id: string;
  proof: string;
  objection: string;
  rewritten_blurb: string;
  ai_score: number;
  notes: string;
}

function clampScore(value: number): number {
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
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
  const argumentsByClaim: Map<string, Map<string, CardArgument>> = new Map();

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

    let parsed: { arguments: RawCardArgument[] };
    try {
      parsed = JSON.parse(raw) as { arguments: RawCardArgument[] };
    } catch (err) {
      throw new Error(
        `[pass4] JSON.parse failed for "${claim.claim_text}" (claim_id=${claim.id}).\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
        { cause: err },
      );
    }

    const claimArguments = new Map<string, CardArgument>();
    for (const arg of parsed.arguments) {
      if (typeof arg.ai_score !== 'number' || Number.isNaN(arg.ai_score)) {
        throw new Error(
          `[pass4] missing or invalid ai_score for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
        );
      }
      if (typeof arg.notes !== 'string' || arg.notes.trim().length === 0) {
        throw new Error(
          `[pass4] missing or empty notes for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
        );
      }
      claimArguments.set(arg.card_id, {
        rewrittenBlurb: arg.rewritten_blurb,
        aiScore: clampScore(arg.ai_score),
        notes: arg.notes.trim(),
      });
    }

    // Throw if the model omitted any card — a missing entry means the player-facing
    // pool is smaller than expected, distorting survival checks.
    const missing = claimCards.filter((c) => !claimArguments.has(c.objectID));
    if (missing.length > 0) {
      const missingIds = missing.map((c) => c.objectID).join(', ');
      throw new Error(
        `[pass4] "${claim.claim_text}" (claim_id=${claim.id}): model omitted ${missing.length} card(s) from output. Missing card IDs: ${missingIds}. Increase maxTokens or reduce pool size.`,
      );
    }
    argumentsByClaim.set(claim.id, claimArguments);

    // Survival check: minimum playable pool — cards that got an argument and cover
    // enough rooms. This is a floor, not a quality bar; pass3 ranking does quality.
    const rewrittenCards = claimCards.filter((c) => claimArguments.has(c.objectID));
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

  return { validations, arguments: argumentsByClaim };
}

function roomsCovered(cards: CardRow[]): number {
  const rooms = new Set<RoomSlug>();
  for (const card of cards) {
    const room = roomFor(card);
    if (room) rooms.add(room);
  }
  return rooms.size;
}
