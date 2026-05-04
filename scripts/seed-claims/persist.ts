/** Idempotent write of validated claims + card pairs back to Supabase. */

import { seedSupabase } from './cards';
import type { CardArgument, CardClaimScore, ClaimValidation, GeneratedClaim } from './types';

export interface PersistInput {
  claim: GeneratedClaim;
  validation: ClaimValidation;
  scores: CardClaimScore[];
  /** Per-card argument keyed by card_id. Every surviving card must have one —
   *  no fallbacks. Missing = pipeline bug, caught before this point. */
  arguments: Map<string, CardArgument>;
}

export interface ClaimCardSeedRow {
  card_id: string;
  ambiguity: number;
  surprise: number;
  ai_score: number;
  rewritten_blurb: string;
  /** Server-only auditor note. Persisted to `suspicion.claim_cards.notes`. */
  notes: string;
  /** Cards essential to revealing the hireable_truth — surfaced by the
   *  runtime brief regardless of whether the player ruled them. */
  is_paramount: boolean;
}

export interface ClaimSeedRow {
  claim_text: string;
  rationale: string | null;
  /** Single positive professional trait the brief reveals — anchors the
   *  runtime cover letter prompt. Pass 2 produces it; the RPC enforces
   *  NOT NULL + non-empty. */
  hireable_truth: string;
  /** `accuse` (claim is true of Ashley) or `pardon` (claim is false). The
   *  brief lands the same hireable_truth either way; this only swings the
   *  rhetorical opener. */
  desired_verdict: 'accuse' | 'pardon';
  room_coverage: number;
  total_eligible_cards: number;
  cards: ClaimCardSeedRow[];
}

function assertScoreBounds(score: CardClaimScore, claim: GeneratedClaim): void {
  if (!Number.isInteger(score.ambiguity) || score.ambiguity < 1 || score.ambiguity > 5) {
    throw new Error(
      `Invalid ambiguity=${score.ambiguity} for card ${score.card_id} on claim "${claim.claim_text}" (${claim.id}); expected integer 1..5`,
    );
  }
  if (!Number.isInteger(score.surprise) || score.surprise < 1 || score.surprise > 5) {
    throw new Error(
      `Invalid surprise=${score.surprise} for card ${score.card_id} on claim "${claim.claim_text}" (${claim.id}); expected integer 1..5`,
    );
  }
}

function assertAiScore(aiScore: number, cardId: string, claim: GeneratedClaim): void {
  if (typeof aiScore !== 'number' || Number.isNaN(aiScore) || aiScore < -1 || aiScore > 1) {
    throw new Error(
      `Invalid ai_score=${aiScore} for card ${cardId} on claim "${claim.claim_text}" (${claim.id}); expected number in [-1.0, 1.0]`,
    );
  }
}

// Pass 2's schema marks hireable_truth required, but persist runs after every
// upstream pass plus disk-checkpoint round-trips that could corrupt or
// truncate the field. The runtime cover letter prompt assumes both fields
// are present — fail loudly here rather than write garbage to the DB.
function assertHireableTruth(value: unknown, claim: GeneratedClaim): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Missing hireable_truth for claim "${claim.claim_text}" (${claim.id}); Pass 2 must populate it`,
    );
  }
  return value.trim();
}

function assertDesiredVerdict(value: unknown, claim: GeneratedClaim): 'accuse' | 'pardon' {
  if (value !== 'accuse' && value !== 'pardon') {
    throw new Error(
      `Invalid desired_verdict=${String(value)} for claim "${claim.claim_text}" (${claim.id}); expected 'accuse' or 'pardon'`,
    );
  }
  return value;
}

export function buildSeedPayload(inputs: PersistInput[]): ClaimSeedRow[] {
  const survivors = inputs.filter((i) => i.validation.survived);
  if (survivors.length === 0) {
    throw new Error('buildSeedPayload called with no surviving inputs — refusing to truncate DB');
  }

  const payload: ClaimSeedRow[] = [];
  for (const input of survivors) {
    if (input.validation.claim_id !== input.claim.id) {
      throw new Error(
        `Validation key mismatch for claim "${input.claim.claim_text}" (${input.claim.id}); got validation for ${input.validation.claim_id}`,
      );
    }

    const scoreByCard = new Map(input.scores.map((score) => [score.card_id, score]));
    const seenEligible = new Set<string>();
    const cards: ClaimCardSeedRow[] = [];

    for (const cardId of input.validation.eligible_card_ids) {
      if (seenEligible.has(cardId)) {
        throw new Error(
          `Duplicate eligible card ${cardId} on claim "${input.claim.claim_text}" (${input.claim.id})`,
        );
      }
      seenEligible.add(cardId);

      const score = scoreByCard.get(cardId);
      if (!score) {
        throw new Error(
          `Missing score for card ${cardId} on claim "${input.claim.claim_text}" (${input.claim.id})`,
        );
      }
      assertScoreBounds(score, input.claim);

      const arg = input.arguments.get(cardId);
      if (!arg) {
        throw new Error(
          `Missing argument for card ${cardId} on claim "${input.claim.claim_text}" (${input.claim.id})`,
        );
      }
      assertAiScore(arg.aiScore, cardId, input.claim);
      if (typeof arg.notes !== 'string' || arg.notes.trim().length === 0) {
        throw new Error(
          `Missing notes for card ${cardId} on claim "${input.claim.claim_text}" (${input.claim.id})`,
        );
      }

      cards.push({
        card_id: cardId,
        ambiguity: score.ambiguity,
        surprise: score.surprise,
        ai_score: arg.aiScore,
        rewritten_blurb: arg.rewrittenBlurb,
        notes: arg.notes,
        is_paramount: arg.isParamount === true,
      });
    }

    // Paramount must be a non-empty subset for surviving claims — Pass 4
    // selects ≥3 by design. Zero paramount means selectParamount silently
    // skipped this claim, which would let the runtime brief lose its
    // gap-callout signal.
    const paramountCount = cards.filter((c) => c.is_paramount).length;
    if (paramountCount === 0) {
      throw new Error(
        `No paramount cards on surviving claim "${input.claim.claim_text}" (${input.claim.id}); pass4 must select at least one`,
      );
    }

    payload.push({
      claim_text: input.claim.claim_text,
      rationale: input.claim.rationale,
      hireable_truth: assertHireableTruth(input.claim.hireable_truth, input.claim),
      desired_verdict: assertDesiredVerdict(input.claim.desired_verdict, input.claim),
      room_coverage: input.validation.room_coverage,
      total_eligible_cards: input.validation.total_eligible_cards,
      cards,
    });
  }

  return payload;
}

export async function persistSeed(inputs: PersistInput[]): Promise<void> {
  const payload = buildSeedPayload(inputs);
  const supabase = seedSupabase();
  const { error } = await supabase
    .schema('suspicion')
    .rpc('replace_claim_seed', { seed_payload: payload });

  if (error) {
    throw new Error(`replace_claim_seed rpc failed: ${error.message}`);
  }

  for (const claim of payload) {
    const paramount = claim.cards.filter((c) => c.is_paramount).length;
    console.log(
      `[persist] wrote "${claim.claim_text}" (${claim.desired_verdict}) + ${claim.cards.length} pairs (${paramount} paramount)`,
    );
  }
}
