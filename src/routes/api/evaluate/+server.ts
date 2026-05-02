import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification, EvaluateConflictResponse, FullCard } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildReactionPrompt } from '$lib/server/prompts/evaluate';
import { rateLimitGuard } from '$lib/server/rateLimit';
import { applyAttentionDelta, BASELINE_ATTENTION, clampAttention } from '$lib/attention';
import { loadSessionCapability } from '$lib/server/sessionCapability';
import { isUuid, parseJsonBodyWithLimit } from '$lib/server/validation';

const FALLBACK_REACTION =
  'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.';

interface EvaluateRequest {
  card_id?: string;
  classification?: string;
}

interface ValidatedInput {
  cardId: string;
  classification: Classification;
}

const VALID_CLASSIFICATIONS: ReadonlySet<Classification> = new Set([
  'proof',
  'objection',
  'dismiss',
]);

const CLASSIFICATION_SIGN: Record<Classification, number> = {
  proof: 1,
  objection: -1,
  dismiss: 0,
};

const MAX_EVALUATE_REQUEST_BYTES = 1_024;

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

async function parseAndValidate(request: Request): Promise<ValidatedInput> {
  const body = await parseJsonBodyWithLimit<EvaluateRequest>(request, MAX_EVALUATE_REQUEST_BYTES);

  const { card_id, classification } = body;

  if (!card_id || typeof card_id !== 'string' || !isUuid(card_id)) {
    error(400, 'Missing or invalid card_id');
  }
  if (!classification || !VALID_CLASSIFICATIONS.has(classification as Classification)) {
    error(400, 'classification must be "proof", "objection", or "dismiss"');
  }

  return {
    cardId: card_id,
    classification: classification as Classification,
  };
}

async function loadSeedScore(claimId: string, cardId: string): Promise<number> {
  const { data, error: pairErr } = await getSupabase()
    .schema('suspicion')
    .from('claim_cards')
    .select('ai_score')
    .eq('claim_id', claimId)
    .eq('card_id', cardId)
    .maybeSingle();

  if (pairErr) {
    console.error('[evaluate] claim_cards read failed:', pairErr.message);
    error(500, 'Failed to read claim_cards');
  }
  if (!data) error(404, 'Card not in this claim deck');

  return clampScore(data.ai_score);
}

async function loadFullCard(cardId: string): Promise<FullCard> {
  const { data, error: cardError } = await getSupabase()
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .eq('objectID', cardId)
    .is('deleted_at', null)
    .maybeSingle();

  if (cardError) {
    console.error('[evaluate] cards read failed:', cardError.message);
    error(500, 'Failed to read card');
  }
  if (!data) error(404, 'Card not found');
  return data as FullCard;
}

async function loadPickHistory(
  sessionId: string,
): Promise<Array<{ card_id: string; card_title: string; classification: Classification }>> {
  const supabase = getSupabase();
  const { data: picks, error: picksErr } = await supabase
    .schema('suspicion')
    .from('picks')
    .select('card_id, classification')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (picksErr) {
    console.error('[evaluate] picks history read failed:', picksErr.message);
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
    console.error('[evaluate] history titles read failed:', titlesErr.message);
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

async function loadCanonicalPick(
  sessionId: string,
  cardId: string,
): Promise<EvaluateConflictResponse> {
  const supabase = getSupabase();
  const suspicion = supabase.schema('suspicion');

  const [pickRes, sessionRes] = await Promise.all([
    suspicion
      .from('picks')
      .select('classification')
      .eq('session_id', sessionId)
      .eq('card_id', cardId)
      .maybeSingle(),
    suspicion.from('sessions').select('attention').eq('session_id', sessionId).maybeSingle(),
  ]);

  if (pickRes.error || !pickRes.data) {
    console.error(
      '[evaluate] canonical pick read failed:',
      pickRes.error?.message ?? 'no row returned for unique-conflict pick',
    );
    error(500, 'Failed to recover canonical pick after conflict');
  }
  if (sessionRes.error || !sessionRes.data) {
    console.error(
      '[evaluate] canonical attention read failed:',
      sessionRes.error?.message ?? 'session row missing',
    );
    error(500, 'Failed to recover canonical attention after conflict');
  }

  return {
    canonical: {
      classification: pickRes.data.classification as Classification,
      attention: clampAttention(
        typeof sessionRes.data.attention === 'number'
          ? sessionRes.data.attention
          : BASELINE_ATTENTION,
      ),
    },
  };
}

async function callReaction(
  claimText: string,
  card: FullCard,
  classification: Classification,
  history: Array<{ card_id: string; card_title: string; classification: Classification }>,
): Promise<{ text: string; ok: boolean }> {
  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      // Sonnet handles in-character voice + connecting evidence to the claim
      // measurably better than Haiku at this prompt size; Haiku tended toward
      // generic atmospheric filler despite the "name a SPECIFIC detail" rule.
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildReactionPrompt(claimText, card, classification, history) },
      ],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return text ? { text, ok: true } : { text: FALLBACK_REACTION, ok: false };
  } catch (err) {
    console.error(
      '[evaluate] Claude reaction call failed:',
      err instanceof Error ? err.message : err,
    );
    return { text: FALLBACK_REACTION, ok: false };
  }
}

export const POST: RequestHandler = async ({ request, getClientAddress, cookies }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const input = await parseAndValidate(request);
  const session = await loadSessionCapability(cookies);

  const [aiScore, card, history] = await Promise.all([
    loadSeedScore(session.claimId, input.cardId),
    loadFullCard(input.cardId),
    loadPickHistory(session.sessionId),
  ]);

  const reaction = await callReaction(session.claimText, card, input.classification, history);

  const persistedScore = input.classification === 'dismiss' ? 0 : aiScore;
  const rawDelta = CLASSIFICATION_SIGN[input.classification] * aiScore;
  const nextAttention = Math.round(
    clampAttention(applyAttentionDelta(session.attention, rawDelta)),
  );

  const supabase = getSupabase();
  const suspicion = supabase.schema('suspicion');

  // INVARIANT #4: write to suspicion.picks BEFORE returning. The unique
  // (session_id, card_id) constraint enforces Invariant #8 (classification is
  // permanent within a session) at the DB level — direct API calls cannot
  // re-rule a card.
  const { error: pickError } = await suspicion.from('picks').insert({
    session_id: session.sessionId,
    card_id: input.cardId,
    classification: input.classification,
    ai_score: persistedScore,
    ai_reaction_text: reaction.text,
  });

  if (pickError) {
    // 23505 = unique_violation: the card has already been ruled in this session.
    // Return the *canonical* pick + attention so the client can re-sync to the
    // server's truth instead of committing the attempted classification (which
    // may differ from what was actually persisted — see types.EvaluateConflictResponse).
    if ((pickError as { code?: string }).code === '23505') {
      const canonical = await loadCanonicalPick(session.sessionId, input.cardId);
      return json(canonical satisfies EvaluateConflictResponse, { status: 409 });
    }
    console.error('[evaluate] picks insert failed:', pickError.message);
    error(500, 'Failed to record pick');
  }

  const { error: attentionError } = await suspicion
    .from('sessions')
    .update({ attention: nextAttention, updated_at: new Date().toISOString() })
    .eq('session_id', session.sessionId);

  if (attentionError) {
    console.error('[evaluate] attention update failed:', attentionError.message);
    error(500, 'Failed to persist attention');
  }

  return json({
    ai_reaction: reaction.text,
    attention: nextAttention,
    reaction_fallback: !reaction.ok,
  });
};
