import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}));

import { load } from './+page.server';

function makeEvent(params: Record<string, string>): Parameters<typeof load>[0] {
  const url = new URL('http://localhost/verdict');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { url } as Parameters<typeof load>[0];
}

function setupMocks(result: { data: unknown; error: unknown }): void {
  mockSchema.mockReturnValue({
    from: mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle.mockResolvedValue(result),
        }),
      }),
    }),
  });
}

describe('verdict/+page.server load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null session when session param is missing', async () => {
    const result = await load(makeEvent({}));
    expect(result).toEqual({ session: null });
    // No DB call should be made
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('returns null session when DB returns an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupMocks({ data: null, error: { message: 'connection refused' } });
    const result = await load(makeEvent({ session: 'some-id' }));
    expect(result).toEqual({ session: null });
    expect(errorSpy).toHaveBeenCalledWith('[verdict] session lookup failed:', 'connection refused');
    errorSpy.mockRestore();
  });

  it('returns null session when data is null with no error', async () => {
    setupMocks({ data: null, error: null });
    const result = await load(makeEvent({ session: 'some-id' }));
    expect(result).toEqual({ session: null });
  });

  it('returns null session when cover_letter is null', async () => {
    setupMocks({
      data: {
        claim_text: 'Ashley avoids accountability',
        verdict: 'guilty',
        cover_letter: null,
        architect_closing: 'Closing statement.',
      },
      error: null,
    });
    const result = await load(makeEvent({ session: 'some-id' }));
    expect(result).toEqual({ session: null });
  });

  it('returns full session when all fields are present', async () => {
    setupMocks({
      data: {
        claim_text: 'Ashley avoids accountability',
        verdict: 'guilty',
        cover_letter: 'The evidence was damning.',
        architect_closing: 'I rest my case.',
      },
      error: null,
    });
    const result = await load(makeEvent({ session: 'abc-123' }));
    expect(result).toEqual({
      session: {
        cover_letter: 'The evidence was damning.',
        architect_closing: 'I rest my case.',
        claim: 'Ashley avoids accountability',
        verdict: 'guilty',
      },
    });
  });

  it('queries the correct schema, table, and session_id', async () => {
    setupMocks({
      data: {
        claim_text: 'claim',
        verdict: 'not guilty',
        cover_letter: 'Letter.',
        architect_closing: 'Done.',
      },
      error: null,
    });
    await load(makeEvent({ session: 'target-id' }));
    expect(mockSchema).toHaveBeenCalledWith('suspicion');
    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(mockEq).toHaveBeenCalledWith('session_id', 'target-id');
  });
});
