export type NarrationAction = 'enter_room' | 'idle' | 'wander';

interface NarrationContext {
  claim: string;
  action: NarrationAction;
  room: string;
  evidenceCount: { proof: number; objection: number };
  roomsVisited: string[];
}

export function buildNarrationPrompt(context: NarrationContext): string {
  const { claim, action, room, evidenceCount, roomsVisited } = context;

  const totalEvidence = evidenceCount.proof + evidenceCount.objection;
  const visitedList =
    roomsVisited.length > 0 ? roomsVisited.join(', ') : 'none yet';

  let actionDescription: string;
  switch (action) {
    case 'enter_room':
      actionDescription = `The player has just entered the ${room}.`;
      break;
    case 'idle':
      actionDescription = `The player lingers in the ${room}, hesitating.`;
      break;
    case 'wander':
      actionDescription = `The player wanders the mansion halls without examining evidence.`;
      break;
  }

  return `Claim: "${claim}"

${actionDescription}

State: visited [${visitedList}], ${totalEvidence} total (${evidenceCount.proof} proof, ${evidenceCount.objection} objections).

Write 1 sentence as The Architect. Be specific:
- If entering a room: comment on what KIND of evidence they'll find there (the ${room} contains ${room === 'gallery' ? 'awards and recognition' : room === 'control-room' ? 'constraints and limitations' : room === 'parlor' ? 'decisions and trade-offs' : room === 'library' ? 'philosophy and principles' : room === 'workshop' ? 'experiments and prototypes' : room === 'cellar' ? 'work habits and patterns' : room === 'back-hall' ? 'experience and history' : 'evidence'}) and needle them about what it might mean for the claim.
- If wandering: mock their indecision. Reference how many rooms they've visited vs how many remain.
- If idling: question whether they're afraid of what they'll find.

Keep it SHORT. 1 sentence. Reference the claim directly. No generic atmosphere.

Respond with ONLY the dialogue text, no JSON.`;
}
