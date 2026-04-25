import { getSupabase } from '$lib/server/supabase';
import type { Claim } from '$lib/types';

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
