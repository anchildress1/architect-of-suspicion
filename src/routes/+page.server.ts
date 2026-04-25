import type { PageServerLoad } from './$types';
import { pickRandomClaim } from '$lib/server/claims';

/**
 * Resolve the summons claim during SSR so the dossier renders with content on
 * the first byte — no client-side fetch, no 503 in the browser console when
 * Supabase is unreachable.
 *
 * If the pick fails (e.g. Supabase down during LHCI) we return `{ claim: null }`
 * and the page shows a muted "docket unavailable" state rather than logging a
 * network error.
 */
export const load: PageServerLoad = async (_event) => {
  const { claim, error } = await pickRandomClaim();
  if (error || !claim) {
    return { claim: null };
  }
  return { claim };
};
