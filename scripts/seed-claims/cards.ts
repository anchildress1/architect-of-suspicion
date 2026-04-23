/** Load and filter the card corpus for the claim engine. */

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './clients';
import type { CardRow } from './types';

export function seedSupabase() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
  );
}

/** Pull every card eligible for gameplay — signal > 2, not soft-deleted,
 *  excluding the 'About' meta-category. The claim engine scores against this pool. */
export async function loadEligibleCards(signalThreshold: number): Promise<CardRow[]> {
  const supabase = seedSupabase();
  const { data, error } = await supabase
    .from('cards')
    .select('objectID, title, blurb, category, signal, fact')
    .is('deleted_at', null)
    .gt('signal', signalThreshold)
    .neq('category', 'About');

  if (error) throw new Error(`Failed to load cards: ${error.message}`);
  return (data ?? []) as CardRow[];
}

/** Format the corpus as a compact text block for prompt injection. */
export function formatCardCorpus(cards: CardRow[]): string {
  return cards
    .map(
      (c, i) =>
        `[${i + 1}] id=${c.objectID} | ${c.category} | "${c.title}"\n    blurb: ${c.blurb}\n    fact: ${c.fact ?? '(none)'}`,
    )
    .join('\n\n');
}
