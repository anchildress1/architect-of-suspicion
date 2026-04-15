import { getSupabase } from '$lib/server/supabase';
import type { Card } from '$lib/types';

/** Safe fields to return — never expose fact, tags, projects, url, or timestamps. */
const SAFE_FIELDS = 'objectID, title, blurb, category, signal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Return an unbiased random integer in [0, length) using rejection sampling. */
function uniformRandomIndex(length: number): number {
  const limit = Math.floor(0x100000000 / length) * length;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= limit);
  return value % length;
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = uniformRandomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fetch cards from Supabase by category, excluding previously collected IDs.
 * Returns all matching cards shuffled; caller decides how many to take.
 */
export async function fetchCardsByCategory(
  category: string,
  exclude: string[] = [],
): Promise<{ cards: Card[]; error: string | null }> {
  const safeExclude = exclude.filter((id) => UUID_RE.test(id));

  let query = getSupabase()
    .from('cards')
    .select(SAFE_FIELDS)
    .eq('category', category)
    .gt('signal', 2)
    .is('deleted_at', null)
    .limit(50);

  if (safeExclude.length > 0) {
    query = query.not('objectID', 'in', `(${safeExclude.join(',')})`);
  }

  const { data, error } = await query;

  if (error) {
    return { cards: [], error: 'Failed to fetch cards' };
  }

  const cards = fisherYatesShuffle(data ?? []) as Card[];
  return { cards, error: null };
}
