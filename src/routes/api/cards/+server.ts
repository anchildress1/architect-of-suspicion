import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCardsByCategory } from '$lib/server/cards';

export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category');
  if (!category) {
    error(400, 'Missing required parameter: category');
  }

  const excludeParam = url.searchParams.get('exclude');
  const exclude = excludeParam ? excludeParam.split(',').filter(Boolean) : [];

  const { cards: allCards, error: fetchError } = await fetchCardsByCategory(category, exclude);

  if (fetchError) {
    error(500, fetchError);
  }

  return json({ cards: allCards.slice(0, 6) });
};
