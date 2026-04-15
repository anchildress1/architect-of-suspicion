import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Card } from '$lib/types';

const mockFetchCardsByCategory = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchCardsByCategory: (...args: unknown[]) => mockFetchCardsByCategory(...args),
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

function makeSafeCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => ({
    objectID: `card-${i}`,
    title: `Card ${i}`,
    blurb: `Blurb ${i}`,
    category: 'Philosophy',
    signal: 5,
  }));
}

describe('GET /api/cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when category param is missing', async () => {
    await expect(GET(makeRequest({}))).rejects.toThrow('Missing required parameter: category');
  });

  it('returns at most 6 cards', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: makeSafeCards(10), error: null });

    const res = await GET(makeRequest({ category: 'Philosophy' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(6);
  });

  it('returns only safe fields (no fact, tags, etc.)', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: makeSafeCards(3), error: null });

    const res = await GET(makeRequest({ category: 'Philosophy' }));
    const body = await res.json();

    for (const card of body.cards) {
      expect(card).toHaveProperty('objectID');
      expect(card).toHaveProperty('title');
      expect(card).toHaveProperty('blurb');
      expect(card).toHaveProperty('category');
      expect(card).toHaveProperty('signal');
      expect(card).not.toHaveProperty('fact');
      expect(card).not.toHaveProperty('tags');
      expect(card).not.toHaveProperty('projects');
      expect(card).not.toHaveProperty('url');
      expect(card).not.toHaveProperty('created_at');
      expect(card).not.toHaveProperty('updated_at');
      expect(card).not.toHaveProperty('deleted_at');
    }
  });

  it('passes category to fetchCardsByCategory', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ category: 'Awards' }));

    expect(mockFetchCardsByCategory).toHaveBeenCalledWith('Awards', []);
  });

  it('passes exclude list to fetchCardsByCategory', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: [], error: null });

    await GET(makeRequest({ category: 'Philosophy', exclude: 'id-1,id-2' }));

    expect(mockFetchCardsByCategory).toHaveBeenCalledWith('Philosophy', ['id-1', 'id-2']);
  });

  it('handles fetch errors', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: [], error: 'Failed to fetch cards' });

    await expect(GET(makeRequest({ category: 'Philosophy' }))).rejects.toThrow(
      'Failed to fetch cards',
    );
  });

  it('returns fewer cards when pool has less than 6', async () => {
    mockFetchCardsByCategory.mockResolvedValue({ cards: makeSafeCards(2), error: null });

    const res = await GET(makeRequest({ category: 'Philosophy' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(2);
  });
});
