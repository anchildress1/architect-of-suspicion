import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pickRandomClaim } from '$lib/server/claims';

/** GET /api/claim — picks one claim at random from suspicion.claims.
 *  Used by the Summons screen on first load. */
export const GET: RequestHandler = async () => {
  const { claim, error: err } = await pickRandomClaim();
  if (err || !claim) {
    error(503, err ?? 'No claims available');
  }
  return json({ id: claim.id, text: claim.text });
};
