import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchClaimCategoryCounts = vi.fn();
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/cards', () => ({
  fetchClaimCategoryCounts: (...args: unknown[]) => mockFetchClaimCategoryCounts(...args),
}));

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({ from: (...args: unknown[]) => mockSchemaFrom(...args) }),
  }),
}));

vi.mock('$lib/server/sessionCapability', () => ({
  SESSION_ID_COOKIE: 'session_id',
}));

import { load } from './+page.server';

const VALID_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CLAIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeEvent(cookieValue: string | undefined): Parameters<typeof load>[0] {
  return {
    cookies: {
      get: (name: string) => (name === 'session_id' ? cookieValue : undefined),
    },
  } as unknown as Parameters<typeof load>[0];
}

function setupSession(claimId: string | null, error: unknown = null) {
  const result = { data: claimId === null ? null : { claim_id: claimId }, error };
  mockSchemaFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
  });
}

describe('mansion +page.server load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty counts when the session cookie is missing', async () => {
    const result = await load(makeEvent(undefined));
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockSchemaFrom).not.toHaveBeenCalled();
    expect(mockFetchClaimCategoryCounts).not.toHaveBeenCalled();
  });

  it('returns empty counts when the session cookie is not a UUID', async () => {
    const result = await load(makeEvent('not-a-uuid'));
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockSchemaFrom).not.toHaveBeenCalled();
  });

  it('returns empty counts when the session row lookup errors', async () => {
    setupSession(null, { message: 'pg-down' });
    const result = await load(makeEvent(VALID_SESSION_ID));
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockFetchClaimCategoryCounts).not.toHaveBeenCalled();
  });

  it('returns empty counts when the session has no claim_id', async () => {
    setupSession(null);
    const result = await load(makeEvent(VALID_SESSION_ID));
    expect(result).toEqual({ categoryCounts: {} });
    expect(mockFetchClaimCategoryCounts).not.toHaveBeenCalled();
  });

  it('forwards the resolved claim_id to fetchClaimCategoryCounts', async () => {
    setupSession(VALID_CLAIM_ID);
    mockFetchClaimCategoryCounts.mockResolvedValue({
      counts: { Decisions: 5, Awards: 2 },
      error: null,
    });

    const result = await load(makeEvent(VALID_SESSION_ID));

    expect(mockFetchClaimCategoryCounts).toHaveBeenCalledWith(VALID_CLAIM_ID);
    expect(result).toEqual({ categoryCounts: { Decisions: 5, Awards: 2 } });
  });

  it('returns whatever counts the fetcher resolves with (even on its own error path)', async () => {
    setupSession(VALID_CLAIM_ID);
    mockFetchClaimCategoryCounts.mockResolvedValue({
      counts: {},
      error: 'Failed to fetch category counts',
    });

    const result = await load(makeEvent(VALID_SESSION_ID));

    // The load tolerates fetch errors silently — the mansion page treats
    // unknown counts as "not exhausted" (see isExhausted), which is a safe
    // default. The fetcher's error logging is the audit trail.
    expect(result).toEqual({ categoryCounts: {} });
  });
});
