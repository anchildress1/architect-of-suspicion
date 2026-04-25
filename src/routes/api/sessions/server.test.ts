import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();
const mockGetClaimById = vi.fn();
const mockRateLimitGuard = vi.fn();
const mockMintSessionCapability = vi.fn();
const mockSetSessionCookies = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}));

vi.mock('$lib/server/claims', () => ({
  getClaimById: (...args: unknown[]) => mockGetClaimById(...args),
}));

vi.mock('$lib/server/rateLimit', () => ({
  rateLimitGuard: (...args: unknown[]) => mockRateLimitGuard(...args),
}));

vi.mock('$lib/server/sessionCapability', () => ({
  mintSessionCapability: (...args: unknown[]) => mockMintSessionCapability(...args),
  setSessionCookies: (...args: unknown[]) => mockSetSessionCookies(...args),
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
    cookies: {} as Parameters<typeof POST>[0]['cookies'],
    getClientAddress: () => '127.0.0.1',
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
    mockRateLimitGuard.mockReturnValue(null);
    mockMintSessionCapability.mockReturnValue({ token: 'cap-token', tokenHash: 'a'.repeat(64) });
  });

  it('creates a session with baseline attention and sets capability cookies', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: { session_id: 'sess-1' }, error: null });

    const event = makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' });
    const res = await POST(event);
    const body = await res.json();

    expect(body).toEqual({
      session_id: 'sess-1',
      claim_id: '550e8400-e29b-41d4-a716-446655440000',
      claim_text: 'A claim',
      attention: 50,
    });
    expect(mockInsert).toHaveBeenCalledWith({
      claim_id: '550e8400-e29b-41d4-a716-446655440000',
      claim_text: 'A claim',
      attention: 50,
      session_token_hash: 'a'.repeat(64),
    });
    expect(mockSetSessionCookies).toHaveBeenCalledWith(event.cookies, 'sess-1', 'cap-token');
  });

  it('returns 400 for missing claim_id', async () => {
    await expect(POST(makeRequest({}))).rejects.toThrow('Missing or invalid claim_id');
  });

  it('returns 400 for non-string claim_id', async () => {
    await expect(POST(makeRequest({ claim_id: 42 }))).rejects.toThrow(
      'Missing or invalid claim_id',
    );
  });

  it('returns 400 for non-uuid claim_id', async () => {
    await expect(POST(makeRequest({ claim_id: 'claim-1' }))).rejects.toThrow(
      'Missing or invalid claim_id',
    );
  });

  it('returns 404 when claim does not resolve', async () => {
    mockGetClaimById.mockResolvedValue({ claim: null, error: 'Claim not found' });

    await expect(
      POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toThrow('Claim not found');
  });

  it('returns 500 when the claim resolver errors beyond not-found', async () => {
    mockGetClaimById.mockResolvedValue({ claim: null, error: 'Failed to fetch claim' });

    await expect(
      POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toThrow('Failed to fetch claim');
  });

  it('returns 500 when DB insert fails', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: null, error: { message: 'pg-down' } });

    await expect(
      POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toThrow('Failed to create session');
  });

  it('returns 500 when no session_id is returned', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: null, error: null });

    await expect(
      POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toThrow('Failed to create session');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });

  it('returns 400 for invalid Content-Length header', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 'oops' },
        body: JSON.stringify({ claim_id: '550e8400-e29b-41d4-a716-446655440000' }),
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Invalid Content-Length header');
  });

  it('returns 413 when request body exceeds max size', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '5000' },
        body: JSON.stringify({ claim_id: '550e8400-e29b-41d4-a716-446655440000' }),
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Request body too large (max 1024 bytes)');
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('slow down', { status: 429 }));

    const res = await POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' }));

    expect(res.status).toBe(429);
    expect(mockGetClaimById).not.toHaveBeenCalled();
  });

  it('does not set session cookies when insert fails', async () => {
    mockGetClaimById.mockResolvedValue({
      claim: { id: '550e8400-e29b-41d4-a716-446655440000', text: 'A claim' },
      error: null,
    });
    setupSessionInsert({ data: null, error: { message: 'pg-down' } });

    await expect(
      POST(makeRequest({ claim_id: '550e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toThrow('Failed to create session');

    expect(mockSetSessionCookies).not.toHaveBeenCalled();
  });
});
