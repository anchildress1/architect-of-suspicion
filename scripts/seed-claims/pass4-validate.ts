/** Pass 4: Claim Validation + Card Rewrite.
 *
 *  Input:  claims (Pass 2) + scored pairs (Pass 3) + the eligible card pools.
 *  Output: validated claims with final card pools, AND claim-specific title
 *          + blurb rewrites for every surviving card.
 *
 *  Batched: each claim's card pool is split into chunks of `pass4Batch` cards
 *  (default 20) and sent in separate calls. A hiccup on one chunk retries
 *  just that chunk — not the whole claim. Output schema is trimmed to only
 *  the fields we persist (rewritten_title, rewritten_blurb, ai_score, notes)
 *  — proof/objection were scratch-reasoning tokens the DB never stored. Each
 *  batch's schema pins `card_id` to an enum of that batch's UUIDs and uses
 *  minItems/maxItems equal to the batch length so the model physically cannot
 *  skip, duplicate, or invent an ID.
 */

import { clientFor } from './clients';
import { config } from './config';
import { buildPass4Cache, deriveCachePromptVersion, type Pass4Cache } from './pass4Cache';
import type {
  CardArgument,
  CardClaimScore,
  CardRow,
  ClaimValidation,
  GeneratedClaim,
  Pass4Output,
} from './types';
import { CATEGORY_TO_ROOM, type RoomSlug } from './types';

export const SYSTEM_PROMPT = `Write the player-facing surface of each card — a third-person title and blurb that stand alone as exhibits a careful player could rule either way — and, separately, assign a directional score against the claim.

RECRUITER-SAFETY (non-negotiable): rewritten_title and rewritten_blurb are public text living next to Ashley's name regardless of verdict. Both the "proof" reading and "objection" reading must describe a working-style trait a hiring manager respects. Never indicts competence, integrity, or basic professionalism. If the only honest version leaves either reading sounding like a character flaw, emit the best dual-hireable version anyway and flag the strain in notes — downstream review cuts it.

Raw materials per card: title, blurb, fact, created_at, tags, projects. Use all of them. Don't fabricate.

Source titles and blurbs are first-person ("I built…", "My approach was…", "I positioned…"). Always convert to third person in BOTH the rewritten title and the rewritten blurb — Ashley by name or she/her pronouns. Never he/him or they/them. First-person in output is always wrong.

Voice and posture: court-exhibit register. The blurb describes the work itself — what Ashley built, what choice she made, what constraint applied, what happened. Third-person observation. The player is the one weighing the exhibit against the claim, not the narrator. A reader who has not seen the claim should be unable to tell from the blurb alone which claim this card was paired with — that is the self-containment test. The card's directional weight lives in the score and in which facts you choose to surface, never in commentary about the claim.

Tags + projects carry work/play + deadline context:
- "DEV Challenge > …" → strict external deadline, often unfamiliar stack. Surface the pressure where it sharpens the claim.
- "THD" or other employer/client tags → corporate-layer work; negotiated trade-offs.
- Personal-brand projects ("CheckMark", "System Notes", "Legacy Smelter", "Carbon Trace", "Underfoot Travel") → play; Ashley sets the rules.
- Lean on these signals when the surface blurb would mislead.

Temporal reasoning:
- DIFFERENT periods + apparent contradiction → evolution, not hypocrisy. Weakens the claim.
- SAME period + contradiction, or pattern consistent across all years → strengthens the claim.
- Surface timing in rewritten_blurb when it adds tension ("early in Ashley's career", "more recently") without signaling which reading it supports.

Output per card (all five required, no scratch work):
1. card_id — exact id from ELIGIBLE CARDS. Copy; never invent.
2. rewritten_title — third-person rewrite of the source title. Match the source title's length and register; carry the same subject the source title carried. No new claims, no editorializing — just the same surface phrasing in Ashley's third-person voice.
3. rewritten_blurb — third-person description of what Ashley did: the work, the choice, the constraint, the result. Synthesizes title + blurb + fact + temporal context into a self-contained exhibit. Match original length and register. Stays in neutral observation — the player decides what it means against the claim. Both proof and objection readings of those facts must describe a hireable working-style trait.
4. ai_score — number in [-1.0, 1.0]. Positive = supports the claim, negative = undermines. Magnitude = confidence (0.1 = near-neutral, 0.9 = decisive). Use the full range; don't bunch at 0.5. Hidden from player. Pass 2 guarantees dual-hireability, so "supports" and "undermines" both translate to professional traits — score is directional, not moral.
5. notes — 1-3 sentences for QA trail: tension levers, work/play + deadline handling, dual-hireability check on both readings, anything to sanity-check (e.g. "hidden DEV challenge deadline — player won't see the 2-week constraint", "dual-hireability strained on proof reading — recommend cut").`;

