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

  return `The investigation concerns the claim: "${claim}"

${actionDescription}

Current state:
- Rooms visited: ${visitedList}
- Evidence collected: ${totalEvidence} total (${evidenceCount.proof} proof, ${evidenceCount.objection} objections)

Write 1-2 sentences of atmospheric commentary as The Architect, reacting to this moment. Be theatrical and use steampunk/industrial imagery. Do NOT reference scores, do NOT help the player, do NOT break character.

Respond with ONLY the dialogue text — no JSON, no quotation marks wrapping the entire response, no attribution.`;
}
