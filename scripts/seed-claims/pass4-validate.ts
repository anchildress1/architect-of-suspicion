/** Pass 4: Claim Validation + Card Rewrite.
 *
 *  Input:  claims (Pass 2) + scored pairs (Pass 3) + the eligible card pools.
 *  Output: validated claims with final card pools, AND claim-specific blurb
 *          rewrites for every surviving card.
 *
 *  Batched: each claim's card pool is split into chunks of `pass4Batch` cards
 *  (default 15) and sent in separate calls. A hiccup on one chunk retries
 *  just that chunk — not the whole claim. Output schema is trimmed to only
 *  the fields we persist (rewritten_blurb, ai_score, notes) — proof/objection
 *  were scratch-reasoning tokens the DB never stored. Each batch's schema
 *  pins `card_id` to an enum of that batch's UUIDs and uses minItems/maxItems
 *  equal to the batch length so the model physically cannot skip, duplicate,
 *  or invent an ID.
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

Raw materials per card: title, blurb, fact, created_at, tags, projects. Use all of them. Do not fabricate anything absent from these fields. Always write in third person — use "Ashley" by name, never pronouns as a substitute.

Tags and projects carry the work/play + deadline context:
- "DEV Challenge > …" tag → strict external deadline, stack often unfamiliar at start. Surface the pressure where it sharpens the claim.
- "THD" tag (or other employer/client names) → corporate-layer work; stricter guidance, negotiated trade-offs.
- Personal-brand projects ("CheckMark", "System Notes", "Legacy Smelter", "Carbon Trace", "Underfoot Travel") → play mode; Ashley sets the rules and self-imposes constraints.
- Lean on these signals when the surface blurb alone would mislead a player about the nature of the work.

Temporal reasoning rules:
- DIFFERENT time periods + apparent contradiction → may show evolution, not hypocrisy. Weaken the claim.
- SAME period + contradiction, or a pattern consistent across ALL years → real weight. Strengthen the claim.
- Surface timing in the rewritten_blurb when it adds tension (e.g., "early in Ashley's career" or "more recently") without signaling which reading it supports.

Output per card (all four fields required — no proof/objection scratch work, go straight to the final fields):
1. card_id — the exact id from the ELIGIBLE CARDS block. Copy it; never invent or modify.
2. rewritten_blurb — synthesize title, blurb, fact, and temporal context into player-facing text that creates genuine tension against this specific claim. Match original blurb length and register. The tension must be claim-specific, not generic.
3. ai_score — a number in [-1.0, 1.0] judging which way the FULL evidence (including the hidden fact) actually leans against the claim. Positive = supports. Negative = undermines. Magnitude = confidence: 0.1 = nearly neutral, 0.9 = decisive. Use the full range; do not bunch around 0.5. Hidden from the player.
4. notes — server-only auditor note (1-3 sentences). State the tension levers this rewrite pulls, how work/play + deadline context were handled, and anything a reviewer should sanity-check (e.g. "leans on hidden DEV challenge deadline — player won't see the 2-week constraint", or "work-vs-play ambiguity intentional; blurb reads as production but the fact is a hackathon build"). This is the QA trail.`;

/** Build a batch-specific schema that constrains `card_id` to the exact UUID
 *  set via JSON Schema `enum`, and pins array size to the batch length.
 *  Strict structured-output mode enforces both — the model cannot skip,
 *  duplicate, hallucinate, or mistype an ID. */
function schemaForBatch(batchIds: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      arguments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            card_id: { type: 'string', enum: batchIds },
            rewritten_blurb: { type: 'string', minLength: 1 },
            ai_score: { type: 'number', minimum: -1, maximum: 1 },
            notes: { type: 'string', minLength: 1 },
          },
          required: ['card_id', 'rewritten_blurb', 'ai_score', 'notes'],
          additionalProperties: false,
        },
        minItems: batchIds.length,
        maxItems: batchIds.length,
      },
    },
    required: ['arguments'],
    additionalProperties: false,
  };
}

function roomFor(card: CardRow): RoomSlug | null {
  return CATEGORY_TO_ROOM[card.category] ?? null;
}

