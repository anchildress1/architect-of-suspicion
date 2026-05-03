import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSchema = vi.fn();
const mockSchemaFrom = vi.fn();
const mockPublicFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
    from: (...args: unknown[]) => mockPublicFrom(...args),
  }),
}));

import { getClaimById, getClaimTruthContext, getParamountCards, pickRandomClaim } from './claims';

interface CountResult {
  count: number | null;
  error: unknown;
}

interface RangeResult {
  data: { id: string; claim_text: string } | null;
  error: unknown;
}

/** Wire up the count → range(offset,offset) query chain. */
function setupRandom({
  countResult,
  rangeResult,
}: {
  countResult: CountResult;
  rangeResult?: RangeResult;
}) {
  mockSchema.mockReturnValue({ from: mockSchemaFrom });

  mockSchemaFrom.mockImplementation((table: string) => {
    if (table !== 'claims') return {};
    const selectForCount = vi.fn().mockReturnValue(Promise.resolve(countResult));
    const rangeThenable = Object.assign(
      Promise.resolve(rangeResult ?? { data: null, error: null }),
      {
        maybeSingle: vi.fn().mockResolvedValue(rangeResult ?? { data: null, error: null }),
      },
    );
    const orderForRange = vi.fn().mockReturnValue({
      range: vi.fn().mockReturnValue(rangeThenable),
    });
    const selectForRange = vi.fn().mockReturnValue({ order: orderForRange });

    return {
      select: (columns: string, options?: { head?: boolean }) => {
        if (options?.head) return selectForCount(columns, options);
        return selectForRange(columns);
      },
    };
  });
}

describe('pickRandomClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the suspicion schema', async () => {
    setupRandom({
      countResult: { count: 1, error: null },
      rangeResult: { data: { id: 'x', claim_text: 'y' }, error: null },
    });
    await pickRandomClaim();
    expect(mockSchema).toHaveBeenCalledWith('suspicion');
  });

  it('returns the selected claim row', async () => {
    setupRandom({
      countResult: { count: 3, error: null },
      rangeResult: { data: { id: 'id-1', claim_text: 'Claim one' }, error: null },
    });

    const { claim, error } = await pickRandomClaim();

    expect(error).toBeNull();
    expect(claim).toEqual({ id: 'id-1', text: 'Claim one' });
  });

  it('returns "No claims seeded" when the count is zero', async () => {
    setupRandom({ countResult: { count: 0, error: null } });
    const { claim, error } = await pickRandomClaim();
    expect(claim).toBeNull();
    expect(error).toBe('No claims seeded');
  });

  it('returns "No claims seeded" when the count is null', async () => {
    setupRandom({ countResult: { count: null, error: null } });
    const { claim, error } = await pickRandomClaim();
    expect(claim).toBeNull();
    expect(error).toBe('No claims seeded');
  });

  it('returns "Failed to fetch claims" on count error', async () => {
    setupRandom({ countResult: { count: null, error: { message: 'pg-down' } } });
    const { claim, error } = await pickRandomClaim();
    expect(claim).toBeNull();
    expect(error).toBe('Failed to fetch claims');
  });

  it('returns "Failed to fetch claims" on select error', async () => {
    setupRandom({
      countResult: { count: 2, error: null },
      rangeResult: { data: null, error: { message: 'pg-down' } },
    });
    const { claim, error } = await pickRandomClaim();
    expect(claim).toBeNull();
    expect(error).toBe('Failed to fetch claims');
  });

  it('returns "No claims seeded" when the range select returns null data', async () => {
    setupRandom({
      countResult: { count: 1, error: null },
      rangeResult: { data: null, error: null },
    });
    const { claim, error } = await pickRandomClaim();
    expect(claim).toBeNull();
    expect(error).toBe('No claims seeded');
  });

  it('covers the rejection-sampling retry in randomIndex', async () => {
    // Force getRandomValues to first produce a value ≥ limit (rejected),
    // then a valid value. Guards the "unbiased" comment on the loop.
    const original = globalThis.crypto.getRandomValues;
    let call = 0;
    const values = [0xffffffff, 0x00000001];
    globalThis.crypto.getRandomValues = ((buf: Uint32Array) => {
      buf[0] = values[call++ % values.length];
      return buf;
    }) as typeof globalThis.crypto.getRandomValues;

    setupRandom({
      countResult: { count: 3, error: null },
      rangeResult: { data: { id: 'x', claim_text: 'y' }, error: null },
    });

    const { claim } = await pickRandomClaim();
    expect(claim).toEqual({ id: 'x', text: 'y' });
    expect(call).toBeGreaterThanOrEqual(2);

    globalThis.crypto.getRandomValues = original;
  });
});

