import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { getClaimById } from '$lib/server/claims';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildReactionPrompt } from '$lib/server/prompts/evaluate';
import { rateLimitGuard } from '$lib/server/rateLimit';

const FALLBACK_REACTION =
  'Interesting choice. I had thoughts on that one, but the mechanism seized before I could share them.';

interface EvaluateRequest {
  session_id?: string;
  claim_id?: string;
  card_id?: string;
  classification?: string;
}

const VALID_CLASSIFICATIONS: ReadonlySet<Classification> = new Set([
  'proof',
  'objection',
  'dismiss',
]);

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { session_id, claim_id, card_id, classification } = body as EvaluateRequest;

  if (!session_id || typeof session_id !== 'string') {
    error(400, 'Missing or invalid session_id');
  }
  if (!claim_id || typeof claim_id !== 'string') {
    error(400, 'Missing or invalid claim_id');
  }
  if (!card_id || typeof card_id !== 'string') {
    error(400, 'Missing or invalid card_id');
  }
  if (!classification || !VALID_CLASSIFICATIONS.has(classification as Classification)) {
    error(400, 'classification must be "proof", "objection", or "dismiss"');
  }
  const cls = classification as Classification;

  const supabase = getSupabase();
  const suspicion = supabase.schema('suspicion');

  const { claim, error: claimErr } = await getClaimById(claim_id);
  if (claimErr || !claim) {
    error(404, claimErr ?? 'Claim not found');
  }

  // Pre-seeded directional score for this (claim, card). Single source of truth.
  const { data: pair, error: pairErr } = await suspicion
    .from('claim_cards')
    .select('ai_score')
    .eq('claim_id', claim_id)
    .eq('card_id', card_id)
    .maybeSingle();

  if (pairErr) {
    error(500, 'Failed to read claim_cards');
  }
  if (!pair) {
    error(404, 'Card not in this claim deck');
  }
  const aiScore = clampScore(pair.ai_score);

  // Full card (with `fact`) for the reaction prompt only — never serialized out.
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .eq('objectID', card_id)
    .is('deleted_at', null)
    .single();

  if (cardError || !card) {
    error(404, 'Card not found');
  }

  const { data: picks } = await suspicion
    .from('picks')
    .select('card_id, classification')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  // Pick history needs card titles for the prompt — fetch them in one shot.
  const historyIds = (picks ?? []).map((p) => p.card_id as string);
  let titlesById: Record<string, string> = {};
  if (historyIds.length > 0) {
    const { data: titleRows } = await supabase
      .from('cards')
      .select('objectID, title')
      .in('objectID', historyIds);
    titlesById = Object.fromEntries(
      (titleRows ?? []).map((r) => [r.objectID as string, r.title as string]),
    );
  }
  const history = (picks ?? []).map((p) => ({
    card_id: p.card_id as string,
    card_title: titlesById[p.card_id as string] ?? '(unknown)',
    classification: p.classification as Classification,
  }));

  // Reaction text only — Claude no longer scores.
  let aiReaction = FALLBACK_REACTION;
  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildReactionPrompt(claim.text, card, cls, history) }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (text) aiReaction = text;
  } catch (err) {
    console.error(
      '[evaluate] Claude reaction call failed:',
      err instanceof Error ? err.message : err,
    );
  }

  // Dismiss = no contribution to attention; pick still recorded for traceability.
  const persistedScore = cls === 'dismiss' ? 0 : aiScore;

  // INVARIANT: write to suspicion.picks BEFORE returning to client.
  const { error: pickError } = await suspicion.from('picks').insert({
    session_id,
    card_id,
    classification: cls,
    ai_score: persistedScore,
    ai_reaction_text: aiReaction,
  });

  if (pickError) {
    error(500, 'Failed to record pick');
  }

  // attention_delta drives the meter client-side. Sign comes from the player's
  // call (proof = +1, objection = -1, dismiss = 0); magnitude from pre-seeded score.
  const sign = cls === 'proof' ? 1 : cls === 'objection' ? -1 : 0;
  const attentionDelta = sign * aiScore;

  return json({ ai_reaction: aiReaction, attention_delta: attentionDelta });
};
