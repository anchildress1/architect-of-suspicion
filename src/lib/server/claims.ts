import { getSupabase } from '$lib/server/supabase';
import type { Claim, ClaimTruthContext, FullCard, Verdict } from '$lib/types';

/** Unbiased rejection-sampled index in [0, max). Returns 0 if max <= 0. */
function randomIndex(max: number): number {
  if (max <= 0) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

/**
 * Pick one claim at random from suspicion.claims for a fresh session.
 * Count + offset-select avoids materializing the full table (two small reads).
 */
export async function pickRandomClaim(): Promise<{ claim: Claim | null; error: string | null }> {
  const supabase = getSupabase().schema('suspicion');

  const { count, error: countErr } = await supabase
    .from('claims')
    .select('id', { count: 'exact', head: true });

  if (countErr) {
    console.error('[claims] pickRandomClaim count failed:', countErr.message);
    return { claim: null, error: 'Failed to fetch claims' };
  }
  if (!count || count === 0) {
    return { claim: null, error: 'No claims seeded' };
  }

  const offset = randomIndex(count);
  const { data, error } = await supabase
    .from('claims')
    .select('id, claim_text')
    .order('id', { ascending: true })
    .range(offset, offset)
    .maybeSingle();

  if (error) {
    console.error('[claims] pickRandomClaim select failed:', error.message);
    return { claim: null, error: 'Failed to fetch claims' };
  }
  if (!data) return { claim: null, error: 'No claims seeded' };

  return {
    claim: { id: data.id as string, text: data.claim_text as string },
    error: null,
  };
}

/** Resolve a claim by id (used by the runtime evaluate path). */
export async function getClaimById(
  claimId: string,
): Promise<{ claim: Claim | null; error: string | null }> {
  const { data, error } = await getSupabase()
    .schema('suspicion')
    .from('claims')
    .select('id, claim_text')
    .eq('id', claimId)
    .maybeSingle();

  if (error) {
    console.error('[claims] getClaimById failed:', error.message);
    return { claim: null, error: 'Failed to fetch claim' };
  }
  if (!data) return { claim: null, error: 'Claim not found' };

  return {
    claim: { id: data.id as string, text: data.claim_text as string },
    error: null,
  };
}

/**
 * Fetch the truth context the cover letter prompt anchors on. Pass 2 of the
 * claim engine produced the hireable_truth (the trait the brief reveals
 * regardless of verdict) and the desired_verdict (whether the surface claim
 * is actually true of Ashley). The DB enforces NOT NULL + CHECK constraints
 * on both columns; a null return means the claim was deleted between session
 * creation and verdict — the route refuses rather than letting the prompt
 * drift to a recruiter-unsafe framing.
 */
export async function getClaimTruthContext(
  claimId: string,
): Promise<{ context: ClaimTruthContext | null; error: string | null }> {
  const { data, error } = await getSupabase()
    .schema('suspicion')
    .from('claims')
    .select('hireable_truth, desired_verdict')
    .eq('id', claimId)
    .maybeSingle();

  if (error) {
    console.error('[claims] getClaimTruthContext failed:', error.message);
    return { context: null, error: 'Failed to fetch claim truth' };
  }
  if (!data) return { context: null, error: 'Claim not found' };

  const desiredVerdict = data.desired_verdict as Verdict;
  if (desiredVerdict !== 'accuse' && desiredVerdict !== 'pardon') {
    console.error(
      '[claims] getClaimTruthContext: invalid desired_verdict in DB:',
      data.desired_verdict,
    );
    return { context: null, error: 'Invalid claim truth state' };
  }

  return {
    context: {
      hireableTruth: data.hireable_truth as string,
      desiredVerdict,
    },
    error: null,
  };
}

/**
 * Fetch the paramount cards for a claim, joined to the source card facts.
 * The runtime cover letter prompt surfaces these regardless of whether the
 * player ruled them — paramount-but-skipped becomes a "the player did not
 * call X to the stand" gap call-out. Returns FullCard rows so the prompt
 * has access to the fact (`fact` is server-only and never returned to the
 * client elsewhere — same posture as `/api/evaluate`).
 */
export async function getParamountCards(
  claimId: string,
): Promise<{ cards: FullCard[]; error: string | null }> {
  // Two-step query for the cross-schema join: PostgREST cannot resolve
  // embedded joins when .schema('suspicion') is active because the target
  // (`public.cards`) lives in a different schema. Same pattern as
  // fetchClaimDeck in $lib/server/cards.ts. Step 1: paramount card_ids from
  // suspicion.claim_cards. Step 2: full FullCard rows from public.cards.
  const supabase = getSupabase();

  const { data: claimRows, error: claimErr } = await supabase
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id')
    .eq('claim_id', claimId)
    .eq('is_paramount', true);

  if (claimErr) {
    console.error('[claims] getParamountCards (step 1) failed:', claimErr.message);
    return { cards: [], error: 'Failed to fetch paramount cards' };
  }

  const cardIds = (claimRows ?? []).map((r) => (r as { card_id: string }).card_id);
  if (cardIds.length === 0) {
    return { cards: [], error: null };
  }

  const { data: cardRows, error: cardErr } = await supabase
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .in('objectID', cardIds)
    .is('deleted_at', null);

  if (cardErr) {
    console.error('[claims] getParamountCards (step 2) failed:', cardErr.message);
    return { cards: [], error: 'Failed to fetch paramount cards' };
  }

  const cards = (cardRows ?? []) as FullCard[];

  // Consistency check: every claim_cards.is_paramount row should resolve to a
  // live public.cards row. The on_card_soft_delete trigger
  // (20260423115705_remove_soft_deleted_cards_from_claim_cards.sql) removes
  // claim_cards entries when their source card is soft-deleted, so a count
  // mismatch here means either the trigger fired between step 1 and step 2
  // (race window) OR the trigger is missing/disabled and we're seeing a
  // genuine consistency violation. Either way, the cover letter must surface
  // every paramount card per AGENTS.md Invariant #8 — failing loud is the
  // correct response. Silently emitting a partial brief lets a recruiter-
  // unsafe artifact ship.
  if (cards.length !== cardIds.length) {
    const present = new Set(cards.map((c) => c.objectID));
    const missing = cardIds.filter((id) => !present.has(id));
    console.error(
      '[claims] getParamountCards: paramount source rows missing for claim',
      claimId,
      '— missing card_ids:',
      missing,
    );
    return {
      cards: [],
      error: 'Paramount source rows missing — pipeline must reseed',
    };
  }

  return { cards, error: null };
}
