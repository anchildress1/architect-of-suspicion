import { gameState } from '$lib/stores/gameState.svelte';

/**
 * Request narration from The Architect and add it to the feed.
 * Non-critical: failures are silently ignored.
 */
export async function requestNarration(
  action: 'enter_room' | 'wander' | 'idle',
  room: string,
): Promise<void> {
  try {
    const res = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claim: gameState.current.claimText,
        action,
        room,
        evidence_count: {
          proof: gameState.proofCount,
          objection: gameState.objectionCount,
        },
        rooms_visited: gameState.current.roomsVisited,
      }),
    });

    if (res.ok) {
      const { dialogue } = await res.json();
      gameState.addFeedEntry({
        id: crypto.randomUUID(),
        type: 'narration',
        text: dialogue,
        timestamp: Date.now(),
      });
    }
  } catch {
    /* Narration is non-critical */
  }
}
