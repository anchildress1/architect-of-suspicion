import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPickRandomClaim = vi.fn();

vi.mock('$lib/server/claims', () => ({
  pickRandomClaim: (...args: unknown[]) => mockPickRandomClaim(...args),
}));

import { load } from './+page.server';

describe('+page.server load (Summons)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the picked claim on success', async () => {
    mockPickRandomClaim.mockResolvedValue({
      claim: { id: 'id-1', text: 'A claim' },
      error: null,
    });

    const data = await load({} as Parameters<typeof load>[0]);

    expect(data).toEqual({ claim: { id: 'id-1', text: 'A claim' } });
  });

  it('returns claim=null when the pick errors (no console noise in LHCI)', async () => {
    mockPickRandomClaim.mockResolvedValue({ claim: null, error: 'Failed to fetch claims' });

    const data = await load({} as Parameters<typeof load>[0]);

    expect(data).toEqual({ claim: null });
  });

  it('returns claim=null when no claims are seeded', async () => {
    mockPickRandomClaim.mockResolvedValue({ claim: null, error: 'No claims seeded' });

    const data = await load({} as Parameters<typeof load>[0]);

    expect(data).toEqual({ claim: null });
  });
});
