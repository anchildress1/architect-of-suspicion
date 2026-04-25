import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from '$lib/server/prompts/coverLetter';
import { rateLimitGuard } from '$lib/server/rateLimit';
import type { Classification, FullCard, Verdict } from '$lib/types';
import { loadSessionCapability } from '$lib/server/sessionCapability';
import { parseJsonBodyWithLimit } from '$lib/server/validation';

const FALLBACK_LETTER =
  'The record could not be composed. The verdict stands, but the letter will have to be written by hand.';

const FALLBACK_CLOSING = 'The investigation is concluded. The record speaks for itself.';

interface GenerateLetterRequest {
  verdict?: string;
}

type RuledPick = { card_id: string; classification: Exclude<Classification, 'dismiss'> };

const MAX_GENERATE_REQUEST_BYTES = 1_024;

async function parseRequest(request: Request): Promise<{ verdict: Verdict }> {
  const body = await parseJsonBodyWithLimit<GenerateLetterRequest>(
    request,
    MAX_GENERATE_REQUEST_BYTES,
  );
  const { verdict } = body;

  if (verdict !== 'accuse' && verdict !== 'pardon') {
    error(400, 'verdict must be "accuse" or "pardon"');
  }

  return { verdict };
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

export const POST: RequestHandler = async ({ request, getClientAddress, cookies }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const { verdict } = await parseRequest(request);
  const session = await loadSessionCapability(cookies);

  const ruledPicks = await loadRuledPicks(session.sessionId);
  const cards = await loadCardsById(ruledPicks.map((p) => p.card_id));

  const missingCards = ruledPicks.filter((p) => !cards[p.card_id]);
  if (missingCards.length > 0) {
    console.error(
      '[generate-letter] ruled picks missing from cards map — cover letter will be incomplete:',
      missingCards.map((p) => p.card_id),
    );
  }
  const evidence = ruledPicks
    .filter((p) => cards[p.card_id])
    .map((p) => ({ card: cards[p.card_id], classification: p.classification }));

  const suspicion = getSupabase().schema('suspicion');

  const { error: verdictError } = await suspicion
    .from('sessions')
    .update({ verdict, updated_at: new Date().toISOString() })
    .eq('session_id', session.sessionId);

  if (verdictError) {
    console.error('[generate-letter] session verdict update failed:', verdictError.message);
    error(500, 'Failed to update session');
  }

  const { coverLetter, architectClosing, ok } = await generateLetter(
    session.claimText,
    verdict,
    evidence,
  );

  const { error: letterError } = await suspicion
    .from('sessions')
    .update({
      cover_letter: coverLetter,
      architect_closing: architectClosing,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', session.sessionId);

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
