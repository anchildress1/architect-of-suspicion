import type { PageServerLoad } from './$types';
import { getRoomBySlug } from '$lib/rooms';
import { fetchCardsByCategory } from '$lib/server/cards';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
  const room = getRoomBySlug(params.slug);
  if (!room?.isPlayable) {
    error(404, 'Room not found');
  }

  const exclude = url.searchParams.get('exclude')?.split(',').filter(Boolean) ?? [];

  const { cards: allCards, error: fetchError } = await fetchCardsByCategory(room.category, exclude);

  if (fetchError) {
    error(500, fetchError);
  }

  const cards = allCards.slice(0, 6);
  const pool = allCards.slice(6);

  return { room, cards, pool };
};
