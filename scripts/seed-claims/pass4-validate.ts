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

export const SYSTEM_PROMPT = `Write the player-facing version of each card — a blurb that pulls a player in two directions against a specific claim without tipping them toward the answer — and assign the card a directional score against the claim.

Recruiter-safety rule (non-negotiable): the rewritten_blurb is public text that lives on the page next to Ashley's name regardless of how the player ultimately rules. It must read as a description of a hireable professional under BOTH classifications. The "proof" reading and the "objection" reading must each describe a working-style trait a hiring manager would respect. If the only honest way to write a card against this claim leaves the proof OR objection reading sounding like a character flaw — drop the card by emitting your best dual-hireable version anyway and flag the strain in notes; downstream review will cut it. Never write text that indicts Ashley's competence, integrity, or basic professionalism.

Raw materials per card: title, blurb, fact, created_at, tags, projects. Use all of them. Do not fabricate anything absent from these fields.

Source blurbs are written in first person ("I built…", "My approach was…", "I decided…"). Always convert to third person in rewritten_blurb. Use "Ashley" by name; never use pronouns (he/she/they) as a substitute. First-person phrasing in the output is always wrong.

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
2. rewritten_blurb — synthesize title, blurb, fact, and temporal context into player-facing text that creates genuine tension against this specific claim. Match original blurb length and register. The tension must be claim-specific, not generic. Both the "proof" and "objection" readings of this text must describe a hireable working-style trait — never write content that reads as a character flaw under either classification.
3. ai_score — a number in [-1.0, 1.0] judging which way the FULL evidence (including the hidden fact) actually leans against the claim. Positive = supports. Negative = undermines. Magnitude = confidence: 0.1 = nearly neutral, 0.9 = decisive. Use the full range; do not bunch around 0.5. Hidden from the player. Note: because Pass 2 enforces dual-hireability on every claim, "supports" and "undermines" both translate to professional traits — the score is directional, not moral.
4. notes — server-only auditor note (1-3 sentences). State the tension levers this rewrite pulls, how work/play + deadline context were handled, whether the dual-hireability check holds for both readings of the rewritten_blurb, and anything a reviewer should sanity-check (e.g. "leans on hidden DEV challenge deadline — player won't see the 2-week constraint", or "dual-hireability strained: proof reading verges on 'misses deadlines' — recommend reviewer cut"). This is the QA trail.`;

