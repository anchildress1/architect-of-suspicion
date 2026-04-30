import type { PageServerLoad } from './$types';
import { fetchClaimCategoryCounts } from '$lib/server/cards';
import { loadSessionCapability } from '$lib/server/sessionCapability';

/**
 * Fetch per-category deck sizes for the current session's claim so the
 * mansion can mark a chamber as exhausted once every card in that
 * category has been ruled.
 *
 * Capability check is mandatory: looking up by `session_id` cookie alone
 * would let a forged or guessed UUID read another session's claim. The
 * capability hash compare is the same gate every other server route
 * uses. On any failure the client redirects to / on missing session, so
 * we swallow the thrown 401 and return empty counts.
 */
export const load: PageServerLoad = async ({ cookies }) => {
  let claimId: string;
  try {
    claimId = (await loadSessionCapability(cookies)).claimId;
  } catch {
    return { categoryCounts: {} as Record<string, number> };
  }
  const { counts } = await fetchClaimCategoryCounts(claimId);
  return { categoryCounts: counts };
};
