import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

const mockFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock('@sveltejs/kit', () => ({
  json: (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
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

describe('POST /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session and returns session_id', async () => {
    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle.mockResolvedValue({
            data: { session_id: 'test-uuid' },
            error: null,
          }),
        }),
      }),
    });

    const res = await POST(makeRequest({ claim: 'Test claim' }));
    const body = await res.json();

    expect(body.session_id).toBe('test-uuid');
    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(mockInsert).toHaveBeenCalledWith({ claim_text: 'Test claim' });
  });

  it('returns 400 for missing claim', async () => {
    await expect(POST(makeRequest({}))).rejects.toThrow('Missing or invalid claim');
  });

  it('returns 400 for empty claim', async () => {
    await expect(POST(makeRequest({ claim: '   ' }))).rejects.toThrow('Missing or invalid claim');
  });

  it('returns 400 for non-string claim', async () => {
    await expect(POST(makeRequest({ claim: 42 }))).rejects.toThrow('Missing or invalid claim');
  });

  it('handles database errors', async () => {
    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle.mockResolvedValue({
            data: null,
            error: { message: 'DB error' },
          }),
        }),
      }),
    });

    await expect(POST(makeRequest({ claim: 'Test claim' }))).rejects.toThrow('Failed to create session');
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
