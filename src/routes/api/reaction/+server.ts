import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification, FullCard } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildReactionPrompt } from '$lib/server/prompts/evaluate';
import { rateLimitGuard } from '$lib/server/rateLimit';
import { loadSessionCapability } from '$lib/server/sessionCapability';
import { isUuid, parseJsonBodyWithLimit } from '$lib/server/validation';

const FALLBACK_REACTION =
  'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.';

const MAX_REACTION_REQUEST_BYTES = 1_024;
// How long a generation request holds the lock before another request can
// claim it. Sub-3s for Sonnet 4.6 under normal conditions; 60s gives
// generous headroom for retries on slow networks before treating the
// previous request as crashed/abandoned.
const REACTION_LOCK_TIMEOUT_MS = 60_000;

interface ReactionRequest {
  pick_id?: string;
}

interface PickRow {
  id: string;
  session_id: string;
  card_id: string;
  classification: Classification;
  ai_score: number;
  ai_reaction_text: string | null;
}

async function loadPick(pickId: string, sessionId: string): Promise<PickRow> {
  const { data, error: pickErr } = await getSupabase()
    .schema('suspicion')
    .from('picks')
    .select('id, session_id, card_id, classification, ai_score, ai_reaction_text')
    .eq('id', pickId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (pickErr) {
    console.error('[reaction] picks read failed:', pickErr.message);
    error(500, 'Failed to read pick');
  }
  if (!data) error(404, 'Pick not found for this session');
  return data as PickRow;
}

/**
 * Whether the player's classification aligns with the card's directional
 * truth. Server-only signal — used to set the Architect's tone (grudgingly
 * acknowledge vs needle the reading) without revealing correctness in the
 * output text.
 *
 *   - PROOF + positive ai_score (card supports the surface claim)  → aligned
 *   - OBJECTION + negative ai_score (card challenges the claim)    → aligned
 *   - mismatched signs                                              → strained
 *   - DISMISS                                                       → null
 *
 * A near-zero ai_score (|x| < 0.1) is treated as "neutral evidence" —
 * neither aligns nor strains, so we return null and the prompt's neutral
 * acknowledgment branch handles it.
 */
function readingAlignment(
  classification: Classification,
  aiScore: number,
): 'aligned' | 'strained' | null {
  if (classification === 'dismiss') return null;
  if (Math.abs(aiScore) < 0.1) return null;
  const cardSupportsClaim = aiScore > 0;
  const playerCalledProof = classification === 'proof';
  return cardSupportsClaim === playerCalledProof ? 'aligned' : 'strained';
}

async function loadFullCard(cardId: string): Promise<FullCard> {
  const { data, error: cardError } = await getSupabase()
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .eq('objectID', cardId)
    .is('deleted_at', null)
    .maybeSingle();

  if (cardError) {
    console.error('[reaction] cards read failed:', cardError.message);
    error(500, 'Failed to read card');
  }
  if (!data) error(404, 'Card not found');
  return data as FullCard;
}

async function loadHistory(
  sessionId: string,
  excludePickId: string,
): Promise<Array<{ card_id: string; card_title: string; classification: Classification }>> {
  const supabase = getSupabase();
  const { data: picks, error: picksErr } = await supabase
    .schema('suspicion')
    .from('picks')
    .select('id, card_id, classification')
    .eq('session_id', sessionId)
    .neq('id', excludePickId)
    .order('created_at', { ascending: true });

  if (picksErr) {
    console.error('[reaction] picks history read failed:', picksErr.message);
    error(500, 'Failed to read pick history');
  }

  const rows = picks ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.card_id as string);
  const { data: titleRows, error: titlesErr } = await supabase
    .from('cards')
    .select('objectID, title')
    .in('objectID', ids);

  if (titlesErr) {
    console.error('[reaction] history titles read failed:', titlesErr.message);
    error(500, 'Failed to read pick history titles');
  }

  const titlesById = Object.fromEntries(
    (titleRows ?? []).map((r) => [r.objectID as string, r.title as string]),
  );

  return rows.map((p) => ({
    card_id: p.card_id as string,
    card_title: titlesById[p.card_id as string] ?? '(unknown)',
    classification: p.classification as Classification,
  }));
}

async function persistReactionText(pickId: string, text: string): Promise<void> {
  // Clear the generation lock alongside the text so a future read sees a
  // clean state — durable evidence the generation completed.
  const { error: updateErr } = await getSupabase()
    .schema('suspicion')
    .from('picks')
    .update({ ai_reaction_text: text, reaction_locked_at: null })
    .eq('id', pickId);

  if (updateErr) {
    // Log only — the player already saw the reaction stream; failing to
    // persist is a downstream-analytics problem, not a UX one.
    console.error('[reaction] failed to persist reaction text:', updateErr.message);
  }
}

