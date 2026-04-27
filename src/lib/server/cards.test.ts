import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Step 1 mock: suspicion.claim_cards ─────────────────────────────────────

const mockClaimNot = vi.fn();
const mockClaimEq = vi.fn();
const mockClaimSelect = vi.fn();
const mockSchemaFrom = vi.fn();

// ─── Step 2 mock: public.cards ───────────────────────────────────────────────

const mockCardIs = vi.fn();
const mockCardEq = vi.fn();
const mockCardIn = vi.fn();
const mockCardSelect = vi.fn();
const mockPublicFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({ from: (...args: unknown[]) => mockSchemaFrom(...args) }),
    from: (...args: unknown[]) => mockPublicFrom(...args),
  }),
}));

import { fetchClaimDeck, fetchClaimDeckSize, fetchClaimCategoryCounts } from './cards';

const VALID_CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CARD_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

type ClaimRow = {
  card_id: string;
  ambiguity: number;
  surprise: number;
  rewritten_blurb: string;
};

type CardRow = {
  objectID: string;
  title: string;
  category: string;
};

/**
 * Wire up both query steps:
 *   Step 1: suspicion.claim_cards → claimRows
 *   Step 2: public.cards → cardRows
 */
function setupQueries(
  claimRows: ClaimRow[] | null,
  cardRows: CardRow[] | null,
  claimError: unknown = null,
  cardError: unknown = null,
) {
  // Step 1: .schema('suspicion').from('claim_cards').select(...).eq('claim_id', ...) → { not } or resolves
  const claimResult = { data: claimRows, error: claimError };
  const claimNotThenable = Object.assign(Promise.resolve(claimResult), {});
  mockClaimNot.mockReturnValue(claimNotThenable);
  const claimEqThenable = Object.assign(Promise.resolve(claimResult), { not: mockClaimNot });
  mockClaimEq.mockReturnValue(claimEqThenable);
  mockClaimSelect.mockReturnValue({ eq: mockClaimEq });
  mockSchemaFrom.mockReturnValue({ select: mockClaimSelect });

  // Step 2: .from('cards').select(...).in(...).eq(...).is(...) → resolves
  const cardResult = { data: cardRows, error: cardError };
  const cardIsThenable = Object.assign(Promise.resolve(cardResult), {});
  mockCardIs.mockReturnValue(cardIsThenable);
  mockCardEq.mockReturnValue({ is: mockCardIs });
  mockCardIn.mockReturnValue({ eq: mockCardEq });
  mockCardSelect.mockReturnValue({ in: mockCardIn });
  mockPublicFrom.mockReturnValue({ select: mockCardSelect });
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
    setupQueries(
      [
        { card_id: 'aaa', ambiguity: 5, surprise: 5, rewritten_blurb: 'high charge' },
        { card_id: 'bbb', ambiguity: 1, surprise: 2, rewritten_blurb: 'low charge' },
        { card_id: 'ccc', ambiguity: 3, surprise: 3, rewritten_blurb: 'mid charge' },
      ],
      [
        { objectID: 'aaa', title: 'High', category: 'Decisions' },
        { objectID: 'bbb', title: 'Low', category: 'Decisions' },
        { objectID: 'ccc', title: 'Mid', category: 'Decisions' },
      ],
    );

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Decisions');

    expect(error).toBeNull();
    expect(cards.map((c) => c.objectID)).toEqual(['bbb', 'ccc', 'aaa']);
    expect(cards.map((c) => c.weight)).toEqual([2, 9, 25]);
  });

  it('uses claim_id in step-1 query and category + deleted_at in step-2 query', async () => {
    setupQueries([{ card_id: VALID_CARD_ID, ambiguity: 1, surprise: 1, rewritten_blurb: 'x' }], []);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(mockClaimEq).toHaveBeenCalledWith('claim_id', VALID_CLAIM_ID);
    expect(mockCardEq).toHaveBeenCalledWith('category', 'Awards');
    expect(mockCardIs).toHaveBeenCalledWith('deleted_at', null);
  });

  it('breaks ties deterministically by objectID', async () => {
    setupQueries(
      [
        { card_id: 'z-id', ambiguity: 2, surprise: 3, rewritten_blurb: 'z' },
        { card_id: 'a-id', ambiguity: 2, surprise: 3, rewritten_blurb: 'a' },
      ],
      [
        { objectID: 'z-id', title: 'Z', category: 'Awards' },
        { objectID: 'a-id', title: 'A', category: 'Awards' },
      ],
    );

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards.map((c) => c.objectID)).toEqual(['a-id', 'z-id']);
  });

  it('substitutes rewritten_blurb for the player-facing blurb', async () => {
    setupQueries(
      [{ card_id: VALID_CARD_ID, ambiguity: 3, surprise: 3, rewritten_blurb: 'pulls two ways' }],
      [{ objectID: VALID_CARD_ID, title: 'Card', category: 'Awards' }],
    );

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards[0].blurb).toBe('pulls two ways');
  });

  it('rejects invalid claim_id without hitting the DB', async () => {
    setupQueries([], []);

    const { cards, error } = await fetchClaimDeck('not-a-uuid', 'Awards');

    expect(error).toBe('Invalid claim_id');
    expect(cards).toEqual([]);
    expect(mockSchemaFrom).not.toHaveBeenCalled();
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('passes valid exclude UUIDs to the step-1 query', async () => {
    setupQueries([], []);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards', [VALID_CARD_ID]);

    expect(mockClaimNot).toHaveBeenCalledWith('card_id', 'in', `(${VALID_CARD_ID})`);
  });

  it('filters non-UUIDs out of the exclude list', async () => {
    setupQueries([], []);

    await fetchClaimDeck(VALID_CLAIM_ID, 'Awards', ['nope', 'DROP TABLE']);

    expect(mockClaimNot).not.toHaveBeenCalled();
  });

  it('returns error and empty cards when step-1 (claim_cards) fails', async () => {
    setupQueries(null, null, { message: 'pg-down' });

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch deck');
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('returns error and empty cards when step-2 (cards) fails', async () => {
    setupQueries(
      [{ card_id: VALID_CARD_ID, ambiguity: 2, surprise: 2, rewritten_blurb: 'x' }],
      null,
      null,
      { message: 'cards-down' },
    );

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch deck');
  });

  it('returns empty deck without hitting step-2 when claim_cards is empty', async () => {
    setupQueries([], []);

    const { cards, error } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toEqual([]);
    expect(error).toBeNull();
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('skips claim_cards rows whose card_id has no match in public.cards', async () => {
    setupQueries([{ card_id: 'dangling', ambiguity: 2, surprise: 2, rewritten_blurb: 'x' }], []);

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Awards');

    expect(cards).toHaveLength(0);
  });

  it('skips cards filtered out by category in step-2', async () => {
    setupQueries(
      [
        { card_id: 'aaa', ambiguity: 1, surprise: 1, rewritten_blurb: 'x' },
        { card_id: 'bbb', ambiguity: 1, surprise: 1, rewritten_blurb: 'y' },
      ],
      // step-2 only returns the matching-category card
      [{ objectID: 'aaa', title: 'A', category: 'Decisions' }],
    );

    const { cards } = await fetchClaimDeck(VALID_CLAIM_ID, 'Decisions');

    expect(cards).toHaveLength(1);
    expect(cards[0].objectID).toBe('aaa');
  });
});

function setupCategoryCountsQueries(
  claimRows: Array<{ card_id: string }> | null,
  cardRows: Array<{ category: string }> | null,
  claimError: unknown = null,
  cardError: unknown = null,
) {
  // Step 1: schema('suspicion').from('claim_cards').select('card_id').eq('claim_id', ...)
  const claimResult = { data: claimRows, error: claimError };
  const claimEqThenable = Object.assign(Promise.resolve(claimResult), {});
  const claimEq = vi.fn().mockReturnValue(claimEqThenable);
  const claimSelect = vi.fn().mockReturnValue({ eq: claimEq });
  mockSchemaFrom.mockReturnValue({ select: claimSelect });

  // Step 2: from('cards').select('category').in('objectID', ids).is('deleted_at', null)
  const cardResult = { data: cardRows, error: cardError };
  const cardIsThenable = Object.assign(Promise.resolve(cardResult), {});
  const cardIs = vi.fn().mockReturnValue(cardIsThenable);
  const cardIn = vi.fn().mockReturnValue({ is: cardIs });
  const cardSelect = vi.fn().mockReturnValue({ in: cardIn });
  mockPublicFrom.mockReturnValue({ select: cardSelect });
}

describe('fetchClaimCategoryCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns counts={} with an error message for an invalid claim_id', async () => {
    const { counts, error } = await fetchClaimCategoryCounts('not-a-uuid');
    expect(counts).toEqual({});
    expect(error).toBe('Invalid claim_id');
    expect(mockSchemaFrom).not.toHaveBeenCalled();
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('aggregates rows across categories', async () => {
    setupCategoryCountsQueries(
      [{ card_id: '1' }, { card_id: '2' }, { card_id: '3' }, { card_id: '4' }],
      [
        { category: 'Decisions' },
        { category: 'Decisions' },
        { category: 'Awards' },
        { category: 'Decisions' },
      ],
    );

    const { counts, error } = await fetchClaimCategoryCounts(VALID_CLAIM_ID);

    expect(error).toBeNull();
    expect(counts).toEqual({ Decisions: 3, Awards: 1 });
  });

  it('returns counts={} without hitting step-2 when claim_cards is empty', async () => {
    setupCategoryCountsQueries([], []);

    const { counts, error } = await fetchClaimCategoryCounts(VALID_CLAIM_ID);

    expect(counts).toEqual({});
    expect(error).toBeNull();
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('returns error when step-1 (claim_cards) fails', async () => {
    setupCategoryCountsQueries(null, null, { message: 'pg-down' });

    const { counts, error } = await fetchClaimCategoryCounts(VALID_CLAIM_ID);

    expect(counts).toEqual({});
    expect(error).toBe('Failed to fetch category counts');
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('returns error when step-2 (cards) fails', async () => {
    setupCategoryCountsQueries([{ card_id: VALID_CARD_ID }], null, null, { message: 'cards-down' });

    const { counts, error } = await fetchClaimCategoryCounts(VALID_CLAIM_ID);

    expect(counts).toEqual({});
    expect(error).toBe('Failed to fetch category counts');
  });

  it('treats null cardRows from step-2 as zero counts (no soft-deleted rows)', async () => {
    // Soft-deleted cards filtered by .is('deleted_at', null) leave no surviving rows.
    setupCategoryCountsQueries([{ card_id: VALID_CARD_ID }], []);

    const { counts, error } = await fetchClaimCategoryCounts(VALID_CLAIM_ID);

    expect(counts).toEqual({});
    expect(error).toBeNull();
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

  it('returns count=0 with an error on query failure', async () => {
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
