import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClaudeClient } from '$lib/server/claude';
import { ARCHITECT_SYSTEM_PROMPT } from '$lib/server/prompts/system';
import { buildNarrationPrompt, type NarrationAction } from '$lib/server/prompts/narrate';
import { rateLimitGuard } from '$lib/server/rateLimit';
import {
  parseJsonBodyWithLimit,
  requireBoundedString,
  requireNonNegativeInteger,
} from '$lib/server/validation';
import { rooms } from '$lib/rooms';

const VALID_ACTIONS: NarrationAction[] = ['enter_room', 'idle', 'wander'];
const VALID_ROOMS = new Set([...rooms.map((room) => room.slug), 'mansion']);

const FALLBACK_DIALOGUE =
  'Go on, then. I was going to comment, but I suppose you can draw your own conclusions.';

const MAX_NARRATE_REQUEST_BYTES = 4_096;
const MAX_CLAIM_LENGTH = 300;
const MAX_ROOM_LENGTH = 40;
const MAX_ROOMS_VISITED = 12;
const MAX_EVIDENCE_COUNT = 1_000;

interface NarrateRequest {
  claim?: string;
  action?: string;
  room?: string;
  evidence_count?: { proof?: number; objection?: number };
  rooms_visited?: unknown;
}

interface ValidatedNarrationInput {
  claim: string;
  action: NarrationAction;
  room: string;
  evidenceCount: { proof: number; objection: number };
  roomsVisited: string[];
}

function validateInput(body: NarrateRequest): ValidatedNarrationInput {
  const claim = requireBoundedString(body.claim, 'claim', MAX_CLAIM_LENGTH);

  if (!body.action || !VALID_ACTIONS.includes(body.action as NarrationAction)) {
    error(400, 'action must be "enter_room", "idle", or "wander"');
  }

  const room = requireBoundedString(body.room, 'room', MAX_ROOM_LENGTH);
  if (!VALID_ROOMS.has(room)) {
    error(400, 'Missing or invalid room');
  }

  const proof = requireNonNegativeInteger(
    body.evidence_count?.proof ?? 0,
    'evidence_count.proof',
    MAX_EVIDENCE_COUNT,
  );
  const objection = requireNonNegativeInteger(
    body.evidence_count?.objection ?? 0,
    'evidence_count.objection',
    MAX_EVIDENCE_COUNT,
  );

  const roomsVisitedRaw = body.rooms_visited ?? [];
  if (!Array.isArray(roomsVisitedRaw) || roomsVisitedRaw.length > MAX_ROOMS_VISITED) {
    error(400, 'Missing or invalid rooms_visited');
  }

  const roomsVisited = roomsVisitedRaw.map((entry) => {
    const slug = requireBoundedString(entry, 'rooms_visited', MAX_ROOM_LENGTH);
    if (!VALID_ROOMS.has(slug)) {
      error(400, 'Missing or invalid rooms_visited');
    }
    return slug;
  });

  return {
    claim,
    action: body.action as NarrationAction,
    room,
    evidenceCount: { proof, objection },
    roomsVisited,
  };
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const body = await parseJsonBodyWithLimit<NarrateRequest>(request, MAX_NARRATE_REQUEST_BYTES);
  const input = validateInput(body);

  const prompt = buildNarrationPrompt({
    claim: input.claim,
    action: input.action,
    room: input.room,
    evidenceCount: input.evidenceCount,
    roomsVisited: input.roomsVisited,
  });

  let dialogue = FALLBACK_DIALOGUE;

  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

    if (text.trim()) {
      dialogue = text.trim();
    }
  } catch (err) {
    console.error('[narrate] Claude API failure:', err instanceof Error ? err.message : err);
  }

  return json({ dialogue });
};
