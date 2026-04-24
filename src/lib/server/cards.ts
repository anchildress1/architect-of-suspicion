import { getSupabase } from '$lib/server/supabase';
import type { ClaimCardEntry } from '$lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch the deck of cards for an active claim, joined with the player-visible
 * fields from public.cards. Cards return in Witness-mode order: least-charged
 * (lowest ambiguity * surprise) first, most-charged last.
 *
 * The `category` filter restricts to a single room. Picked card IDs are
 * excluded to keep the queue tight as the player progresses.
 */
export async function fetchClaimDeck(
  claimId: string,
  category: string,
  exclude: string[] = [],
): Promise<{ cards: ClaimCardEntry[]; error: string | null }> {
  if (!UUID_RE.test(claimId)) {
    return { cards: [], error: 'Invalid claim_id' };
  }
  const safeExclude = exclude.filter((id) => UUID_RE.test(id));

  let query = getSupabase()
    .schema('suspicion')
    .from('claim_cards')
    .select(
      `card_id, ambiguity, surprise, rewritten_blurb,
       card:cards!claim_cards_card_id_fkey(objectID, title, category, deleted_at)`,
    )
    .eq('claim_id', claimId);

  if (safeExclude.length > 0) {
    query = query.not('card_id', 'in', `(${safeExclude.join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    return { cards: [], error: 'Failed to fetch deck' };
  }

  type Row = {
    card_id: string;
    ambiguity: number;
    surprise: number;
    rewritten_blurb: string;
    card:
      | {
          objectID: string;
          title: string;
          category: string;
          deleted_at: string | null;
        }
      | {
          objectID: string;
          title: string;
          category: string;
          deleted_at: string | null;
        }[]
      | null;
  };

  const cards: ClaimCardEntry[] = [];
  for (const row of (data ?? []) as Row[]) {
    const inner = Array.isArray(row.card) ? row.card[0] : row.card;
    if (!inner || inner.deleted_at !== null) continue;
    if (inner.category !== category) continue;
    cards.push({
      objectID: inner.objectID,
      title: inner.title,
      blurb: row.rewritten_blurb,
      category: inner.category,
      weight: row.ambiguity * row.surprise,
    });
  }

  // Witness mode: least-charged exhibits called first.
  cards.sort((a, b) => a.weight - b.weight);

  return { cards, error: null };
}

/** Total claim_cards rows for a claim — used for room-level pacing telemetry. */
export async function fetchClaimDeckSize(claimId: string): Promise<number> {
  if (!UUID_RE.test(claimId)) return 0;
  const { count, error } = await getSupabase()
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id', { count: 'exact', head: true })
    .eq('claim_id', claimId);
  if (error) return 0;
  return count ?? 0;
}
