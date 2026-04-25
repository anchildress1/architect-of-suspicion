import { describe, it, expect, vi, beforeEach } from 'vitest';
import { error as kitError, isHttpError } from '@sveltejs/kit';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSchema = vi.fn();
const mockLoadSessionCapability = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}));

vi.mock('$lib/server/sessionCapability', () => ({
  loadSessionCapability: (...args: unknown[]) => mockLoadSessionCapability(...args),
}));

import { load } from './+page.server';

function makeEvent(): Parameters<typeof load>[0] {
  return {
    cookies: {} as Parameters<typeof load>[0]['cookies'],
    url: new URL('http://localhost/verdict'),
  } as Parameters<typeof load>[0];
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
    mockLoadSessionCapability.mockResolvedValue({
      sessionId: 'target-id',
      claimId: 'claim-id',
      claimText: 'Claim from session',
      attention: 50,
    });
  });

  it('returns null session when capability validation fails with 401', async () => {
    let capabilityErr: unknown;
    try { kitError(401, 'Invalid session capability'); } catch (e) { capabilityErr = e; }
    mockLoadSessionCapability.mockRejectedValue(capabilityErr);

    const result = await load(makeEvent());

    expect(result).toEqual({ session: null });
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('re-throws when capability check fails with infrastructure error', async () => {
    let infraErr: unknown;
    try { kitError(500, 'Failed to read session'); } catch (e) { infraErr = e; }
    mockLoadSessionCapability.mockRejectedValue(infraErr);

    await expect(load(makeEvent())).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && (err as { status: number }).status === 500,
    );
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('re-throws unexpected non-HTTP errors from capability check', async () => {
    mockLoadSessionCapability.mockRejectedValue(new TypeError('network failure'));

    await expect(load(makeEvent())).rejects.toThrow('network failure');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('throws 500 when DB returns an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupMocks({ data: null, error: { message: 'connection refused' } });

    await expect(load(makeEvent())).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && (err as { status: number }).status === 500,
    );
    expect(errorSpy).toHaveBeenCalledWith('[verdict] session lookup failed:', 'connection refused');
    errorSpy.mockRestore();
  });

  it('returns null session when data is null with no error', async () => {
    setupMocks({ data: null, error: null });
    const result = await load(makeEvent());
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
    const result = await load(makeEvent());
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
    const result = await load(makeEvent());
    expect(result).toEqual({
      session: {
        cover_letter: 'The evidence was damning.',
        architect_closing: 'I rest my case.',
        claim: 'Ashley avoids accountability',
        verdict: 'guilty',
      },
    });
  });

  it('queries the correct schema, table, and session_id from validated capability', async () => {
    setupMocks({
      data: {
        claim_text: 'claim',
        verdict: 'not guilty',
        cover_letter: 'Letter.',
        architect_closing: 'Done.',
      },
      error: null,
    });

    await load(makeEvent());

    expect(mockSchema).toHaveBeenCalledWith('suspicion');
    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(mockEq).toHaveBeenCalledWith('session_id', 'target-id');
  });

  it('returns session with null architect_closing when cover_letter is present but closing is absent', async () => {
    setupMocks({
      data: {
        claim_text: 'Ashley avoids accountability',
        verdict: 'guilty',
        cover_letter: 'The evidence was damning.',
        architect_closing: null,
      },
      error: null,
    });
    const result = await load(makeEvent());
    expect(result).toEqual({
      session: {
        cover_letter: 'The evidence was damning.',
        architect_closing: null,
        claim: 'Ashley avoids accountability',
        verdict: 'guilty',
      },
    });
  });
});
