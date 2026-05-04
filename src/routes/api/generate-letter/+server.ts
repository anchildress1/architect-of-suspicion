import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaudeClient } from '$lib/server/claude';
import { getClaimTruthContext, getParamountCards } from '$lib/server/claims';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from '$lib/server/prompts/coverLetter';
import { rateLimitGuard } from '$lib/server/rateLimit';
import type {
  Classification,
  ClaimTruthContext,
  FullCard,
  ParamountCardEntry,
  Verdict,
} from '$lib/types';
import { loadSessionCapability } from '$lib/server/sessionCapability';
import { parseJsonBodyWithLimit } from '$lib/server/validation';

const FALLBACK_LETTER =
  'The record could not be composed. The verdict stands, but the brief will have to be drafted on another instrument.';

const FALLBACK_CLOSING = 'The investigation is concluded. The record speaks for itself.';

interface GenerateLetterRequest {
  verdict?: string;
}

type RuledClassification = Exclude<Classification, 'dismiss'>;
type RuledPick = { card_id: string; classification: RuledClassification };
type RuledExtra = { card: FullCard; classification: RuledClassification };

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
      classification: p.classification as RuledClassification,
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

/**
 * Split the runtime evidence into the two shapes the prompt needs:
 *  - paramount[]  — every paramount card, with classification if the player
 *                   ruled it (else null so the prompt can call out the gap).
 *  - ruledExtras[] — the player's non-paramount Proof/Objection rulings.
 *                    Personalization, not source-of-truth.
 */
function partitionEvidence(
  paramountCards: FullCard[],
  ruledPicks: RuledPick[],
  pickedCards: Record<string, FullCard>,
): { paramount: ParamountCardEntry[]; ruledExtras: RuledExtra[] } {
  const classificationByCard = new Map<string, RuledClassification>();
  for (const pick of ruledPicks) classificationByCard.set(pick.card_id, pick.classification);

  const paramountIds = new Set(paramountCards.map((c) => c.objectID));

  const paramount = paramountCards.map<ParamountCardEntry>((card) => ({
    card,
    classification: classificationByCard.get(card.objectID) ?? null,
  }));

  const ruledExtras: RuledExtra[] = ruledPicks
    .filter((pick) => !paramountIds.has(pick.card_id) && pickedCards[pick.card_id])
    .map((pick) => ({ card: pickedCards[pick.card_id], classification: pick.classification }));

  return { paramount, ruledExtras };
}

async function generateLetter(
  claimText: string,
  verdict: Verdict,
  context: ClaimTruthContext,
  paramount: ParamountCardEntry[],
  ruledExtras: RuledExtra[],
): Promise<{ coverLetter: string; architectClosing: string; ok: boolean }> {
  try {
    const client = getClaudeClient();
    const [letterResponse, closingResponse] = await Promise.all([
      client.messages.create({
        // The cover letter is the verdict screen's centerpiece — the long-form
        // narrative the player came for. Sonnet for tone, structure, and
        // claim-specific rhetoric.
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildCoverLetterPrompt(claimText, verdict, context, paramount, ruledExtras),
          },
        ],
      }),
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildClosingLinePrompt(verdict, context) }],
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

  // Anchor the letter on the single underlying truth Pass 2 produced. The DB
  // enforces hireable_truth NOT NULL with a non-empty CHECK and
  // desired_verdict CHECK ('accuse','pardon'); a missing row means the claim
  // was deleted between session creation and verdict — refuse rather than
  // let the prompt invent its own framing.
  const { context, error: contextErr } = await getClaimTruthContext(session.claimId);
  if (contextErr || !context) {
    error(500, contextErr ?? 'Failed to fetch claim truth');
  }

  // Paramount cards are surfaced regardless of whether the player ruled
  // them — the brief calls out paramount-but-skipped as gaps. An empty pool
  // for a survived claim is a pipeline bug per persist's invariant; surface
  // it as 500 rather than ship a brief that can only ride personalization.
  const { cards: paramountCards, error: paramountErr } = await getParamountCards(session.claimId);
  if (paramountErr) {
    error(500, paramountErr);
  }
  if (paramountCards.length === 0) {
    console.error(
      '[generate-letter] no paramount cards for claim',
      session.claimId,
      '— pipeline must reseed',
    );
    error(500, 'Claim has no paramount evidence');
  }

  const ruledPicks = await loadRuledPicks(session.sessionId);
  const pickedCards = await loadCardsById(ruledPicks.map((p) => p.card_id));

  const missingCards = ruledPicks.filter((p) => !pickedCards[p.card_id]);
  if (missingCards.length > 0) {
    console.error(
      '[generate-letter] ruled picks missing from cards map — non-paramount citations will be incomplete:',
      missingCards.map((p) => p.card_id),
    );
  }
  const { paramount, ruledExtras } = partitionEvidence(paramountCards, ruledPicks, pickedCards);

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
    context,
    paramount,
    ruledExtras,
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
