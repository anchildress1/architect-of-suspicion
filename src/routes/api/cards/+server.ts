import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchClaimDeck } from '$lib/server/cards';

/**
 * GET /api/cards?claim_id=...&category=...&exclude=id1,id2
 *
 * Returns the witness-ordered deck for an active claim, restricted to one
 * room category, with picked card IDs excluded. Order is least-charged first
 * (lowest ambiguity * surprise) → most-charged last.
 */
export const GET: RequestHandler = async ({ url }) => {
  const claimId = url.searchParams.get('claim_id');
  const category = url.searchParams.get('category');
  if (!claimId) error(400, 'Missing required parameter: claim_id');
  if (!category) error(400, 'Missing required parameter: category');

  const excludeParam = url.searchParams.get('exclude');
  const exclude = excludeParam ? excludeParam.split(',').filter(Boolean) : [];

  const { cards, error: fetchError } = await fetchClaimDeck(claimId, category, exclude);
  if (fetchError) {
    error(500, fetchError);
  }

  return json({ cards });
};
