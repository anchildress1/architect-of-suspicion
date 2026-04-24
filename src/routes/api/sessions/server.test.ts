import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();
const mockGetClaimById = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}));

vi.mock('$lib/server/claims', () => ({
  getClaimById: (...args: unknown[]) => mockGetClaimById(...args),
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

import { POST } from './+server';

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

function setupSessionInsert(result: { data: unknown; error: unknown }) {
  mockSchema.mockReturnValue({
    from: mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle.mockResolvedValue(result),
        }),
      }),
    }),
  });
}

describe('POST /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session with baseline attention and echoes the claim payload', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: 'claim-1', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: { session_id: 'sess-1' }, error: null });

    const res = await POST(makeRequest({ claim_id: 'claim-1' }));
    const body = await res.json();

    expect(body).toEqual({
      session_id: 'sess-1',
      claim_id: 'claim-1',
      claim_text: 'A claim',
      attention: 50,
    });
    expect(mockInsert).toHaveBeenCalledWith({
      claim_id: 'claim-1',
      claim_text: 'A claim',
      attention: 50,
    });
  });

  it('returns 400 for missing claim_id', async () => {
    await expect(POST(makeRequest({}))).rejects.toThrow('Missing or invalid claim_id');
  });

  it('returns 400 for non-string claim_id', async () => {
    await expect(POST(makeRequest({ claim_id: 42 }))).rejects.toThrow(
      'Missing or invalid claim_id',
    );
  });

  it('returns 404 when claim does not resolve', async () => {
    mockGetClaimById.mockResolvedValue({ claim: null, error: 'Claim not found' });

    await expect(POST(makeRequest({ claim_id: 'missing' }))).rejects.toThrow('Claim not found');
  });

  it('returns 500 when the claim resolver errors beyond not-found', async () => {
    mockGetClaimById.mockResolvedValue({ claim: null, error: 'Failed to fetch claim' });

    await expect(POST(makeRequest({ claim_id: 'c-1' }))).rejects.toThrow('Failed to fetch claim');
  });

  it('returns 500 when DB insert fails', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: 'claim-1', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: null, error: { message: 'pg-down' } });

    await expect(POST(makeRequest({ claim_id: 'claim-1' }))).rejects.toThrow(
      'Failed to create session',
    );
  });

  it('returns 500 when no session_id is returned', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: 'claim-1', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: null, error: null });

    await expect(POST(makeRequest({ claim_id: 'claim-1' }))).rejects.toThrow(
      'Failed to create session',
    );
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = {
      request: new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });
});
