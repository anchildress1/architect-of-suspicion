import type { PageServerLoad } from './$types';
import { getRoomBySlug } from '$lib/rooms';
import { fetchClaimDeck } from '$lib/server/cards';
import { error } from '@sveltejs/kit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, url }) => {
  const room = getRoomBySlug(params.slug);
  if (!room?.isPlayable) {
    error(404, 'Room not found');
  }

  const claimId = url.searchParams.get('claim_id');
  if (!claimId || !UUID_RE.test(claimId)) {
    error(400, 'Missing or invalid claim_id');
  }

  const exclude = url.searchParams.get('exclude')?.split(',').filter(Boolean) ?? [];

  const { cards, error: fetchError } = await fetchClaimDeck(claimId, room.category, exclude);

  if (fetchError) {
    error(500, fetchError);
  }

  return { room, cards };
};
