export type NarrationAction = 'enter_room' | 'idle' | 'wander';

interface NarrationContext {
  claim: string;
  action: NarrationAction;
  room: string;
  evidenceCount: { proof: number; objection: number };
  roomsVisited: string[];
}

const ROOM_CONTENT: Record<string, string> = {
  gallery: 'awards and recognition',
  'control-room': 'constraints and limitations',
  parlor: 'decisions and trade-offs',
  library: 'philosophy and principles',
  workshop: 'experiments and prototypes',
  cellar: 'work habits and patterns',
  'back-hall': 'experience and history',
};

/** Total chambers in the mansion (About category excluded from gameplay).
 *  Derived from the room registry so it tracks if rooms ever change. */
const TOTAL_ROOMS = Object.keys(ROOM_CONTENT).length;

const ACTION_DESCRIPTIONS: Record<NarrationAction, (room: string) => string> = {
  enter_room: (room) => `The player has just entered the ${room}.`,
  // Earlier "lingers...hesitating" / "without examining evidence" framings
  // baked editorial state assumptions into the input — the model then took
  // the lie as truth and produced "haven't cracked a single card" even
  // after the player had picks. Action descriptions are now state-honest;
  // the tone branch below grounds in the actual State numbers.
  idle: (room) => `The player is still in the ${room}.`,
  wander: () => `The player is in the mansion halls, between rooms.`,
};

export function buildNarrationPrompt(context: NarrationContext): string {
  const { claim, action, room, evidenceCount, roomsVisited } = context;

  const totalEvidence = evidenceCount.proof + evidenceCount.objection;
  // roomsVisited is an ordered visit log — revisits are duplicates. The
  // model only needs unique rooms, otherwise "10 visits across 7 chambers"
  // collapses into the model claiming the player walked ten rooms.
  const uniqueVisited = Array.from(new Set(roomsVisited));
  const visitedList = uniqueVisited.length > 0 ? uniqueVisited.join(', ') : 'none yet';
  const roomsRemaining = Math.max(0, TOTAL_ROOMS - uniqueVisited.length);
  const actionDescription = ACTION_DESCRIPTIONS[action](room);
  const roomContent = ROOM_CONTENT[room] ?? 'evidence';

  return `Claim: "${claim}"

${actionDescription}

State:
- Rooms (${TOTAL_ROOMS} total): ${uniqueVisited.length} visited, ${roomsRemaining} remaining — [${visitedList}]
- Evidence engaged: ${totalEvidence} picks (${evidenceCount.proof} proof, ${evidenceCount.objection} objections)

Write 1 sentence as The Architect. Be specific:
- If entering a room: anchor the comment in what the room contains (${roomContent}) and the claim's surface phrasing. Do not name what the contents mean for the claim.
- If wandering: anchor in the State numbers above. With no evidence engaged, the indecision is fair to needle. With evidence engaged, they are transiting between rooms — do not invent indecision they are not exhibiting.
- If idling: anchor in the room's content (${roomContent}) and the pause itself. Do not name a direction the player should fear; the pause is the subject, not its imagined cause.

GUARDRAILS:
- The narration has no per-card direction. Never imply the claim has a clear answer the player is missing, or describe progress as success or failure.
- Numbers are facts. Use the State block's counts; never invent rooms, picks, or progress signals.
- The Architect observes; the player decides what the room's content means for the claim.

Keep it SHORT. 1 sentence. Reference the claim directly. No generic atmosphere.

Respond with ONLY the dialogue text, no JSON.`;
}
