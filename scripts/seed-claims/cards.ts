/** Load and filter the card corpus for the claim engine. */

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './clients';
import type { CardRow } from './types';

export function seedSupabase() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
}

/** Pull every card eligible for gameplay — signal > 2, not soft-deleted,
 *  excluding the 'About' meta-category. The claim engine scores against this pool. */
export async function loadEligibleCards(signalThreshold: number): Promise<CardRow[]> {
  const supabase = seedSupabase();
  const { data, error } = await supabase
    .from('cards')
    .select('objectID, title, blurb, category, signal, fact, created_at, tags, projects')
    .is('deleted_at', null)
    .gt('signal', signalThreshold)
    .neq('category', 'About');

  if (error) throw new Error(`Failed to load cards: ${error.message}`);
  const rows = (data ?? []) as CardRow[];
  if (rows.length === 0) {
    console.warn('[cards] 0 eligible cards returned — check RLS policies and signal threshold');
  }
  return rows;
}

/** Flatten the hierarchical tags to a single list, preferring lvl1 (more
 *  specific) entries and falling back to lvl0. Used so the scoring model can
 *  spot "DEV Challenge > X" or "THD > X" without learning the jsonb shape. */
function flattenTags(tags: CardRow['tags']): string[] {
  if (!tags) return [];
  const lvl1 = Array.isArray(tags.lvl1) ? tags.lvl1 : [];
  const lvl0 = Array.isArray(tags.lvl0) ? tags.lvl0 : [];
  return lvl1.length > 0 ? lvl1 : lvl0;
}

/** Format the corpus as a compact text block for prompt injection. Includes
 *  tags and projects so downstream passes can read work/play + deadline
 *  signals (DEV Challenge, THD, CheckMark, etc.) directly. */
export function formatCardCorpus(cards: CardRow[]): string {
  return cards
    .map((c, i) => {
      const tagList = flattenTags(c.tags);
      const projectList = c.projects ?? [];
      const tagLine = tagList.length > 0 ? `\n    tags: ${tagList.join(', ')}` : '';
      const projectLine = projectList.length > 0 ? `\n    projects: ${projectList.join(', ')}` : '';
      return `[${i + 1}] id=${c.objectID} | ${c.category} | "${c.title}"\n    blurb: ${c.blurb}\n    fact: ${c.fact ?? '(none)'}${tagLine}${projectLine}`;
    })
    .join('\n\n');
}
