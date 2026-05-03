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

interface ReactionRequest {
  pick_id?: string;
}

interface PickRow {
  id: string;
  session_id: string;
  card_id: string;
  classification: Classification;
  ai_reaction_text: string | null;
}

async function loadPick(pickId: string, sessionId: string): Promise<PickRow> {
  const { data, error: pickErr } = await getSupabase()
    .schema('suspicion')
    .from('picks')
    .select('id, session_id, card_id, classification, ai_reaction_text')
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
  const { error: updateErr } = await getSupabase()
    .schema('suspicion')
    .from('picks')
    .update({ ai_reaction_text: text })
    .eq('id', pickId);

  if (updateErr) {
    // Log only — the player already saw the reaction stream; failing to
    // persist is a downstream-analytics problem, not a UX one.
    console.error('[reaction] failed to persist reaction text:', updateErr.message);
  }
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

  // Idempotency: if the reaction was already generated and persisted (retry
  // after a dropped stream, double-click, etc.), stream the cached text back
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

  const [card, history] = await Promise.all([
    loadFullCard(pick.card_id),
    loadHistory(session.sessionId, pick.id),
  ]);

  const userPrompt = buildReactionPrompt(session.claimText, card, pick.classification, history);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let collected = '';
      let streamed = false;

      try {
        const client = getClaudeClient();
        // Haiku 4.5 — picked over Sonnet 4.6 for ~2-3x lower latency on this
        // 1-2 sentence task. The post-recruiter-safety system prompt keeps
        // Haiku from drifting toward the generic atmospheric filler the
        // older prompt let through. cache_control marker is harmless at
        // current prompt sizes (sub-4096 tokens, below Haiku's caching
        // threshold) and auto-activates if the prompt grows past it.
        const messageStream = client.messages.stream({
          model: 'claude-haiku-4-5',
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