/**
 * Atomically claim ownership of reaction generation for this pick. Returns
 * `true` if this request now owns the generation, `false` if another request
 * holds the lock (and we must NOT call Claude — see the migration comment
 * for the race we're preventing).
 *
 * Implemented as an RPC (suspicion.try_claim_reaction_lock) rather than a
 * builder-chain UPDATE: PostgREST validates column names in chain UPDATEs
 * against its schema cache, and a stale cache after recent DDL surfaces as
 * "column picks.reaction_locked_at does not exist" even when the column is
 * live in Postgres. RPC bodies are opaque to PostgREST's column validator,
 * so the cache state is irrelevant. The function does the same conditional
 * UPDATE — only succeeds when the row is unclaimed (ai_reaction_text NULL
 * AND reaction_locked_at NULL or older than the lock timeout) — and returns
 * the pick id when the claim succeeds, empty set when another request
 * holds the lock.
 */
async function tryClaimReactionLock(pickId: string): Promise<boolean> {
  const lockTimeoutSeconds = Math.round(REACTION_LOCK_TIMEOUT_MS / 1000);

  const { data, error: claimErr } = await getSupabase()
    .schema('suspicion')
    .rpc('try_claim_reaction_lock', {
      p_pick_id: pickId,
      p_lock_timeout_seconds: lockTimeoutSeconds,
    });

  if (claimErr) {
    console.error('[reaction] lock claim RPC failed:', claimErr.message);
    error(500, 'Failed to claim reaction generation lock');
  }

  return Array.isArray(data) && data.length > 0;
}

export const POST: RequestHandler = async ({ request, getClientAddress, cookies }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const session = await loadSessionCapability(cookies);
  const body = await parseJsonBodyWithLimit<ReactionRequest>(request, MAX_REACTION_REQUEST_BYTES);

  if (!body.pick_id || typeof body.pick_id !== 'string' || !isUuid(body.pick_id)) {
    error(400, 'Missing or invalid pick_id');
  }

  const pick = await loadPick(body.pick_id, session.sessionId);

  // Idempotency layer 1: completed generation.
  // If the reaction was already generated and persisted (retry after a
  // dropped stream, double-click, etc.), stream the cached text back
  // instead of burning another LLM call.
  if (pick.ai_reaction_text && pick.ai_reaction_text.length > 0) {
    return new Response(pick.ai_reaction_text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Reaction-Cached': '1',
      },
    });
  }

  // Idempotency layer 2: in-flight generation.
  // Atomically claim ownership of generation. If another request already
  // owns the lock, we MUST NOT call Claude — that's the duplicate-spend
  // race the lock exists to prevent. Re-read the pick once in case the
  // text landed in the gap between our load and our claim attempt; if
  // still pending, return 409 so the client knows to retry.
  const claimed = await tryClaimReactionLock(pick.id);
  if (!claimed) {
    const refreshed = await loadPick(pick.id, session.sessionId);
    if (refreshed.ai_reaction_text && refreshed.ai_reaction_text.length > 0) {
      return new Response(refreshed.ai_reaction_text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Reaction-Cached': '1',
        },
      });
    }
    return new Response(FALLBACK_REACTION, {
      status: 409,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Reaction-In-Flight': '1',
      },
    });
  }

  const [card, history] = await Promise.all([
    loadFullCard(pick.card_id),
    loadHistory(session.sessionId, pick.id),
  ]);

  const alignment = readingAlignment(pick.classification, pick.ai_score);
  const userPrompt = buildReactionPrompt(
    session.claimText,
    card,
    pick.classification,
    history,
    alignment,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let collected = '';
      let streamed = false;

      try {
        const client = getClaudeClient();
        // Sonnet 4.6 over Haiku 4.5: the per-pick prompt is doing nuanced
        // tone work — grudgingly acknowledge when the player's reading
        // aligns with the card's direction, needle the FRAME (never
        // Ashley) when it strains, and stay anchored on visible card
        // text without inventing category splits. Haiku followed those
        // rules too literally and produced reactions that read as
        // corrections of the player even when the player was right.
        // Sonnet handles the alignment-tone branching with the subtlety
        // the game needs. Latency cost (~3s vs ~1s) is absorbed by the
        // streaming path — the player advances on /api/evaluate and
        // the reaction streams in async.
        const messageStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: [
            {
              type: 'text',
              text: ARCHITECT_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userPrompt }],
        });

        messageStream.on('text', (delta) => {
          collected += delta;
          streamed = true;
          controller.enqueue(encoder.encode(delta));
        });

        await messageStream.finalMessage();

        const finalText = collected.trim();
        if (!finalText) {
          if (!streamed) controller.enqueue(encoder.encode(FALLBACK_REACTION));
          controller.close();
          return;
        }

        controller.close();
        // Fire-and-forget persist — don't block stream close on the DB write.
        void persistReactionText(pick.id, finalText);
      } catch (err) {
        console.error(
          '[reaction] Claude reaction call failed:',
          err instanceof Error ? err.message : err,
        );
        if (!streamed) controller.enqueue(encoder.encode(FALLBACK_REACTION));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
};
