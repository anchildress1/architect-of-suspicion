import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Classification } from '$lib/types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildEvaluationPrompt } from '$lib/server/prompts/evaluate';

const FALLBACK_REACTION =
  'The gears of judgement grind on, though the mechanism stutters. Even The Architect must pause when the steam runs thin.';

interface EvaluateRequest {
  session_id?: string;
  claim?: string;
  card_id?: string;
  classification?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { session_id, claim, card_id, classification } = body as EvaluateRequest;

  if (!session_id || typeof session_id !== 'string') {
    error(400, 'Missing or invalid session_id');
  }
  if (!claim || typeof claim !== 'string') {
    error(400, 'Missing or invalid claim');
  }
  if (!card_id || typeof card_id !== 'string') {
    error(400, 'Missing or invalid card_id');
  }
  if (classification !== 'proof' && classification !== 'objection') {
    error(400, 'classification must be "proof" or "objection"');
  }

  const supabase = getSupabase();

  // Fetch full card including fact — server only
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .eq('objectID', card_id)
    .is('deleted_at', null)
    .single();

  if (cardError || !card) {
    error(404, 'Card not found');
  }

  // Fetch pick history for context
  const { data: picks } = await supabase
    .from('picks')
    .select('card_id, card_title, classification')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  const history = (picks ?? []).map((p) => ({
    card_id: p.card_id as string,
    card_title: p.card_title as string,
    classification: p.classification as Classification,
  }));

  // Build prompt and call Claude
  const prompt = buildEvaluationPrompt(claim, card, classification, history);

  let aiScore = 0.0;
  let aiReaction = FALLBACK_REACTION;

  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 500,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    const parsed = JSON.parse(text);

    if (typeof parsed.score === 'number' && typeof parsed.reaction === 'string') {
      aiScore = Math.max(-1.0, Math.min(1.0, parsed.score));
      aiReaction = parsed.reaction;
    }
  } catch {
    // Claude call or parse failed — use fallback values
    // aiScore stays 0.0, aiReaction stays fallback
  }

  // INVARIANT: Write to suspicion.picks BEFORE returning to client
  const { error: pickError } = await supabase.from('picks').insert({
    session_id,
    card_id,
    card_title: card.title,
    classification,
    ai_score: aiScore,
    ai_reaction: aiReaction,
  });

  if (pickError) {
    error(500, 'Failed to record pick');
  }

  return json({ ai_score: aiScore, ai_reaction: aiReaction });
};
