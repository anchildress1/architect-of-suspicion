import type { PageServerLoad } from './$types';
import { fetchClaimCategoryCounts } from '$lib/server/cards';
import { SESSION_ID_COOKIE } from '$lib/server/sessionCapability';
import { getSupabase } from '$lib/server/supabase';
import { isUuid } from '$lib/server/validation';

/**
 * Fetch per-category deck sizes for the current session's claim so the
 * mansion can mark a chamber as exhausted once every card in that
 * category has been ruled.
 *
 * Lookups run with whatever session cookie is present. If the cookie is
 * missing or invalid, return empty counts — the client redirects to /
 * on missing session anyway.
 */
export const load: PageServerLoad = async ({ cookies }) => {
  const sessionId = cookies.get(SESSION_ID_COOKIE);
  if (!sessionId || !isUuid(sessionId)) {
    return { categoryCounts: {} as Record<string, number> };
  }

  const { data, error: sessErr } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .select('claim_id')
    .eq('session_id', sessionId)
    .maybeSingle<{ claim_id: string | null }>();

  if (sessErr || !data?.claim_id) {
    return { categoryCounts: {} as Record<string, number> };
  }

  const { counts } = await fetchClaimCategoryCounts(data.claim_id);
  return { categoryCounts: counts };
};
