import { getSupabase } from '$lib/server/supabase';
import type { ClaimCardEntry } from '$lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JoinedCard = {
  objectID: string;
  title: string;
  category: string;
  deleted_at: string | null;
};

type ClaimCardRow = {
  card_id: string;
  ambiguity: number;
  surprise: number;
  rewritten_blurb: string;
  card: JoinedCard | JoinedCard[] | null;
};

/**
 * Fetch the deck of cards for an active claim, joined with the player-visible
 * fields from public.cards. Cards return in Witness-mode order: least-charged
 * (lowest ambiguity * surprise) first, most-charged last.
 *
 * Category and soft-delete filters push down into the embedded filter so the
 * DB doesn't ship rows we'll drop in JS. Excluded card IDs are UUID-validated
 * to keep the `not(in ...)` clause injection-free.
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
       card:cards!claim_cards_card_id_fkey!inner(objectID, title, category, deleted_at)`,
    )
    .eq('claim_id', claimId)
    .eq('card.category', category)
    .is('card.deleted_at', null);

  if (safeExclude.length > 0) {
    query = query.not('card_id', 'in', `(${safeExclude.join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[cards] fetchClaimDeck failed:', error.message);
    return { cards: [], error: 'Failed to fetch deck' };
  }

  const cards: ClaimCardEntry[] = [];
  for (const row of (data ?? []) as ClaimCardRow[]) {
    const inner = Array.isArray(row.card) ? row.card[0] : row.card;
    if (!inner) continue;
    cards.push({
      objectID: inner.objectID,
      title: inner.title,
      blurb: row.rewritten_blurb,
      category: inner.category,
      weight: row.ambiguity * row.surprise,
    });
  }

  // Witness mode: least-charged exhibits called first. Stable sort with
  // card_id tiebreak keeps the order deterministic across engines.
  cards.sort((a, b) => a.weight - b.weight || a.objectID.localeCompare(b.objectID));

  return { cards, error: null };
}

/** Total claim_cards rows for a claim — used for room-level pacing telemetry. */
export async function fetchClaimDeckSize(
  claimId: string,
): Promise<{ count: number; error: string | null }> {
  if (!UUID_RE.test(claimId)) return { count: 0, error: 'Invalid claim_id' };
  const { count, error } = await getSupabase()
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id', { count: 'exact', head: true })
    .eq('claim_id', claimId);
  if (error) {
    console.error('[cards] fetchClaimDeckSize failed:', error.message);
    return { count: 0, error: 'Failed to fetch deck size' };
  }
  return { count: count ?? 0, error: null };
}
