import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from '$lib/server/prompts/coverLetter';
import { rateLimitGuard } from '$lib/server/rateLimit';
import type { Classification, FullCard, Verdict } from '$lib/types';

const FALLBACK_LETTER =
  'The record could not be composed. The verdict stands, but the letter will have to be written by hand.';

const FALLBACK_CLOSING = 'The investigation is concluded. The record speaks for itself.';

interface GenerateLetterRequest {
  session_id?: string;
  verdict?: string;
}

interface SessionRow {
  claim_text: string;
}

type RuledPick = { card_id: string; classification: Exclude<Classification, 'dismiss'> };

async function parseRequest(request: Request): Promise<{ sessionId: string; verdict: Verdict }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { session_id, verdict } = body as GenerateLetterRequest;

  if (!session_id || typeof session_id !== 'string') {
    error(400, 'Missing or invalid session_id');
  }
  if (verdict !== 'accuse' && verdict !== 'pardon') {
    error(400, 'verdict must be "accuse" or "pardon"');
  }

  return { sessionId: session_id, verdict };
}

async function loadSessionClaim(sessionId: string): Promise<string> {
  const { data, error: sessErr } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .select('claim_text')
    .eq('session_id', sessionId)
    .maybeSingle<SessionRow>();

  if (sessErr) {
    console.error('[generate-letter] sessions read failed:', sessErr.message);
    error(500, 'Failed to read session');
  }
  if (!data) error(404, 'Session not found');
  return data.claim_text;
}

async function loadRuledPicks(sessionId: string): Promise<RuledPick[]> {
  const { data, error: picksErr } = await getSupabase()
    .schema('suspicion')
    .from('picks')
    .select('card_id, classification')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (picksErr) {
    console.error('[generate-letter] picks read failed:', picksErr.message);
    error(500, 'Failed to fetch picks');
  }

  return (data ?? [])
    .filter((p) => p.classification !== 'dismiss')
    .map((p) => ({
      card_id: p.card_id as string,
      classification: p.classification as Exclude<Classification, 'dismiss'>,
    }));
}

async function loadCardsById(ids: string[]): Promise<Record<string, FullCard>> {
  if (ids.length === 0) return {};
  const { data, error: cardsError } = await getSupabase()
    .from('cards')
    .select('objectID, title, blurb, fact, category, signal')
    .in('objectID', ids)
    .is('deleted_at', null);

  if (cardsError) {
    console.error('[generate-letter] cards read failed:', cardsError.message);
    error(500, 'Failed to fetch cards');
  }

  return Object.fromEntries((data ?? []).map((c) => [c.objectID as string, c as FullCard]));
}

async function generateLetter(
  claimText: string,
  verdict: Verdict,
  evidence: Array<{ card: FullCard; classification: Exclude<Classification, 'dismiss'> }>,
): Promise<{ coverLetter: string; architectClosing: string; ok: boolean }> {
  try {
    const client = getClaudeClient();
    const [letterResponse, closingResponse] = await Promise.all([
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildCoverLetterPrompt(claimText, verdict, evidence) }],
      }),
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildClosingLinePrompt(verdict) }],
      }),
    ]);

    const letterText =
      letterResponse.content[0]?.type === 'text' ? letterResponse.content[0].text : '';
    const closingText =
      closingResponse.content[0]?.type === 'text' ? closingResponse.content[0].text : '';

    return {
      coverLetter: letterText || FALLBACK_LETTER,
      architectClosing: closingText || FALLBACK_CLOSING,
      ok: Boolean(letterText && closingText),
    };
  } catch (err) {
    console.error(
      '[generate-letter] Claude API failure:',
      err instanceof Error ? err.message : err,
    );
    return { coverLetter: FALLBACK_LETTER, architectClosing: FALLBACK_CLOSING, ok: false };
  }
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const { sessionId, verdict } = await parseRequest(request);

  const claimText = await loadSessionClaim(sessionId);
  const ruledPicks = await loadRuledPicks(sessionId);
  const cards = await loadCardsById(ruledPicks.map((p) => p.card_id));

  const evidence = ruledPicks
    .filter((p) => cards[p.card_id])
    .map((p) => ({ card: cards[p.card_id], classification: p.classification }));

  const suspicion = getSupabase().schema('suspicion');

  const { error: verdictError } = await suspicion
    .from('sessions')
    .update({ verdict, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId);

  if (verdictError) {
    console.error('[generate-letter] session verdict update failed:', verdictError.message);
    error(500, 'Failed to update session');
  }

  const { coverLetter, architectClosing, ok } = await generateLetter(claimText, verdict, evidence);

  const { error: letterError } = await suspicion
    .from('sessions')
    .update({
      cover_letter: coverLetter,
      architect_closing: architectClosing,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId);

  if (letterError) {
    console.error('[generate-letter] session letter update failed:', letterError.message);
    error(500, 'Failed to persist letter');
  }

  return json({
    cover_letter: coverLetter,
    architect_closing: architectClosing,
    letter_fallback: !ok,
  });
};
