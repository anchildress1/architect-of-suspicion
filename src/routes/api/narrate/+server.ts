import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildNarrationPrompt, type NarrationAction } from '$lib/server/prompts/narrate';
import { rateLimitGuard } from '$lib/server/rateLimit';

const VALID_ACTIONS: NarrationAction[] = ['enter_room', 'idle', 'wander'];

const FALLBACK_DIALOGUE =
  'The gears turn. The mansion watches. And so, it seems, do I.';

interface NarrateRequest {
  claim?: string;
  action?: string;
  room?: string;
  evidence_count?: { proof: number; objection: number };
  rooms_visited?: string[];
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

  const { claim, action, room, evidence_count, rooms_visited } = body as NarrateRequest;

  if (!claim || typeof claim !== 'string') {
    error(400, 'Missing or invalid claim');
  }
  if (!action || !VALID_ACTIONS.includes(action as NarrationAction)) {
    error(400, 'action must be "enter_room", "idle", or "wander"');
  }
  if (!room || typeof room !== 'string') {
    error(400, 'Missing or invalid room');
  }

  const evidenceCount = evidence_count ?? { proof: 0, objection: 0 };
  const roomsVisited = rooms_visited ?? [];

  const prompt = buildNarrationPrompt({
    claim,
    action: action as NarrationAction,
    room,
    evidenceCount,
    roomsVisited,
  });

  let dialogue = FALLBACK_DIALOGUE;

  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 200,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    if (text.trim()) {
      dialogue = text.trim();
    }
  } catch (err) {
    console.error('[narrate] Claude API failure:', err instanceof Error ? err.message : err);
  }

  return json({ dialogue });
};
