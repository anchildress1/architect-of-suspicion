import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchClaimDeck = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchClaimDeck: (...args: unknown[]) => mockFetchClaimDeck(...args),
}));

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  },
}));

import { load } from './+page.server';

const VALID_CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeEvent(slug: string, params: Record<string, string>): Parameters<typeof load>[0] {
  const url = new URL('http://localhost/room/' + slug);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { params: { slug }, url } as Parameters<typeof load>[0];
}

describe('room/[slug] +page.server load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s when the room slug is unknown', async () => {
    await expect(load(makeEvent('dungeon', { claim_id: VALID_CLAIM_ID }))).rejects.toThrow(
      'Room not found',
    );
  });

  it('404s when the room is non-playable (entry-hall)', async () => {
    await expect(load(makeEvent('entry-hall', { claim_id: VALID_CLAIM_ID }))).rejects.toThrow(
      'Room not found',
    );
  });

  it('400s when claim_id is missing', async () => {
    await expect(load(makeEvent('parlor', {}))).rejects.toThrow('Missing or invalid claim_id');
  });

  it('400s when claim_id is not a UUID', async () => {
    await expect(load(makeEvent('parlor', { claim_id: 'nope' }))).rejects.toThrow(
      'Missing or invalid claim_id',
    );
  });

  it('passes the room category and exclude list through to fetchClaimDeck', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await load(makeEvent('parlor', { claim_id: VALID_CLAIM_ID, exclude: 'a,b' }));

    expect(mockFetchClaimDeck).toHaveBeenCalledWith(VALID_CLAIM_ID, 'Decisions', ['a', 'b']);
  });

  it('returns the deck and the resolved room', async () => {
    mockFetchClaimDeck.mockResolvedValue({
      cards: [{ objectID: 'a', title: 'A', blurb: 'A', category: 'Decisions', weight: 4 }],
      error: null,
    });

    const result = (await load(makeEvent('parlor', { claim_id: VALID_CLAIM_ID }))) as {
      room: { slug: string };
      cards: unknown[];
    };

    expect(result.room.slug).toBe('parlor');
    expect(result.cards).toHaveLength(1);
  });

  it('500s when the fetcher errors', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: 'Failed to fetch deck' });

    await expect(load(makeEvent('parlor', { claim_id: VALID_CLAIM_ID }))).rejects.toThrow(
      'Failed to fetch deck',
    );
  });
});
