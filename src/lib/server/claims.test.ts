import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSchema = vi.fn();
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}));

import { getClaimById, pickRandomClaim } from './claims';

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
