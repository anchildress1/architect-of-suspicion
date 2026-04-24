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

export async function persistSeed(inputs: PersistInput[]): Promise<void> {
  const survivors = inputs.filter((i) => i.validation.survived);
  if (survivors.length === 0) {
    throw new Error('persistSeed called with no surviving inputs — refusing to truncate DB');
  }

  // Pre-validate all rewrites before touching the DB. The truncate+insert sequence
  // is not atomic — a bug discovered mid-loop would leave the DB partially written.
  // Fail fast here so the existing seed is never destroyed by a pipeline bug.
  for (const input of survivors) {
    for (const cardId of input.validation.eligible_card_ids) {
      if (!input.rewrites.has(cardId)) {
        throw new Error(
          `Missing rewrite for card ${cardId} on claim "${input.claim.claim_text}" — aborting before DB truncation`,
        );
      }
    }
  }

  const supabase = seedSupabase();

  // FK-safe truncation: claim_cards first, then claims.
  const { error: deleteCardsErr } = await supabase
    .schema('suspicion')
    .from('claim_cards')
    .delete()
    .not('claim_id', 'is', null);
  if (deleteCardsErr) throw new Error(`truncate claim_cards: ${deleteCardsErr.message}`);

  const { error: deleteClaimsErr } = await supabase
    .schema('suspicion')
    .from('claims')
    .delete()
    .not('id', 'is', null);
  if (deleteClaimsErr) throw new Error(`truncate claims: ${deleteClaimsErr.message}`);

  for (const input of inputs) {
    if (!input.validation.survived) continue;

    const { data: inserted, error: insertClaimErr } = await supabase
      .schema('suspicion')
      .from('claims')
      .insert({
        claim_text: input.claim.claim_text,
        rationale: input.claim.rationale,
        room_coverage: input.validation.room_coverage,
        total_eligible_cards: input.validation.total_eligible_cards,
      })
      .select('id')
      .single();
    if (insertClaimErr || !inserted) {
      throw new Error(`insert claim: ${insertClaimErr?.message ?? 'no row returned'}`);
    }

    const eligible = new Set(input.validation.eligible_card_ids);
    const rows = input.scores
      .filter((s) => eligible.has(s.card_id))
      .map((s) => {
        const rewritten_blurb = input.rewrites.get(s.card_id);
        if (!rewritten_blurb) {
          throw new Error(
            `Missing rewrite for card ${s.card_id} on claim "${input.claim.claim_text}" — every surviving pair must have a rewritten blurb`,
          );
        }
        return {
          claim_id: inserted.id,
          card_id: s.card_id,
          ambiguity: s.ambiguity,
          surprise: s.surprise,
          rewritten_blurb,
        };
      });

    if (rows.length > 0) {
      const { error: insertPairsErr } = await supabase
        .schema('suspicion')
        .from('claim_cards')
        .insert(rows);
      if (insertPairsErr) {
        throw new Error(`insert claim_cards: ${insertPairsErr.message}`);
      }
    }

    console.log(`[persist] wrote claim "${input.claim.claim_text}" + ${rows.length} pairs`);
  }
}
