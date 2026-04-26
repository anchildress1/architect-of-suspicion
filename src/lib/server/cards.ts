import { getSupabase } from '$lib/server/supabase';
import type { ClaimCardEntry } from '$lib/types';
import { isUuid } from '$lib/server/validation';

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
  if (!isUuid(claimId)) {
    return { cards: [], error: 'Invalid claim_id' };
  }
  const safeExclude = exclude.filter((id) => isUuid(id));
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

/**
 * Per-category card counts for a claim, used by the mansion to mark a
 * chamber as exhausted once every card in that category has been ruled.
 *
 * Two-step query for the same cross-schema reason as fetchClaimDeck:
 * PostgREST cannot resolve embedded joins when .schema('suspicion') is
 * active, so the join happens in application code.
 */
export async function fetchClaimCategoryCounts(
  claimId: string,
): Promise<{ counts: Record<string, number>; error: string | null }> {
  if (!isUuid(claimId)) return { counts: {}, error: 'Invalid claim_id' };
  const db = getSupabase();

  const { data: claimRows, error: claimError } = await db
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id')
    .eq('claim_id', claimId);

  if (claimError) {
    console.error('[cards] fetchClaimCategoryCounts failed:', claimError.message);
    return { counts: {}, error: 'Failed to fetch category counts' };
  }
  if (!claimRows || claimRows.length === 0) return { counts: {}, error: null };

  const cardIds = (claimRows as Array<{ card_id: string }>).map((r) => r.card_id);

  const { data: cardRows, error: cardError } = await db
    .from('cards')
    .select('category')
    .in('objectID', cardIds)
    .is('deleted_at', null);

  if (cardError) {
    console.error('[cards] category lookup failed:', cardError.message);
    return { counts: {}, error: 'Failed to fetch category counts' };
  }

  const counts: Record<string, number> = {};
  for (const row of (cardRows as Array<{ category: string }>) ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return { counts, error: null };
}

/** Total claim_cards rows for a claim — used for room-level pacing telemetry. */
export async function fetchClaimDeckSize(
  claimId: string,
): Promise<{ count: number; error: string | null }> {
  if (!isUuid(claimId)) return { count: 0, error: 'Invalid claim_id' };
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
