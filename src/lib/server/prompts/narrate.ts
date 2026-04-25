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

const ACTION_DESCRIPTIONS: Record<NarrationAction, (room: string) => string> = {
  enter_room: (room) => `The player has just entered the ${room}.`,
  idle: (room) => `The player lingers in the ${room}, hesitating.`,
  wander: () => `The player wanders the mansion halls without examining evidence.`,
};

export function buildNarrationPrompt(context: NarrationContext): string {
  const { claim, action, room, evidenceCount, roomsVisited } = context;

  const totalEvidence = evidenceCount.proof + evidenceCount.objection;
  const visitedList = roomsVisited.length > 0 ? roomsVisited.join(', ') : 'none yet';
  const actionDescription = ACTION_DESCRIPTIONS[action](room);
  const roomContent = ROOM_CONTENT[room] ?? 'evidence';

  return `Claim: "${claim}"

${actionDescription}

State: visited [${visitedList}], ${totalEvidence} total (${evidenceCount.proof} proof, ${evidenceCount.objection} objections).

Write 1 sentence as The Architect. Be specific:
- If entering a room: comment on what KIND of evidence they'll find there (the ${room} contains ${roomContent}) and needle them about what it might mean for the claim.
- If wandering: mock their indecision. Reference how many rooms they've visited vs how many remain.
- If idling: question whether they're afraid of what they'll find.

Keep it SHORT. 1 sentence. Reference the claim directly. No generic atmosphere.

Respond with ONLY the dialogue text, no JSON.`;
}