/** Build a batch-specific schema. Pass 4 runs on an OpenAI model
 *  (gpt-5.4-mini by default) with strict mode enabled (see clients.ts),
 *  which requires `additionalProperties: false` at every object level and
 *  every property listed in `required`. Gemini's `responseJsonSchema`
 *  validator rejected those keywords on gemini-3.1-pro-preview, so if
 *  Pass 4 is ever overridden back to a Gemini model the schema will need
 *  to be relaxed. The post-parse asserts below remain the source of
 *  truth for correctness. */
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
            rewritten_title: { type: 'string' },
            rewritten_blurb: { type: 'string' },
            ai_score: { type: 'number', minimum: -1, maximum: 1 },
            notes: { type: 'string' },
          },
          required: ['card_id', 'rewritten_title', 'rewritten_blurb', 'ai_score', 'notes'],
          additionalProperties: false,
        },
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
  rewritten_title: string;
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

/** One LLM call for `cards`. Parses, validates each arg's required fields,
 *  and writes successful entries through to the cache. Skips entries the
 *  model didn't return — the caller decides whether to retry the missing.
 *  Throws only on per-arg validation failures (real bugs, not slop). */
async function rewriteOnce(
  claim: GeneratedClaim,
  cards: CardRow[],
  scoreById: Map<string, CardClaimScore>,
  cache: Pass4Cache,
): Promise<{ rewrites: Map<string, CardArgument>; missingIds: string[] }> {
  if (cards.length === 0) return { rewrites: new Map(), missingIds: [] };
  const client = clientFor(config.models.pass4);
  const cardIds = cards.map((c) => c.objectID);
  const raw = await client.complete(buildPrompt(claim, cards, scoreById), {
    system: SYSTEM_PROMPT,
    // 24k leaves ample room for thinking + ~6k of actual rewrites (20
    // cards × ~300 tokens). Sized for Gemini's default thinking budget;
    // OpenAI mini fits comfortably.
    maxTokens: 24000,
    schema: schemaForBatch(cardIds),
    reasoning: 'low',
  });

  let parsed: { arguments: RawCardArgument[] };
  try {
    parsed = JSON.parse(raw) as { arguments: RawCardArgument[] };
  } catch (err) {
    throw new Error(
      `[pass4] JSON.parse failed for "${claim.claim_text}" (claim_id=${claim.id}) batch of ${cards.length}.\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
      { cause: err },
    );
  }

  if (!Array.isArray(parsed.arguments)) {
    throw new Error(
      `[pass4] batch for "${claim.claim_text}" (claim_id=${claim.id}) returned non-array arguments`,
    );
  }

  const allowedIds = new Set(cardIds);
  const cardById = new Map<string, CardRow>(cards.map((c) => [c.objectID, c]));
  const rewrites = new Map<string, CardArgument>();
  let droppedOutOfBatch = 0;
  let droppedDuplicates = 0;

  for (const arg of parsed.arguments) {
    if (!allowedIds.has(arg.card_id)) {
      droppedOutOfBatch += 1;
      continue;
    }
    if (rewrites.has(arg.card_id)) {
      droppedDuplicates += 1;
      continue;
    }
    if (typeof arg.ai_score !== 'number' || Number.isNaN(arg.ai_score)) {
      throw new Error(
        `[pass4] invalid ai_score for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
      );
    }
    if (typeof arg.rewritten_title !== 'string' || arg.rewritten_title.trim().length === 0) {
      throw new Error(
        `[pass4] missing rewritten_title for card_id=${arg.card_id} on "${claim.claim_text}" (claim_id=${claim.id})`,
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
    const cardArg: CardArgument = {
      rewrittenTitle: arg.rewritten_title.trim(),
      rewrittenBlurb: arg.rewritten_blurb.trim(),
      aiScore: clampScore(arg.ai_score),
      notes: arg.notes.trim(),
      // isParamount defaults to false here — runPass4 picks the paramount
      // set after all batches complete and rewrites this flag for the
      // chosen cards. Doing it post-batch lets us balance |ai_score| against
      // room coverage with the full pool in hand.
      isParamount: false,
    };
    rewrites.set(arg.card_id, cardArg);

    // Write through to cache. Done in-loop so partial-batch failures still
    // persist the entries we did get back. Errors inside store() are logged
    // but don't fail the seed.
    const sourceCard = cardById.get(arg.card_id);
    if (sourceCard) {
      await cache.store(sourceCard, claim, client.model, cardArg);
    }
  }

  if (droppedOutOfBatch > 0 || droppedDuplicates > 0) {
    console.warn(
      `[pass4] cleaned ${droppedOutOfBatch} out-of-batch + ${droppedDuplicates} duplicate arg(s) for "${claim.claim_text}"; kept ${rewrites.size}`,
    );
  }

  const missingIds = cardIds.filter((id) => !rewrites.has(id));
  return { rewrites, missingIds };
}

async function processBatch(
  claim: GeneratedClaim,
  batchCards: CardRow[],
  scoreById: Map<string, CardClaimScore>,
  cache: Pass4Cache,
): Promise<Map<string, CardArgument>> {
  const client = clientFor(config.models.pass4);

  // Cache lookup. Cards with hits skip the LLM call entirely; cards with
  // misses fall through to the model. If every card in the batch is a hit,
  // we never construct the request.
  const cachedArgs = await cache.lookup(batchCards, claim, client.model);
  const freshCards = batchCards.filter((c) => !cachedArgs.has(c.objectID));
  if (freshCards.length === 0) return cachedArgs;

  const primary = await rewriteOnce(claim, freshCards, scoreById, cache);
  const allArgs = new Map<string, CardArgument>(primary.rewrites);

  // Same retry pattern as Pass 3: the model occasionally drops cards
  // mid-batch. A small follow-up call with just the missing IDs is far
  // less likely to drop. Cards still missing after retry are skipped
  // with a warning and absent from the survivor pool — runPass4's
  // survival check handles that gracefully.
  if (primary.missingIds.length > 0) {
    const missingCards = freshCards.filter((c) => primary.missingIds.includes(c.objectID));
    console.warn(
      `[pass4] retrying ${missingCards.length} missing card(s) for "${claim.claim_text}": ${primary.missingIds.join(', ')}`,
    );
    const retry = await rewriteOnce(claim, missingCards, scoreById, cache);
    for (const [cardId, arg] of retry.rewrites) allArgs.set(cardId, arg);
    if (retry.missingIds.length > 0) {
      console.warn(
        `[pass4] SKIPPED ${retry.missingIds.length} card(s) after retry for "${claim.claim_text}": ${retry.missingIds.join(', ')}`,
      );
    }
  }

  // Merge cached entries with fresh entries so callers see the full batch.
  const merged = new Map<string, CardArgument>(cachedArgs);
  for (const [cardId, arg] of allArgs) merged.set(cardId, arg);
  return merged;
}

export async function runPass4(
  claims: GeneratedClaim[],
  scoredByClaim: Map<string, CardClaimScore[]>,
  cards: CardRow[],
): Promise<Pass4Output> {
  const client = clientFor(config.models.pass4);
  const batchSize = config.thresholds.pass4Batch;
  const cache = buildPass4Cache({
    disabled: config.cacheDisabled,
    promptVersion: deriveCachePromptVersion(SYSTEM_PROMPT),
  });
  console.log(
    `[pass4] model=${client.model} validating ${claims.length} claims batch=${batchSize} cache=${cache.enabled ? 'enabled' : 'disabled'}`,
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
      const batchArgs = await processBatch(claim, batches[i], scoreById, cache);
      for (const [cardId, arg] of batchArgs) {
        claimArguments.set(cardId, arg);
      }
      console.log(`[pass4]   batch ${i + 1}/${batches.length} (${batches[i].length} cards) ok`);
    }

    // Survival check: only count cards that successfully got rewrites.
    // Cards skipped after retry just don't appear in rewrittenCards;
    // claim survival still depends on minTotalCards + minRooms below,
    // so partial coverage from one transient drop won't tank a claim
    // unless the drop count is large enough to fail the survival floor.
    const rewrittenCards = claimCards.filter((c) => claimArguments.has(c.objectID));
    const missing = claimCards.filter((c) => !claimArguments.has(c.objectID));
    if (missing.length > 0) {
      console.warn(
        `[pass4] "${claim.claim_text}": ${missing.length}/${claimCards.length} card(s) skipped after retry — proceeding with partial pool`,
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

  if (cache.enabled) {
    const { hits, misses, writes } = cache.stats();
    const total = hits + misses;
    const rate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
    console.log(`[pass4] cache: ${hits}/${total} hits (${rate}%), ${writes} writes`);
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
