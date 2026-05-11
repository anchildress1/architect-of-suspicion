import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification, FullCard } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildReactionPrompt } from '$lib/server/prompts/evaluate';
import { readingAlignment } from '$lib/server/readingAlignment';
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

interface ReactionLockClaim {
  lockedAt: string;
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

async function loadFullCard(cardId: string, claimId: string): Promise<FullCard> {
  const supabase = getSupabase();

  // The reaction prompt frames title+blurb as the "VISIBLE SURFACE" the model
  // and the player share — quoting source the player can't see breaks the
  // game's authority contract. The player sees rewritten_title and
  // rewritten_blurb from suspicion.claim_cards, so the FullCard handed to
  // the prompt must use the same values. Only `fact`, `category`, and
  // `signal` still come from public.cards.
  const [publicRes, claimRes] = await Promise.all([
    supabase
      .from('cards')
      .select('objectID, fact, category, signal')
      .eq('objectID', cardId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .schema('suspicion')
      .from('claim_cards')
      .select('rewritten_title, rewritten_blurb')
      .eq('claim_id', claimId)
      .eq('card_id', cardId)
      .maybeSingle(),
  ]);

  if (publicRes.error) {
    console.error('[reaction] cards read failed:', publicRes.error.message);
    error(500, 'Failed to read card');
  }
  if (!publicRes.data) error(404, 'Card not found');

  if (claimRes.error) {
    console.error('[reaction] claim_cards read failed:', claimRes.error.message);
    error(500, 'Failed to read card');
  }
  if (!claimRes.data) error(404, 'Card not found for this claim');

  const publicPart = publicRes.data as Omit<FullCard, 'title' | 'blurb'>;
  const { rewritten_title, rewritten_blurb } = claimRes.data as {
    rewritten_title: string;
    rewritten_blurb: string;
  };
  return { ...publicPart, title: rewritten_title, blurb: rewritten_blurb };
}

async function loadHistory(
  sessionId: string,
  excludePickId: string,
  claimId: string,
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
  // History titles come from suspicion.claim_cards.rewritten_title so the
  // model's references to prior exhibits match what the player actually saw
  // when they ruled them.
  const { data: titleRows, error: titlesErr } = await supabase
    .schema('suspicion')
    .from('claim_cards')
    .select('card_id, rewritten_title')
    .eq('claim_id', claimId)
    .in('card_id', ids);

  if (titlesErr) {
    console.error('[reaction] history titles read failed:', titlesErr.message);
    error(500, 'Failed to read pick history titles');
  }

  const titlesById = Object.fromEntries(
    (titleRows ?? []).map((r) => [r.card_id as string, r.rewritten_title as string]),
  );

  return rows.map((p) => ({
    card_id: p.card_id as string,
    card_title: titlesById[p.card_id as string] ?? '(unknown)',
    classification: p.classification as Classification,
  }));
}

async function completeReactionGeneration(
  pickId: string,
  lockedAt: string,
  text: string | null,
): Promise<boolean> {
  const { data, error: completeErr } = await getSupabase()
    .schema('suspicion')
    .rpc('complete_reaction_generation', {
      p_pick_id: pickId,
      p_locked_at: lockedAt,
      p_text: text,
    });

  if (completeErr) {
    console.error('[reaction] completion RPC failed:', completeErr.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * Atomically claim ownership of reaction generation for this pick. Returns the
 * lock timestamp if this request now owns generation, `null` if another
 * request holds the lock (and we must NOT call Claude — see the migration
 * comment for the race we're preventing).
 *
 * Implemented as an RPC (suspicion.try_claim_reaction_lock) rather than a
 * builder-chain UPDATE: PostgREST validates column names in chain UPDATEs
 * against its schema cache, and a stale cache after recent DDL surfaces as
 * "column picks.reaction_locked_at does not exist" even when the column is
 * live in Postgres. RPC bodies are opaque to PostgREST's column validator,
 * so the cache state is irrelevant. The function does the same conditional
 * UPDATE — only succeeds when the row is unclaimed (ai_reaction_text NULL
 * AND reaction_locked_at NULL or older than the lock timeout) — and returns
 * the precise lock timestamp when the claim succeeds, empty set when another
 * request holds the lock.
 */
async function tryClaimReactionLock(pickId: string): Promise<ReactionLockClaim | null> {
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

  if (!Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as { locked_at: string };
  return { lockedAt: row.locked_at };
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
  const claim = await tryClaimReactionLock(pick.id);
  if (!claim) {
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

  let card: FullCard;
  let history: Array<{ card_id: string; card_title: string; classification: Classification }>;
  try {
    [card, history] = await Promise.all([
      loadFullCard(pick.card_id, session.claimId),
      loadHistory(session.sessionId, pick.id, session.claimId),
    ]);
  } catch (err) {
    await completeReactionGeneration(pick.id, claim.lockedAt, null);
    throw err;
  }

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
        // tone work — sardonic recognition when the player's reading sits
        // with the card's dominant pull, surface the counter-pull (anchored
        // in visible title/blurb text) when it strains, and never
        // personify the card as a rival reader. Haiku followed earlier
        // shapes too literally and produced reactions that read as
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
          await completeReactionGeneration(pick.id, claim.lockedAt, null);
          if (!streamed) controller.enqueue(encoder.encode(FALLBACK_REACTION));
          controller.close();
          return;
        }

        await completeReactionGeneration(pick.id, claim.lockedAt, finalText);
        controller.close();
      } catch (err) {
        console.error(
          '[reaction] Claude reaction call failed:',
          err instanceof Error ? err.message : err,
        );
        await completeReactionGeneration(pick.id, claim.lockedAt, null);
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