function buildPrompt(
  claim: GeneratedClaim,
  batchCards: CardRow[],
  scoreById: Map<string, CardClaimScore>,
): string {
  const cardBlock = batchCards
    .map((c) => {
      const s = scoreById.get(c.objectID)!;
      const date = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : 'unknown';
      const tagList = c.tags?.lvl1?.length ? c.tags.lvl1 : (c.tags?.lvl0 ?? []);
      const tagLine = tagList.length > 0 ? `\n    tags: ${tagList.join(', ')}` : '';
      const projectLine =
        c.projects && c.projects.length > 0 ? `\n    projects: ${c.projects.join(', ')}` : '';
      return `- id=${c.objectID} [${c.category}] "${c.title}" (created=${date}, ambig=${s.ambiguity}, surprise=${s.surprise})\n    blurb: ${c.blurb}\n    fact: ${c.fact ?? '(none)'}${tagLine}${projectLine}`;
    })
    .join('\n');

  return `CLAIM: "${claim.claim_text}"

ELIGIBLE CARDS (${batchCards.length}):
${cardBlock}

Produce one argument object per card above, in the same order. Every card_id from the list must appear exactly once.`;
}

interface RawCardArgument {
  card_id: string;
  rewritten_blurb: string;
  ai_score: number;
  notes: string;
}

function clampScore(value: number): number {
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function processBatch(
  claim: GeneratedClaim,
  batchCards: CardRow[],
  scoreById: Map<string, CardClaimScore>,
): Promise<Map<string, CardArgument>> {
  const client = clientFor(config.models.pass4);
  const batchIds = batchCards.map((c) => c.objectID);
  const raw = await client.complete(buildPrompt(claim, batchCards, scoreById), {
    system: SYSTEM_PROMPT,
    maxTokens: 8000,
    schema: schemaForBatch(batchIds),
    reasoning: 'low',
  });

  let parsed: { arguments: RawCardArgument[] };
  try {
    parsed = JSON.parse(raw) as { arguments: RawCardArgument[] };
  } catch (err) {
    throw new Error(
      `[pass4] JSON.parse failed for "${claim.claim_text}" (claim_id=${claim.id}) batch of ${batchCards.length}.\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
      { cause: err },
    );
  }

  const batchArgs = new Map<string, CardArgument>();
  for (const arg of parsed.arguments) {
    if (typeof arg.ai_score !== 'number' || Number.isNaN(arg.ai_score)) {
      throw new Error(
        `[pass4] invalid ai_score for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    if (typeof arg.notes !== 'string' || arg.notes.trim().length === 0) {
      throw new Error(
        `[pass4] missing notes for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    batchArgs.set(arg.card_id, {
      rewrittenBlurb: arg.rewritten_blurb,
      aiScore: clampScore(arg.ai_score),
      notes: arg.notes.trim(),
    });
  }

  const missing = batchIds.filter((id) => !batchArgs.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[pass4] batch for "${claim.claim_text}" (claim_id=${claim.id}) omitted ${missing.length} card(s) despite enum/minItems constraints. Missing: ${missing.join(', ')}`,
    );
  }

  return batchArgs;
}

export async function runPass4(
  claims: GeneratedClaim[],
  scoredByClaim: Map<string, CardClaimScore[]>,
  cards: CardRow[],
): Promise<Pass4Output> {
  const client = clientFor(config.models.pass4);
  const batchSize = config.thresholds.pass4Batch;
  console.log(
    `[pass4] model=${client.model} validating ${claims.length} claims batch=${batchSize}`,
  );

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
    const scoreById = new Map(scores.map((s) => [s.card_id, s]));
    const claimCards = scores.map((s) => cardById.get(s.card_id)).filter((c): c is CardRow => !!c);

    const claimArguments = new Map<string, CardArgument>();
    const batches = chunk(claimCards, batchSize);
    console.log(
      `[pass4] "${claim.claim_text}": ${claimCards.length} cards → ${batches.length} batch${batches.length === 1 ? '' : 'es'}`,
    );
    for (let i = 0; i < batches.length; i++) {
      const batchArgs = await processBatch(claim, batches[i], scoreById);
      for (const [cardId, arg] of batchArgs) {
        claimArguments.set(cardId, arg);
      }
      console.log(`[pass4]   batch ${i + 1}/${batches.length} (${batches[i].length} cards) ok`);
    }

    // Survival check unchanged: minimum playable pool across all batches.
    const rewrittenCards = claimCards.filter((c) => claimArguments.has(c.objectID));
    const missing = claimCards.filter((c) => !claimArguments.has(c.objectID));
    if (missing.length > 0) {
      throw new Error(
        `[pass4] "${claim.claim_text}" (claim_id=${claim.id}): ${missing.length} card(s) missing from combined batch output. Missing: ${missing.map((c) => c.objectID).join(', ')}`,
      );
    }
    argumentsByClaim.set(claim.id, claimArguments);

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
