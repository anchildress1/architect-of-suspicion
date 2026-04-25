import { getSupabase } from '$lib/server/supabase';
import type { ClaimCardEntry } from '$lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClaimCardRow = {
  card_id: string;
  ambiguity: number;
  surprise: number;
  rewritten_blurb: string;
};

type PublicCardRow = {
  objectID: string;
  title: string;
  category: string;
};

/**
 * Fetch the deck of cards for an active claim. Two-step query: suspicion.claim_cards
 * then public.cards. PostgREST cannot resolve cross-schema embedded joins when
 * .schema('suspicion') is active — the join must be done in application code.
 *
 * Cards return in Witness-mode order: least-charged (lowest ambiguity * surprise)
 * first. Excluded card IDs are UUID-validated before use in the query.
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
  const db = getSupabase();

  let claimQuery = db
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id, ambiguity, surprise, rewritten_blurb')
    .eq('claim_id', claimId);

  if (safeExclude.length > 0) {
    claimQuery = claimQuery.not('card_id', 'in', `(${safeExclude.join(',')})`);
  }

  const { data: claimRows, error: claimError } = await claimQuery;
  if (claimError) {
    console.error('[cards] fetchClaimDeck failed:', claimError.message);
    return { cards: [], error: 'Failed to fetch deck' };
  }
  if (!claimRows || claimRows.length === 0) {
    return { cards: [], error: null };
  }

  const cardIds = (claimRows as ClaimCardRow[]).map((r) => r.card_id);

  const { data: cardRows, error: cardError } = await db
    .from('cards')
    .select('objectID, title, category')
    .in('objectID', cardIds)
    .eq('category', category)
    .is('deleted_at', null);

  if (cardError) {
    console.error('[cards] fetchClaimDeck card lookup failed:', cardError.message);
    return { cards: [], error: 'Failed to fetch deck' };
  }

  const cardMap = new Map<string, PublicCardRow>(
    (cardRows as PublicCardRow[]).map((c) => [c.objectID, c]),
  );

  const cards: ClaimCardEntry[] = [];
  for (const row of claimRows as ClaimCardRow[]) {
    const card = cardMap.get(row.card_id);
    if (!card) continue;
    cards.push({
      objectID: card.objectID,
      title: card.title,
      blurb: row.rewritten_blurb,
      category: card.category,
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
