import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGt = vi.fn();
const mockIs = vi.fn();
const mockLimit = vi.fn();
const mockNot = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { fetchCardsByCategory } from './cards';

function setupQuery(data: unknown[] | null, error: unknown = null) {
  const result = { data, error };
  // Supabase builders are thenables: they chain AND resolve when awaited.
  // .not() returns a thenable that resolves to result
  const notThenable = Object.assign(Promise.resolve(result), {});
  mockNot.mockReturnValue(notThenable);
  // .limit() returns a thenable with .not() for optional exclude chaining
  const limitThenable = Object.assign(Promise.resolve(result), { not: mockNot });
  mockLimit.mockReturnValue(limitThenable);
  mockIs.mockReturnValue({ limit: mockLimit });
  mockGt.mockReturnValue({ is: mockIs });
  mockEq.mockReturnValue({ gt: mockGt });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

const mockCards = [
  { objectID: 'a1', title: 'Card A', blurb: 'Blurb A', category: 'Philosophy', signal: 5 },
  { objectID: 'b2', title: 'Card B', blurb: 'Blurb B', category: 'Philosophy', signal: 4 },
  { objectID: 'c3', title: 'Card C', blurb: 'Blurb C', category: 'Philosophy', signal: 3 },
];

describe('fetchCardsByCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches cards by category with correct filters', async () => {
    setupQuery(mockCards);

    await fetchCardsByCategory('Philosophy');

    expect(mockFrom).toHaveBeenCalledWith('cards');
    expect(mockSelect).toHaveBeenCalledWith('objectID, title, blurb, category, signal');
    expect(mockEq).toHaveBeenCalledWith('category', 'Philosophy');
    expect(mockGt).toHaveBeenCalledWith('signal', 2);
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('returns shuffled cards on success', async () => {
    setupQuery(mockCards);

    const { cards, error } = await fetchCardsByCategory('Philosophy');

    expect(error).toBeNull();
    expect(cards).toHaveLength(3);
    // All original cards should be present (Fisher-Yates is a permutation)
    const ids = cards.map((c) => c.objectID).sort();
    expect(ids).toEqual(['a1', 'b2', 'c3']);
  });

  it('returns empty array and error message on fetch failure', async () => {
    setupQuery(null, { message: 'DB error' });

    const { cards, error } = await fetchCardsByCategory('Philosophy');

    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch cards');
  });

  it('handles null data as empty array', async () => {
    setupQuery(null);

    const { cards, error } = await fetchCardsByCategory('Philosophy');

    expect(cards).toEqual([]);
    expect(error).toBeNull();
  });

  it('excludes collected card IDs when valid UUIDs', async () => {
    setupQuery(mockCards);
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';

    await fetchCardsByCategory('Philosophy', [validUUID]);

    expect(mockNot).toHaveBeenCalledWith('objectID', 'in', `(${validUUID})`);
  });

  it('filters out invalid UUIDs from exclude list', async () => {
    setupQuery(mockCards);

    await fetchCardsByCategory('Philosophy', ['not-a-uuid', 'DROP TABLE cards']);

    // Should NOT call .not() since no valid UUIDs remain
    expect(mockNot).not.toHaveBeenCalled();
  });

  it('passes multiple valid UUIDs comma-separated', async () => {
    setupQuery(mockCards);
    const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
    const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

    await fetchCardsByCategory('Philosophy', [uuid1, uuid2]);

    expect(mockNot).toHaveBeenCalledWith('objectID', 'in', `(${uuid1},${uuid2})`);
  });
});