describe('getClaimById', () => {
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockMaybeSingle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupRow(row: { id: string; claim_text: string } | null, err: unknown = null) {
    mockMaybeSingle.mockResolvedValue({ data: row, error: err });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockSchema.mockReturnValue({ from: mockSchemaFrom });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });
  }

  it('uses the suspicion schema', async () => {
    setupRow({ id: 'abc', claim_text: 'Picked' });
    await getClaimById('abc');
    expect(mockSchema).toHaveBeenCalledWith('suspicion');
  });

  it('resolves a claim by id', async () => {
    setupRow({ id: 'abc', claim_text: 'Picked' });

    const { claim, error } = await getClaimById('abc');

    expect(error).toBeNull();
    expect(claim).toEqual({ id: 'abc', text: 'Picked' });
    expect(mockEq).toHaveBeenCalledWith('id', 'abc');
  });

  it('returns Claim not found when no row matches', async () => {
    setupRow(null);

    const { claim, error } = await getClaimById('missing');

    expect(claim).toBeNull();
    expect(error).toBe('Claim not found');
  });

  it('returns Failed to fetch claim on query failure', async () => {
    setupRow(null, { message: 'pg-down' });

    const { claim, error } = await getClaimById('xyz');

    expect(claim).toBeNull();
    expect(error).toBe('Failed to fetch claim');
  });
});

describe('getClaimTruthContext', () => {
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockMaybeSingle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupRow(
    row: { hireable_truth: string; desired_verdict: string } | null,
    err: unknown = null,
  ) {
    mockMaybeSingle.mockResolvedValue({ data: row, error: err });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockSchema.mockReturnValue({ from: mockSchemaFrom });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });
  }

  it('uses the suspicion schema', async () => {
    setupRow({ hireable_truth: 't', desired_verdict: 'pardon' });
    await getClaimTruthContext('abc');
    expect(mockSchema).toHaveBeenCalledWith('suspicion');
  });

  it('selects only the truth + desired_verdict columns', async () => {
    setupRow({ hireable_truth: 't', desired_verdict: 'accuse' });
    await getClaimTruthContext('abc');
    expect(mockSelect).toHaveBeenCalledWith('hireable_truth, desired_verdict');
  });

  it('returns the truth context on a hit', async () => {
    setupRow({
      hireable_truth: 'Ashley weaponizes AI',
      desired_verdict: 'pardon',
    });

    const { context, error } = await getClaimTruthContext('abc');

    expect(error).toBeNull();
    expect(context).toEqual({
      hireableTruth: 'Ashley weaponizes AI',
      desiredVerdict: 'pardon',
    });
  });

  it('returns Claim not found when the row is missing', async () => {
    setupRow(null);

    const { context, error } = await getClaimTruthContext('missing');

    expect(context).toBeNull();
    expect(error).toBe('Claim not found');
  });

  it('returns Failed to fetch claim truth on query error', async () => {
    setupRow(null, { message: 'pg-down' });

    const { context, error } = await getClaimTruthContext('xyz');

    expect(context).toBeNull();
    expect(error).toBe('Failed to fetch claim truth');
  });

  it('rejects rows with an out-of-range desired_verdict (corrupt DB state)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupRow({ hireable_truth: 't', desired_verdict: 'maybe' });

    const { context, error } = await getClaimTruthContext('xyz');

    expect(context).toBeNull();
    expect(error).toBe('Invalid claim truth state');
    errorSpy.mockRestore();
  });
});

