import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchClaimDeck = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchClaimDeck: (...args: unknown[]) => mockFetchClaimDeck(...args),
}));

vi.mock('@sveltejs/kit', () => ({
  json: (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  },
}));

import { GET } from './+server';

function makeRequest(params: Record<string, string>): Parameters<typeof GET>[0] {
  const url = new URL('http://localhost/api/cards');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { url } as Parameters<typeof GET>[0];
}

describe('GET /api/cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when claim_id is missing', async () => {
    await expect(GET(makeRequest({ category: 'Awards' }))).rejects.toThrow(
      'Missing required parameter: claim_id',
    );
  });

  it('returns 400 when category is missing', async () => {
    await expect(GET(makeRequest({ claim_id: 'c-1' }))).rejects.toThrow(
      'Missing required parameter: category',
    );
  });

  it('passes claim_id, category, and exclude list to the fetcher', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ claim_id: 'c-1', category: 'Awards', exclude: 'a,b' }));

    expect(mockFetchClaimDeck).toHaveBeenCalledWith('c-1', 'Awards', ['a', 'b']);
  });

  it('passes empty exclude when not provided', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ claim_id: 'c-1', category: 'Decisions' }));

    expect(mockFetchClaimDeck).toHaveBeenCalledWith('c-1', 'Decisions', []);
  });

  it('returns the deck unchanged from the fetcher (already ordered)', async () => {
    mockFetchClaimDeck.mockResolvedValue({
      cards: [
        { objectID: 'a', title: 'A', blurb: 'a', category: 'Awards', weight: 1 },
        { objectID: 'b', title: 'B', blurb: 'b', category: 'Awards', weight: 4 },
      ],
      error: null,
    });

    const res = await GET(makeRequest({ claim_id: 'c-1', category: 'Awards' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(2);
    expect(body.cards[0].objectID).toBe('a');
  });

  it('throws 500 when the fetcher errors', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: 'Failed to fetch deck' });

    await expect(GET(makeRequest({ claim_id: 'c-1', category: 'Awards' }))).rejects.toThrow(
      'Failed to fetch deck',
    );
  });
});
