import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchClaimDeck = vi.fn();
const mockRateLimitGuard = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchClaimDeck: (...args: unknown[]) => mockFetchClaimDeck(...args),
}));

vi.mock('$lib/server/rateLimit', () => ({
  rateLimitGuard: (...args: unknown[]) => mockRateLimitGuard(...args),
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
  return {
    getClientAddress: () => '127.0.0.1',
    url,
  } as Parameters<typeof GET>[0];
}

const CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitGuard.mockReturnValue(null);
  });

  it('returns 400 when claim_id is missing', async () => {
    await expect(GET(makeRequest({ category: 'Awards' }))).rejects.toThrow(
      'Missing required parameter: claim_id',
    );
  });

  it('returns 400 when claim_id is not a UUID', async () => {
    await expect(GET(makeRequest({ claim_id: 'nope', category: 'Awards' }))).rejects.toThrow(
      'Missing required parameter: claim_id',
    );
  });

  it('returns 400 when category is missing', async () => {
    await expect(GET(makeRequest({ claim_id: CLAIM_ID }))).rejects.toThrow(
      'Missing required parameter: category',
    );
  });

  it('returns 400 when category is unknown', async () => {
    await expect(GET(makeRequest({ claim_id: CLAIM_ID, category: 'About' }))).rejects.toThrow(
      'Missing required parameter: category',
    );
  });

  it('passes claim_id, category, and UUID-only exclude list to the fetcher', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await GET(
      makeRequest({
        claim_id: CLAIM_ID,
        category: 'Awards',
        exclude:
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,invalid,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    );

    expect(mockFetchClaimDeck).toHaveBeenCalledWith(CLAIM_ID, 'Awards', [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('passes empty exclude when not provided', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ claim_id: CLAIM_ID, category: 'Decisions' }));

    expect(mockFetchClaimDeck).toHaveBeenCalledWith(CLAIM_ID, 'Decisions', []);
  });

  it('drops exclude IDs when all provided values are invalid', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ claim_id: CLAIM_ID, category: 'Decisions', exclude: 'bad,also-bad' }));

    expect(mockFetchClaimDeck).toHaveBeenCalledWith(CLAIM_ID, 'Decisions', []);
  });

  it('returns the deck unchanged from the fetcher (already ordered)', async () => {
    mockFetchClaimDeck.mockResolvedValue({
      cards: [
        { objectID: 'a', title: 'A', blurb: 'a', category: 'Awards', weight: 1 },
        { objectID: 'b', title: 'B', blurb: 'b', category: 'Awards', weight: 4 },
      ],
      error: null,
    });

    const res = await GET(makeRequest({ claim_id: CLAIM_ID, category: 'Awards' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(2);
    expect(body.cards[0].objectID).toBe('a');
  });

  it('throws 500 when the fetcher errors', async () => {
    mockFetchClaimDeck.mockResolvedValue({ cards: [], error: 'Failed to fetch deck' });

    await expect(GET(makeRequest({ claim_id: CLAIM_ID, category: 'Awards' }))).rejects.toThrow(
      'Failed to fetch deck',
    );
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('blocked', { status: 429 }));

    const res = await GET(makeRequest({ claim_id: CLAIM_ID, category: 'Awards' }));

    expect(res.status).toBe(429);
    expect(mockFetchClaimDeck).not.toHaveBeenCalled();
  });
});