describe('getParamountCards', () => {
  // Two-step query: step 1 hits suspicion.claim_cards, step 2 hits public.cards.
  const mockClaimSelect = vi.fn();
  const mockClaimEqId = vi.fn();
  const mockClaimEqParamount = vi.fn();

  const mockCardsSelect = vi.fn();
  const mockCardsIn = vi.fn();
  const mockCardsIs = vi.fn();

  type CardRow = {
    objectID: string;
    title: string;
    blurb: string;
    fact: string;
    category: string;
    signal: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup({
    claimRows,
    claimErr = null,
    cardRows,
    cardErr = null,
  }: {
    claimRows: Array<{ card_id: string }> | null;
    claimErr?: unknown;
    cardRows?: CardRow[] | null;
    cardErr?: unknown;
  }) {
    // Step 1: suspicion.claim_cards
    mockClaimEqParamount.mockResolvedValue({ data: claimRows, error: claimErr });
    mockClaimEqId.mockReturnValue({ eq: mockClaimEqParamount });
    mockClaimSelect.mockReturnValue({ eq: mockClaimEqId });
    mockSchema.mockReturnValue({ from: mockSchemaFrom });
    mockSchemaFrom.mockReturnValue({ select: mockClaimSelect });

    // Step 2: public.cards
    mockCardsIs.mockResolvedValue({ data: cardRows ?? [], error: cardErr });
    mockCardsIn.mockReturnValue({ is: mockCardsIs });
    mockCardsSelect.mockReturnValue({ in: mockCardsIn });
    mockPublicFrom.mockReturnValue({ select: mockCardsSelect });
  }

  it('queries claim_cards then public.cards filtered to paramount=true', async () => {
    setup({ claimRows: [{ card_id: 'c-1' }], cardRows: [] });
    await getParamountCards('claim-1');

    expect(mockSchemaFrom).toHaveBeenCalledWith('claim_cards');
    expect(mockClaimEqId).toHaveBeenCalledWith('claim_id', 'claim-1');
    expect(mockClaimEqParamount).toHaveBeenCalledWith('is_paramount', true);
    expect(mockPublicFrom).toHaveBeenCalledWith('cards');
    expect(mockCardsIn).toHaveBeenCalledWith('objectID', ['c-1']);
    expect(mockCardsIs).toHaveBeenCalledWith('deleted_at', null);
  });

  it('returns the joined cards array on a hit', async () => {
    setup({
      claimRows: [{ card_id: 'c-1' }, { card_id: 'c-2' }],
      cardRows: [
        {
          objectID: 'c-1',
          title: 'Card One',
          blurb: 'b1',
          fact: 'f1',
          category: 'Awards',
          signal: 5,
        },
        {
          objectID: 'c-2',
          title: 'Card Two',
          blurb: 'b2',
          fact: 'f2',
          category: 'Constraints',
          signal: 4,
        },
      ],
    });

    const { cards, error } = await getParamountCards('claim-1');

    expect(error).toBeNull();
    expect(cards.map((c) => c.objectID)).toEqual(['c-1', 'c-2']);
  });

  it('skips orphaned paramount rows when the cards lookup drops them', async () => {
    // Soft-deleted cards drop out of step 2 even though the claim_cards row
    // still references them. The resulting set is the intersection.
    setup({
      claimRows: [{ card_id: 'c-orphan' }, { card_id: 'c-1' }],
      cardRows: [
        {
          objectID: 'c-1',
          title: 'Card One',
          blurb: 'b1',
          fact: 'f1',
          category: 'Awards',
          signal: 5,
        },
      ],
    });

    const { cards } = await getParamountCards('claim-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].objectID).toBe('c-1');
  });

  it('returns empty array (no step 2 query) when no paramount cards exist', async () => {
    setup({ claimRows: [] });
    const { cards, error } = await getParamountCards('claim-1');
    expect(cards).toEqual([]);
    expect(error).toBeNull();
    expect(mockPublicFrom).not.toHaveBeenCalled();
  });

  it('returns error string and empty cards on step 1 failure', async () => {
    setup({ claimRows: null, claimErr: { message: 'pg-down' } });
    const { cards, error } = await getParamountCards('claim-1');
    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch paramount cards');
  });

  it('returns error string and empty cards on step 2 failure', async () => {
    setup({
      claimRows: [{ card_id: 'c-1' }],
      cardRows: null,
      cardErr: { message: 'cards-down' },
    });
    const { cards, error } = await getParamountCards('claim-1');
    expect(cards).toEqual([]);
    expect(error).toBe('Failed to fetch paramount cards');
  });
});
