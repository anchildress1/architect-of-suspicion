import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockEqClaim = vi.fn();
const mockEqCategory = vi.fn();
const mockIsDeleted = vi.fn();
const mockNot = vi.fn();
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({ from: (...args: unknown[]) => mockSchemaFrom(...args) }),
    from: vi.fn(),
  }),
}));

import { fetchClaimDeck, fetchClaimDeckSize } from './cards';

const VALID_CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CARD_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * The query chain is:
 *   from('claim_cards').select(...).eq('claim_id', ...).eq('card.category', ...).is('card.deleted_at', null)[.not(...)]
 * The terminal `is()` (or `not()` if exclude is used) resolves to the query result.
 */
function setupQuery(rows: unknown[] | null, error: unknown = null) {
  const result = { data: rows, error };
  const notThenable = Object.assign(Promise.resolve(result), {});
  mockNot.mockReturnValue(notThenable);
  const isThenable = Object.assign(Promise.resolve(result), { not: mockNot });
  mockIsDeleted.mockReturnValue(isThenable);
  mockEqCategory.mockReturnValue({ is: mockIsDeleted });
  mockEqClaim.mockReturnValue({ eq: mockEqCategory });
  mockSelect.mockReturnValue({ eq: mockEqClaim });
  mockSchemaFrom.mockReturnValue({ select: mockSelect });
}

function setupCount(count: number, error: unknown = null) {
  const result = { count, error };
  const eqThenable = Object.assign(Promise.resolve(result), {});
  const selectForCount = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqThenable) });
  mockSchemaFrom.mockReturnValue({ select: selectForCount });
}

describe('fetchClaimDeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Witness-ordered cards (least ambiguity*surprise first)', async () => {
    setupQuery([
      {
        card_id: 'a',
        ambiguity: 5,
        surprise: 5,
        rewritten_blurb: 'high charge',
        card: { objectID: 'a', title: 'High', category: 'Decisions', deleted_at: null },
      },
      {
        card_id: 'b',
        ambiguity: 1,
        surprise: 2,
        rewritten_blurb: 'low charge',
        card: { objectID: 'b', title: 'Low', category: 'Decisions', deleted_at: null },
      },
      {
        card_id: 'c',
        ambiguity: 3,
        surprise: 3,
        rewritten_blurb: 'mid charge',
        card: { objectID: 'c', title: 'Mid', category: 'Decisions', deleted_at: null },
      },
    ]);

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Decisions');

    expect(error).toBeNull();
    expect(cards.map((c) => c.objectID)).toEqual(['b', 'c', 'a']);
    expect(cards.map((c) => c.weight)).toEqual([2, 9, 25]);
  });

  it('pushes category and soft-delete filters into the query', async () => {
    setupQuery([]);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(mockEqClaim).toHaveBeenCalledWith('claim_id', VALID_CLAIM_ID);
    expect(mockEqCategory).toHaveBeenCalledWith('card.category', 'Awards');
    expect(mockIsDeleted).toHaveBeenCalledWith('card.deleted_at', null);
  });

  it('breaks ties deterministically by objectID', async () => {
    setupQuery([
      {
        card_id: 'z-id',
        ambiguity: 2,
        surprise: 3,
        rewritten_blurb: 'z',
        card: { objectID: 'z-id', title: 'Z', category: 'Awards', deleted_at: null },
      },
      {
        card_id: 'a-id',
        ambiguity: 2,
        surprise: 3,
        rewritten_blurb: 'a',
        card: { objectID: 'a-id', title: 'A', category: 'Awards', deleted_at: null },
      },
    ]);

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards.map((c) => c.objectID)).toEqual(['a-id', 'z-id']);
  });

  it('substitutes the rewritten_blurb for the player-facing blurb', async () => {
    setupQuery([
      {
        card_id: VALID_CARD_ID,
        ambiguity: 3,
        surprise: 3,
        rewritten_blurb: 'pulls two ways',
        card: { objectID: VALID_CARD_ID, title: 'Card', category: 'Awards', deleted_at: null },
      },
    ]);

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards[0].blurb).toBe('pulls two ways');
  });

  it('handles array-shaped joined card row', async () => {
    setupQuery([
      {
        card_id: 'a',
        ambiguity: 2,
        surprise: 2,
        rewritten_blurb: 'x',
        card: [{ objectID: 'a', title: 'X', category: 'Awards', deleted_at: null }],
      },
    ]);

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toHaveLength(1);
  });

  it('rejects invalid claim_id without hitting the DB', async () => {
    setupQuery([]);

    const { cards, error } = await fetchClaimDeck('not-a-uuid', 'Awards');

    expect(error).toBe('Invalid claim_id');
    expect(cards).toEqual([]);
    expect(mockSchemaFrom).not.toHaveBeenCalled();
  });

  it('passes valid exclude UUIDs to the query', async () => {
    setupQuery([]);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards', [VALID_CARD_ID]);

    expect(mockNot).toHaveBeenCalledWith('card_id', 'in', `(${VALID_CARD_ID})`);
  });

  it('filters non-UUIDs out of the exclude list', async () => {
    setupQuery([]);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards', ['nope', 'DROP TABLE']);

    expect(mockNot).not.toHaveBeenCalled();
  });

  it('returns the query error message on failure', async () => {
    setupQuery(null, { message: 'pg-down' });

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch deck');
  });

  it('skips rows whose joined card is null', async () => {
    setupQuery([
      {
        card_id: 'dangling',
        ambiguity: 2,
        surprise: 2,
        rewritten_blurb: 'x',
        card: null,
      },
    ]);

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toHaveLength(0);
  });
});

describe('fetchClaimDeckSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 with an error message for invalid claim_id', async () => {
    const { count, error } = await fetchClaimDeckSize('not-a-uuid');
    expect(count).toBe(0);
    expect(error).toBe('Invalid claim_id');
  });

  it('returns the row count when the query succeeds', async () => {
    setupCount(42);
    const { count, error } = await fetchClaimDeckSize(VALID_CLAIM_ID);
    expect(count).toBe(42);
    expect(error).toBeNull();
  });

  it('returns null count=0 with an error on query failure', async () => {
    setupCount(0, { message: 'oops' });
    const { count, error } = await fetchClaimDeckSize(VALID_CLAIM_ID);
    expect(count).toBe(0);
    expect(error).toBe('Failed to fetch deck size');
  });

  it('returns count=0 when the query returns null count with no error', async () => {
    setupCount(null as unknown as number);
    const { count, error } = await fetchClaimDeckSize(VALID_CLAIM_ID);
    expect(count).toBe(0);
    expect(error).toBeNull();
  });
});
