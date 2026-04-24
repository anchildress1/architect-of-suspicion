import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gameState } from '$lib/stores/gameState.svelte';
import { requestNarration } from './narrate';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  fetchMock.mockReset();
  gameState.reset();
  gameState.initSession({ sessionId: 's', claimId: 'c', claimText: 'A claim' });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('requestNarration', () => {
  it('appends a narration feed entry on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ dialogue: 'The Architect speaks.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestNarration('enter_room', 'parlor');

    const last = gameState.current.feed.at(-1);
    expect(last?.type).toBe('narration');
    expect(last?.text).toBe('The Architect speaks.');
  });

  it('sends the current claim, action, room, counts, and visited list', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    gameState.visitRoom('library');

    await requestNarration('wander', 'mansion');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe('wander');
    expect(body.room).toBe('mansion');
    expect(body.claim).toBe('A claim');
    expect(body.rooms_visited).toEqual(['library']);
    expect(body.evidence_count).toEqual({ proof: 0, objection: 0 });
  });

  it('silently swallows non-OK responses', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    await requestNarration('idle', 'parlor');

    expect(gameState.current.feed.filter((e) => e.type === 'narration')).toHaveLength(0);
  });

  it('silently swallows fetch failures', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    await expect(requestNarration('idle', 'parlor')).resolves.toBeUndefined();
  });
});