/** Build a batch-specific schema. Keeps `card_id` constrained to the batch's
 *  UUIDs via `enum`; drops `minItems`/`maxItems`, `additionalProperties: false`,
 *  and `minLength` to stay inside Gemini's `responseJsonSchema` validator
 *  (gemini-3.1-pro-preview returns 400 INVALID_ARGUMENT on the fuller JSON
 *  Schema set). Post-parse code below asserts batch-size and required-field
 *  presence in JS, so correctness is preserved; we just lean less on the
 *  provider's schema enforcement. */
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
            rewritten_blurb: { type: 'string' },
            ai_score: { type: 'number', minimum: -1, maximum: 1 },
            notes: { type: 'string' },
          },
          required: ['card_id', 'rewritten_blurb', 'ai_score', 'notes'],
        },
      },
    },
    required: ['arguments'],
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
    // Gemini 3.1 Pro Preview's default thinking budget is non-trivial and
    // counts against maxOutputTokens. 8k truncated with MAX_TOKENS; 24k
    // leaves ~20k for thinking and ~4k for the actual rewrites (10 cards ×
    // ~300 tokens). Still well under the model's sync output cap.
    maxTokens: 24000,
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

  if (!Array.isArray(parsed.arguments) || parsed.arguments.length !== batchIds.length) {
    throw new Error(
      `[pass4] batch for "${claim.claim_text}" (claim_id=${claim.id}) returned ${parsed.arguments?.length ?? 0} args, expected ${batchIds.length}`,
    );
  }

  const batchArgs = new Map<string, CardArgument>();
  for (const arg of parsed.arguments) {
    if (typeof arg.ai_score !== 'number' || Number.isNaN(arg.ai_score)) {
      throw new Error(
        `[pass4] invalid ai_score for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    if (typeof arg.rewritten_blurb !== 'string' || arg.rewritten_blurb.trim().length === 0) {
      throw new Error(
        `[pass4] missing rewritten_blurb for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    if (typeof arg.notes !== 'string' || arg.notes.trim().length === 0) {
      throw new Error(
        `[pass4] missing notes for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    if (batchArgs.has(arg.card_id)) {
      throw new Error(
        `[pass4] duplicate card_id=${arg.card_id} in batch for "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    batchArgs.set(arg.card_id, {
      rewrittenBlurb: arg.rewritten_blurb.trim(),
      aiScore: clampScore(arg.ai_score),
      notes: arg.notes.trim(),
      // isParamount defaults to false here — runPass4 picks the paramount
      // set after all batches complete and rewrites this flag for the
      // chosen cards. Doing it post-batch lets us balance |ai_score| against
      // room coverage with the full pool in hand.
      isParamount: false,
    });
  }

  const missing = batchIds.filter((id) => !batchArgs.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[pass4] batch for "${claim.claim_text}" (claim_id=${claim.id}) omitted ${missing.length} card(s). Missing: ${missing.join(', ')}`,
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
    const verdictAlignment = checkVerdictAlignment(claim, claimArguments);
    const survived = passedCoverage && passedTotal && verdictAlignment.aligned;

    // Paramount selection runs only for survivors — there's no point
    // flagging cards on a claim that won't ship. Mutates claimArguments
    // in-place to set isParamount=true on the chosen card_ids.
    if (survived) {
      const paramount = selectParamount(rewrittenCards, claimArguments);
      for (const cardId of paramount) {
        const arg = claimArguments.get(cardId);
        if (arg) claimArguments.set(cardId, { ...arg, isParamount: true });
      }
      console.log(
        `[pass4] "${claim.claim_text}": flagged ${paramount.size} paramount card${paramount.size === 1 ? '' : 's'}`,
      );
    }

    validations.push({
      claim_id: claim.id,
      claim_text: claim.claim_text,
      room_coverage: coveredRooms,
      total_eligible_cards: rewrittenCards.length,
      survived,
      cut_reason: survived
        ? undefined
        : cutReason(claim, verdictAlignment, {
            passedCoverage,
            coveredRooms,
            passedTotal,
            rewrittenCount: rewrittenCards.length,
          }),
      eligible_card_ids: rewrittenCards.map((c) => c.objectID),
    });

    console.log(
      `[pass4] "${claim.claim_text}": ${survived ? 'SURVIVED' : 'CUT'} (${rewrittenCards.length} cards, ${coveredRooms} rooms, avg ai_score=${verdictAlignment.average.toFixed(2)} vs desired=${claim.desired_verdict})`,
    );
  }

  return { validations, arguments: argumentsByClaim };
}

interface VerdictAlignment {
  /** Average ai_score across the claim's pool. Sign indicates which way the
   *  full evidence leans against the surface claim. */
  average: number;
  /** True when the evidence's directional sign matches the claim's declared
   *  desired_verdict (positive avg → accuse, negative avg → pardon). */
  aligned: boolean;
}

/**
 * Cross-check Pass 2's declared desired_verdict against the directional
 * evidence Pass 4 just produced. desired_verdict says "the surface claim is
 * roughly TRUE/FALSE of Ashley"; the average ai_score across the pool says
 * "here's how the cards actually lean." Mismatch = the model contradicted
 * itself across passes — drop the claim rather than ship a brief whose
 * verdict-as-self-assessment opener will misfire.
 *
 * Threshold: |average| must clear MIN_VERDICT_MAGNITUDE. A near-zero average
 * means the pool is genuinely ambivalent, which makes desired_verdict
 * unreliable regardless of sign — drop those too.
 */
function checkVerdictAlignment(
  claim: GeneratedClaim,
  claimArguments: Map<string, CardArgument>,
): VerdictAlignment {
  if (claimArguments.size === 0) return { average: 0, aligned: false };
  let sum = 0;
  for (const arg of claimArguments.values()) sum += arg.aiScore;
  const average = sum / claimArguments.size;

  if (Math.abs(average) < MIN_VERDICT_MAGNITUDE) {
    return { average, aligned: false };
  }
  const signMatches =
    (claim.desired_verdict === 'accuse' && average > 0) ||
    (claim.desired_verdict === 'pardon' && average < 0);
  return { average, aligned: signMatches };
}

const MIN_VERDICT_MAGNITUDE = 0.1;

function cutReason(
  claim: GeneratedClaim,
  verdict: VerdictAlignment,
  coverage: {
    passedCoverage: boolean;
    coveredRooms: number;
    passedTotal: boolean;
    rewrittenCount: number;
  },
): string {
  if (!coverage.passedCoverage) {
    return `only ${coverage.coveredRooms}/${config.targets.minRooms} rooms covered`;
  }
  if (!coverage.passedTotal) {
    return `only ${coverage.rewrittenCount} rewritten cards (need ≥${config.targets.minTotalCards})`;
  }
  // Alignment failure — surface it loudly so a rerun can investigate the
  // upstream Pass 2 vs Pass 4 disagreement instead of silently shipping a
  // claim whose verdict opener would mislead the player.
  return `desired_verdict=${claim.desired_verdict} mismatches evidence avg ai_score=${verdict.average.toFixed(2)} (need |avg|≥${MIN_VERDICT_MAGNITUDE} with matching sign)`;
}

function roomsCovered(cards: CardRow[]): number {
  const rooms = new Set<RoomSlug>();
  for (const card of cards) {
    const room = roomFor(card);
    if (room) rooms.add(room);
  }
  return rooms.size;
}

const PARAMOUNT_BASE = 5;
const PARAMOUNT_MAX = 8;
const PARAMOUNT_MIN_ROOMS = 3;

/**
 * Pick the small set of cards that the runtime cover letter prompt MUST
 * surface — whether or not the player ruled them. Chosen by descending
 * |ai_score| (the most directionally decisive evidence), with room-coverage
 * balancing so a single chamber can't dominate the must-surface set. The
 * prompt uses these to call out paramount-but-skipped cards as gaps.
 *
 * Algorithm:
 *  1. Sort survivors by |ai_score| descending. Pick the top PARAMOUNT_BASE.
 *  2. If that picks fewer than PARAMOUNT_MIN_ROOMS distinct rooms, expand
 *     down the ranked list (up to PARAMOUNT_MAX) adding cards from rooms
 *     not yet covered, until either the room minimum is met or the cap
 *     hits.
 *  3. Returns the chosen card_id set.
 */
function selectParamount(
  rewrittenCards: CardRow[],
  claimArguments: Map<string, CardArgument>,
): Set<string> {
  const ranked = [...rewrittenCards]
    .map((card) => ({ card, score: claimArguments.get(card.objectID)?.aiScore ?? 0 }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const chosen = new Set<string>();
  const roomsHit = new Set<RoomSlug>();

  for (let i = 0; i < ranked.length && chosen.size < PARAMOUNT_BASE; i++) {
    const { card } = ranked[i];
    chosen.add(card.objectID);
    const room = roomFor(card);
    if (room) roomsHit.add(room);
  }

  if (roomsHit.size < PARAMOUNT_MIN_ROOMS) {
    for (let i = 0; i < ranked.length && chosen.size < PARAMOUNT_MAX; i++) {
      const { card } = ranked[i];
      if (chosen.has(card.objectID)) continue;
      const room = roomFor(card);
      if (room && !roomsHit.has(room)) {
        chosen.add(card.objectID);
        roomsHit.add(room);
        if (roomsHit.size >= PARAMOUNT_MIN_ROOMS) break;
      }
    }
  }

  return chosen;
}
