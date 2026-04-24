/** Idempotent write of validated claims + card pairs back to Supabase. */

import { seedSupabase } from './cards';
import type { CardClaimScore, ClaimValidation, GeneratedClaim } from './types';

export interface PersistInput {
  claim: GeneratedClaim;
  validation: ClaimValidation;
  scores: CardClaimScore[];
  /** Rewritten blurbs keyed by card_id. Every surviving card must have one —
   *  no fallbacks. Missing = pipeline bug, caught before this point. */
  rewrites: Map<string, string>;
}

export interface ClaimCardSeedRow {
  card_id: string;
  ambiguity: number;
  surprise: number;
  rewritten_blurb: string;
}

export interface ClaimSeedRow {
  claim_text: string;
  rationale: string | null;
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

      const rewritten_blurb = input.rewrites.get(cardId);
      if (!rewritten_blurb) {
        throw new Error(
          `Missing rewrite for card ${cardId} on claim "${input.claim.claim_text}" (${input.claim.id})`,
        );
      }

      cards.push({
        card_id: cardId,
        ambiguity: score.ambiguity,
        surprise: score.surprise,
        rewritten_blurb,
      });
    }

    payload.push({
      claim_text: input.claim.claim_text,
      rationale: input.claim.rationale,
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
    console.log(`[persist] wrote claim "${claim.claim_text}" + ${claim.cards.length} pairs`);
  }
}
