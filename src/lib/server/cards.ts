import { getSupabase } from '$lib/server/supabase';
import type { Card } from '$lib/types';

/** Safe fields to return — never expose fact, tags, projects, url, or timestamps. */
const SAFE_FIELDS = 'objectID, title, blurb, category, signal';

/**
 * Fetch cards from Supabase by category, excluding previously collected IDs.
 * Returns all matching cards shuffled; caller decides how many to take.
 */
export async function fetchCardsByCategory(
  category: string,
  exclude: string[] = [],
): Promise<{ cards: Card[]; error: string | null }> {
  let query = getSupabase()
    .from('cards')
    .select(SAFE_FIELDS)
    .eq('category', category)
    .gt('signal', 2)
    .is('deleted_at', null)
    .limit(50);

  if (exclude.length > 0) {
    query = query.not('objectID', 'in', `(${exclude.join(',')})`);
  }

  const { data, error } = await query;

  if (error) {
    return { cards: [], error: 'Failed to fetch cards' };
  }

  // Shuffle results
  const cards = (data ?? []).sort(() => Math.random() - 0.5) as Card[];
  return { cards, error: null };
}
