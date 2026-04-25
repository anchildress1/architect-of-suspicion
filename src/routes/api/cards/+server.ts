import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchClaimDeck } from '$lib/server/cards';
import { rateLimitGuard } from '$lib/server/rateLimit';
import { isUuid } from '$lib/server/validation';
import { rooms } from '$lib/rooms';

const VALID_CATEGORIES = new Set(
  rooms.filter((room) => room.isPlayable).map((room) => room.category),
);

/**
 * GET /api/cards?claim_id=...&category=...&exclude=id1,id2
 *
 * Returns the witness-ordered deck for an active claim, restricted to one
 * room category, with picked card IDs excluded. Order is least-charged first
 * (lowest ambiguity * surprise) → most-charged last.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const claimId = url.searchParams.get('claim_id');
  const category = url.searchParams.get('category');

  if (!claimId || !isUuid(claimId)) {
    error(400, 'Missing required parameter: claim_id');
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    error(400, 'Missing required parameter: category');
  }

  const excludeParam = url.searchParams.get('exclude');
  const exclude = excludeParam ? excludeParam.split(',').filter((id) => isUuid(id)) : [];

  const { cards, error: fetchError } = await fetchClaimDeck(claimId, category, exclude);
  if (fetchError) {
    error(500, fetchError);
  }

  return json({ cards });
};
