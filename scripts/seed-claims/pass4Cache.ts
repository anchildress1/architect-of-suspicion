/** Pass 4 rewrite cache.
 *
 *  Pass 4 spends ~90% of the seed pipeline's per-run budget on per-card
 *  rewrites. After a prompt tweak the inputs to most (card, claim) pairs are
 *  identical to the prior run — re-running pays full cost to regenerate
 *  identical work. This cache short-circuits exact matches.
 *
 *  Cache key is a single sha256 of all inputs that affect the output:
 *  card content, claim text, hireable_truth, desired_verdict, the Pass 4
 *  system prompt (so prompt edits invalidate automatically), and the
 *  model id. Any drift falls through to a fresh LLM call.
 */

import { createHash } from 'node:crypto';
import { seedSupabase } from './cards';
import type { CardArgument, CardRow, GeneratedClaim } from './types';

/** Derive a short, stable version tag from the Pass 4 system prompt so cache
 *  entries auto-invalidate on prompt edits. Caller passes the prompt to
 *  avoid an import cycle with pass4-validate.ts. */
export function deriveCachePromptVersion(systemPrompt: string): string {
  return createHash('sha256').update(systemPrompt).digest('hex').slice(0, 16);
}

const SEPARATOR = '';

export function pass4CacheKey(
  card: CardRow,
  claim: GeneratedClaim,
  promptVersion: string,
  modelId: string,
): string {
  const components = [
    card.objectID,
    card.title,
    card.blurb,
    card.fact ?? '',
    JSON.stringify(card.tags ?? null),
    JSON.stringify(card.projects ?? null),
    claim.claim_text,
    claim.hireable_truth,
    claim.desired_verdict,
    promptVersion,
    modelId,
  ].join(SEPARATOR);
  return createHash('sha256').update(components).digest('hex');
}

interface CachedRow {
  input_hash: string;
  rewritten_blurb: string;
  ai_score: number | string;
  notes: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
}

export interface Pass4Cache {
  enabled: boolean;
  /** Look up cached arguments for a list of (card, claim) pairs. Returns a
   *  Map keyed by card_id with the cached CardArgument (isParamount=false —
   *  paramount selection happens post-batch). Cards not in the map are
   *  cache misses and need fresh LLM calls. */
  lookup(
    cards: CardRow[],
    claim: GeneratedClaim,
    modelId: string,
  ): Promise<Map<string, CardArgument>>;
  /** Persist a fresh LLM result for the given (card, claim) pair. */
  store(card: CardRow, claim: GeneratedClaim, modelId: string, arg: CardArgument): Promise<void>;
  stats(): CacheStats;
}

export interface BuildPass4CacheOptions {
  disabled: boolean;
  /** Hash derived from the active Pass 4 system prompt. Pass it via
   *  deriveCachePromptVersion(SYSTEM_PROMPT) at the call site. */
  promptVersion: string;
}

/** Build the cache. When `disabled=true` (env CLAIM_ENGINE_CACHE_DISABLED=1),
 *  every lookup is a miss and store is a no-op — useful when iterating on
 *  the Pass 4 prompt itself and you don't want stale results. */
export function buildPass4Cache(options: BuildPass4CacheOptions): Pass4Cache {
  const { disabled, promptVersion } = options;
  const counters: CacheStats = { hits: 0, misses: 0, writes: 0 };

  if (disabled) {
    return {
      enabled: false,
      async lookup() {
        return new Map();
      },
      async store() {
        // no-op
      },
      stats() {
        return { ...counters };
      },
    };
  }

  const supabase = seedSupabase();

  return {
    enabled: true,
    async lookup(cards, claim, modelId) {
      const hashByCardId = new Map<string, string>();
      const hashes: string[] = [];
      for (const card of cards) {
        const hash = pass4CacheKey(card, claim, promptVersion, modelId);
        hashByCardId.set(card.objectID, hash);
        hashes.push(hash);
      }

      const result = new Map<string, CardArgument>();
      if (hashes.length === 0) return result;

      const { data, error } = await supabase
        .schema('suspicion')
        .from('pass4_cache')
        .select('input_hash, rewritten_blurb, ai_score, notes')
        .in('input_hash', hashes);

      if (error) {
        // Fail open — log and treat the batch as a cache miss.
        console.warn(`[pass4-cache] lookup error: ${error.message} — falling through`);
        counters.misses += cards.length;
        return result;
      }

      const hashToCardId = new Map<string, string>();
      for (const [cardId, hash] of hashByCardId) hashToCardId.set(hash, cardId);

      for (const row of (data ?? []) as CachedRow[]) {
        const cardId = hashToCardId.get(row.input_hash);
        if (!cardId) continue;
        const aiScore = typeof row.ai_score === 'string' ? Number(row.ai_score) : row.ai_score;
        result.set(cardId, {
          rewrittenBlurb: row.rewritten_blurb,
          aiScore,
          notes: row.notes,
          isParamount: false,
        });
      }

      counters.hits += result.size;
      counters.misses += cards.length - result.size;
      return result;
    },
    async store(card, claim, modelId, arg) {
      const hash = pass4CacheKey(card, claim, promptVersion, modelId);
      const { error } = await supabase.schema('suspicion').from('pass4_cache').upsert({
        input_hash: hash,
        card_id: card.objectID,
        claim_text: claim.claim_text,
        prompt_version: promptVersion,
        model_id: modelId,
        rewritten_blurb: arg.rewrittenBlurb,
        ai_score: arg.aiScore,
        notes: arg.notes,
      });

      if (error) {
        // Don't fail the seed run on a write error — log and move on. Cache
        // is an optimization, not a correctness requirement.
        console.warn(
          `[pass4-cache] store error for card=${card.objectID} claim="${claim.claim_text}": ${error.message}`,
        );
        return;
      }
      counters.writes += 1;
    },
    stats() {
      return { ...counters };
    },
  };
}
