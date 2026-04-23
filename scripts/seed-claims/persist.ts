/** Idempotent write of validated claims + card pairs back to Supabase. */

import { seedSupabase } from './cards';
import type { CardClaimScore, ClaimValidation, GeneratedClaim } from './types';

export interface PersistInput {
  claim: GeneratedClaim;
  validation: ClaimValidation;
  scores: CardClaimScore[];
  /** Rewritten blurbs from Pass 5, keyed by card_id. Written to claim_cards
   *  as the game-facing text — not the original public.cards blurb. */
  rewrites: Map<string, string>;
}

export async function persistSeed(inputs: PersistInput[]): Promise<void> {
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
      .map((s) => ({
        claim_id: inserted.id,
        card_id: s.card_id,
        ambiguity: s.ambiguity,
        surprise: s.surprise,
        rewritten_blurb: input.rewrites.get(s.card_id) ?? '',
      }));

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
