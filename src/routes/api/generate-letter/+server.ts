import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from '$lib/server/prompts/coverLetter';
import { rateLimitGuard } from '$lib/server/rateLimit';
import type { Classification, FullCard } from '$lib/types';

const FALLBACK_LETTER =
  'The record could not be composed. The verdict stands, but the letter will have to be written by hand.';

const FALLBACK_CLOSING =
  'The investigation is concluded. The record speaks for itself.';

interface GenerateLetterRequest {
  session_id?: string;
  claim?: string;
  verdict?: string;
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

  const { session_id, claim, verdict } = body as GenerateLetterRequest;

  if (!session_id || typeof session_id !== 'string') {
    error(400, 'Missing or invalid session_id');
  }
  if (!claim || typeof claim !== 'string') {
    error(400, 'Missing or invalid claim');
  }
  if (verdict !== 'accuse' && verdict !== 'pardon') {
    error(400, 'verdict must be "accuse" or "pardon"');
  }

  const supabase = getSupabase();
  const suspicion = supabase.schema('suspicion');

  const { data: picks, error: picksError } = await suspicion
    .from('picks')
    .select('card_id, classification')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  if (picksError) {
    error(500, 'Failed to fetch picks');
  }

  // Dismissed exhibits are struck from the record — they do not appear in the letter.
  const ruledPicks = (picks ?? []).filter((p) => p.classification !== 'dismiss');
  const cardIds = ruledPicks.map((p) => p.card_id as string);

  let cards: Record<string, FullCard> = {};

  if (cardIds.length > 0) {
    const { data: cardRows, error: cardsError } = await supabase
      .from('cards')
      .select('objectID, title, blurb, fact, category, signal')
      .in('objectID', cardIds)
      .is('deleted_at', null);

    if (cardsError) {
      error(500, 'Failed to fetch cards');
    }

    cards = Object.fromEntries((cardRows ?? []).map((c) => [c.objectID as string, c as FullCard]));
  }

  const evidence = ruledPicks
    .filter((p) => cards[p.card_id as string])
    .map((p) => ({
      card: cards[p.card_id as string],
      classification: p.classification as Exclude<Classification, 'dismiss'>,
    }));

  const { error: sessionError } = await suspicion
    .from('sessions')
    .update({ verdict, updated_at: new Date().toISOString() })
    .eq('session_id', session_id);

  if (sessionError) {
    error(500, 'Failed to update session');
  }

  let coverLetter = FALLBACK_LETTER;
  let architectClosing = FALLBACK_CLOSING;

  try {
    const client = getClaudeClient();

    const letterPrompt = buildCoverLetterPrompt(claim, verdict, evidence);
    const closingPrompt = buildClosingLinePrompt(verdict);

    const [letterResponse, closingResponse] = await Promise.all([
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: letterPrompt }],
      }),
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: closingPrompt }],
      }),
    ]);

    const letterText =
      letterResponse.content[0]?.type === 'text' ? letterResponse.content[0].text : '';
    const closingText =
      closingResponse.content[0]?.type === 'text' ? closingResponse.content[0].text : '';

    if (letterText) coverLetter = letterText;
    if (closingText) architectClosing = closingText;
  } catch (err) {
    console.error('[generate-letter] Claude API failure:', err instanceof Error ? err.message : err);
  }

  await suspicion
    .from('sessions')
    .update({
      cover_letter: coverLetter,
      architect_closing: architectClosing,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', session_id);

  return json({ cover_letter: coverLetter, architect_closing: architectClosing });
};
