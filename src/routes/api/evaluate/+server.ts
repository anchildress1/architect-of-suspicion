import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification, FullCard } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { getClaimById } from '$lib/server/claims';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildReactionPrompt } from '$lib/server/prompts/evaluate';
import { rateLimitGuard } from '$lib/server/rateLimit';
import { applyAttentionDelta, BASELINE_ATTENTION, clampAttention } from '$lib/attention';

const FALLBACK_REACTION =
  'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.';

interface EvaluateRequest {
  session_id?: string;
  claim_id?: string;
  card_id?: string;
  classification?: string;
}

interface ValidatedInput {
  sessionId: string;
  claimId: string;
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

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

async function parseAndValidate(request: Request): Promise<ValidatedInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { session_id, claim_id, card_id, classification } = body as EvaluateRequest;

  if (!session_id || typeof session_id !== 'string') error(400, 'Missing or invalid session_id');
  if (!claim_id || typeof claim_id !== 'string') error(400, 'Missing or invalid claim_id');
  if (!card_id || typeof card_id !== 'string') error(400, 'Missing or invalid card_id');
  if (!classification || !VALID_CLASSIFICATIONS.has(classification as Classification)) {
    error(400, 'classification must be "proof", "objection", or "dismiss"');
  }

  return {
    sessionId: session_id,
    claimId: claim_id,
    cardId: card_id,
    classification: classification as Classification,
  };
}

async function loadSessionAttention(sessionId: string): Promise<number> {
  const { data, error: sessErr } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .select('attention')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (sessErr) {
    console.error('[evaluate] sessions read failed:', sessErr.message);
    error(500, 'Failed to read session');
  }
  if (!data) error(404, 'Session not found');

  const value = typeof data.attention === 'number' ? data.attention : BASELINE_ATTENTION;
  return clampAttention(value);
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

async function callReaction(
  claimText: string,
  card: FullCard,
  classification: Classification,
  history: Array<{ card_id: string; card_title: string; classification: Classification }>,
): Promise<{ text: string; ok: boolean }> {
  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
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

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const input = await parseAndValidate(request);

  const { claim, error: claimErr } = await getClaimById(input.claimId);
  if (claimErr && claimErr !== 'Claim not found') error(500, claimErr);
  if (!claim) error(404, 'Claim not found');

  const [currentAttention, aiScore, card, history] = await Promise.all([
    loadSessionAttention(input.sessionId),
    loadSeedScore(input.claimId, input.cardId),
    loadFullCard(input.cardId),
    loadPickHistory(input.sessionId),
  ]);

  const reaction = await callReaction(claim.text, card, input.classification, history);

  const persistedScore = input.classification === 'dismiss' ? 0 : aiScore;
  const rawDelta = CLASSIFICATION_SIGN[input.classification] * aiScore;
  const nextAttention = Math.round(applyAttentionDelta(currentAttention, rawDelta));

  const supabase = getSupabase();
  const suspicion = supabase.schema('suspicion');

  // INVARIANT #4: write to suspicion.picks BEFORE returning. The unique
  // (session_id, card_id) constraint enforces Invariant #8 (classification is
  // permanent within a session) at the DB level — direct API calls cannot
  // re-rule a card.
  const { error: pickError } = await suspicion.from('picks').insert({
    session_id: input.sessionId,
    card_id: input.cardId,
    classification: input.classification,
    ai_score: persistedScore,
    ai_reaction_text: reaction.text,
  });

  if (pickError) {
    // 23505 = unique_violation: the card has already been ruled in this session.
    if ((pickError as { code?: string }).code === '23505') {
      error(409, 'Card already ruled in this session');
    }
    console.error('[evaluate] picks insert failed:', pickError.message);
    error(500, 'Failed to record pick');
  }

  const { error: attentionError } = await suspicion
    .from('sessions')
    .update({ attention: nextAttention, updated_at: new Date().toISOString() })
    .eq('session_id', input.sessionId);

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
