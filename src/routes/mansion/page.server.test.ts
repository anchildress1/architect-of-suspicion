import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchClaimCategoryCounts = vi.fn();
const mockLoadSessionCapability = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchClaimCategoryCounts: (...args: unknown[]) => mockFetchClaimCategoryCounts(...args),
}));

vi.mock('$lib/server/sessionCapability', () => ({
  loadSessionCapability: (...args: unknown[]) => mockLoadSessionCapability(...args),
}));

import { load } from './+page.server';

const VALID_CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeEvent(): Parameters<typeof load>[0] {
  return { cookies: {} } as unknown as Parameters<typeof load>[0];
}

describe('mansion +page.server load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty counts when loadSessionCapability throws (missing/invalid)', async () => {
    mockLoadSessionCapability.mockRejectedValue(new Error('Missing session capability'));
    const result = await load(makeEvent());
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockFetchClaimCategoryCounts).not.toHaveBeenCalled();
  });

  it('returns empty counts when capability is forged (mismatched hash)', async () => {
    mockLoadSessionCapability.mockRejectedValue(new Error('Invalid session capability'));
    const result = await load(makeEvent());
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockFetchClaimCategoryCounts).not.toHaveBeenCalled();
  });

  it('forwards the verified claim_id to fetchClaimCategoryCounts', async () => {
    mockLoadSessionCapability.mockResolvedValue({
      sessionId: 'session',
      claimId: VALID_CLAIM_ID,
      claimText: 'claim',
      attention: 50,
    });
    mockFetchClaimCategoryCounts.mockResolvedValue({
      counts: { Decisions: 5, Awards: 2 },
      error: null,
    });

    const result = await load(makeEvent());

    expect(mockFetchClaimCategoryCounts).toHaveBeenCalledWith(VALID_CLAIM_ID);
    expect(result).toEqual({ categoryCounts: { Decisions: 5, Awards: 2 } });
  });

  it('returns whatever counts the fetcher resolves with (even on its own error path)', async () => {
    mockLoadSessionCapability.mockResolvedValue({
      sessionId: 'session',
      claimId: VALID_CLAIM_ID,
      claimText: 'claim',
      attention: 50,
    });
    mockFetchClaimCategoryCounts.mockResolvedValue({
      counts: {},
      error: 'Failed to fetch category counts',
    });

    const result = await load(makeEvent());

    // The load tolerates fetch errors silently — the mansion page treats
    // unknown counts as "not exhausted" (see isExhausted), which is a safe
    // default. The fetcher's error logging is the audit trail.
    expect(result).toEqual({ categoryCounts: {} });
  });
});
