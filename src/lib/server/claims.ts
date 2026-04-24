import { getSupabase } from '$lib/server/supabase';
import type { Claim } from '$lib/types';

/** Pick one claim at random from suspicion.claims for a fresh session. */
export async function pickRandomClaim(): Promise<{ claim: Claim | null; error: string | null }> {
  const { data, error } = await getSupabase()
    .schema('suspicion')
    .from('claims')
    .select('id, claim_text');

  if (error) return { claim: null, error: 'Failed to fetch claims' };
  if (!data || data.length === 0) return { claim: null, error: 'No claims seeded' };

  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / data.length) * data.length;
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  const row = data[value % data.length];

  return {
    claim: { id: row.id as string, text: row.claim_text as string },
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

  if (error) return { claim: null, error: 'Failed to fetch claim' };
  if (!data) return { claim: null, error: 'Claim not found' };

  return {
    claim: { id: data.id as string, text: data.claim_text as string },
    error: null,
  };
}
