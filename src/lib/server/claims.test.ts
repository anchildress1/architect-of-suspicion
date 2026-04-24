import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({ from: (...args: unknown[]) => mockSchemaFrom(...args) }),
  }),
}));

import { getClaimById, pickRandomClaim } from './claims';

describe('pickRandomClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one claim from the seeded set', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 'id-1', claim_text: 'Claim one' },
        { id: 'id-2', claim_text: 'Claim two' },
      ],
      error: null,
    });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });

    const { claim, error } = await pickRandomClaim();

    expect(error).toBeNull();
    expect(claim).not.toBeNull();
    expect(['id-1', 'id-2']).toContain(claim?.id);
    expect(['Claim one', 'Claim two']).toContain(claim?.text);
  });

  it('returns the only claim when one exists', async () => {
    mockSelect.mockResolvedValue({
      data: [{ id: 'only', claim_text: 'Lonely claim' }],
      error: null,
    });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });

    const { claim } = await pickRandomClaim();

    expect(claim).toEqual({ id: 'only', text: 'Lonely claim' });
  });

  it('returns an error when no claims are seeded', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });

    const { claim, error } = await pickRandomClaim();

    expect(claim).toBeNull();
    expect(error).toBe('No claims seeded');
  });

  it('returns an error when the query fails', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'down' } });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });

    const { claim, error } = await pickRandomClaim();

    expect(claim).toBeNull();
    expect(error).toBe('Failed to fetch claims');
  });
});

describe('getClaimById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupRow(row: { id: string; claim_text: string } | null, err: unknown = null) {
    mockMaybeSingle.mockResolvedValue({ data: row, error: err });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockSchemaFrom.mockReturnValue({ select: mockSelect });
  }

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
