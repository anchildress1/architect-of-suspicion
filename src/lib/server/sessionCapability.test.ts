import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
    }),
  }),
}));

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  },
}));

import {
  hashSessionCapability,
  loadSessionCapability,
  mintSessionCapability,
  setSessionCookies,
  SESSION_ID_COOKIE,
  SESSION_TOKEN_COOKIE,
} from './sessionCapability';

interface CookieStore {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function makeCookies(values: Record<string, string | undefined>): CookieStore {
  return {
    get: vi.fn((key: string) => values[key]),
    set: vi.fn(),
  };
}

function setupSessionLookup(result: { data: unknown; error: unknown }) {
  mockSchemaFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
  });
}

describe('sessionCapability helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('hashes capability tokens deterministically', () => {
    const hashA = hashSessionCapability('token-1');
    const hashB = hashSessionCapability('token-1');
    const hashC = hashSessionCapability('token-2');

    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it('mints random capability tokens and hashes', () => {
    const one = mintSessionCapability();
    const two = mintSessionCapability();

    expect(one.token).not.toBe(two.token);
    expect(one.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(two.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets both session cookies with secure=false outside production', () => {
    const cookies = makeCookies({});

    setSessionCookies(
      cookies as unknown as Parameters<typeof setSessionCookies>[0],
      'session-id',
      'cap-token',
    );

    expect(cookies.set).toHaveBeenCalledTimes(2);
    expect(cookies.set).toHaveBeenNthCalledWith(
      1,
      SESSION_ID_COOKIE,
      'session-id',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', secure: false }),
    );
    expect(cookies.set).toHaveBeenNthCalledWith(
      2,
      SESSION_TOKEN_COOKIE,
      'cap-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', secure: false }),
    );
  });

  it('sets both session cookies with secure=true in production', () => {
    process.env.NODE_ENV = 'production';
    const cookies = makeCookies({});

    setSessionCookies(
      cookies as unknown as Parameters<typeof setSessionCookies>[0],
      'session-id',
      'cap-token',
    );

    expect(cookies.set).toHaveBeenCalledWith(
      SESSION_ID_COOKIE,
      'session-id',
      expect.objectContaining({ secure: true }),
    );
    expect(cookies.set).toHaveBeenCalledWith(
      SESSION_TOKEN_COOKIE,
      'cap-token',
      expect.objectContaining({ secure: true }),
    );
  });

  it('loads and validates session capability from cookies + DB', async () => {
    const token = 'cap-token-cap-token-cap-token';
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: 61,
        session_token_hash: hashSessionCapability(token),
      },
      error: null,
    });

    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: token,
    });

    const session = await loadSessionCapability(
      cookies as unknown as Parameters<typeof loadSessionCapability>[0],
    );

    expect(session).toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      claimId: '11111111-1111-4111-8111-111111111111',
      claimText: 'Claim text',
      attention: 61,
    });
  });

  it('throws when session capability cookies are missing', async () => {
    const cookies = makeCookies({});

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Missing session capability');
  });

  it('throws when session id cookie is not a UUID', async () => {
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: 'not-a-uuid',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Invalid session capability');
  });

  it('throws when token looks malformed', async () => {
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'short',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Invalid session capability');
  });

  it('throws when token is too long', async () => {
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'x'.repeat(201),
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Invalid session capability');
  });

  it('throws when DB read fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupSessionLookup({ data: null, error: { message: 'pg-down' } });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Failed to read session');
    expect(errorSpy).toHaveBeenCalledWith('[session-capability] sessions read failed:', 'pg-down');
    errorSpy.mockRestore();
  });

  it('throws when session is missing', async () => {
    setupSessionLookup({ data: null, error: null });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Session not found');
  });

  it('throws when session has no claim_id', async () => {
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: null,
        claim_text: 'Claim text',
        attention: 50,
        session_token_hash: hashSessionCapability('cap-token-cap-token-cap-token'),
      },
      error: null,
    });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Session has no claim');
  });

  it('throws when DB token hash is malformed', async () => {
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: 50,
        session_token_hash: 'not-a-hash',
      },
      error: null,
    });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Invalid session capability state');
  });

  it('throws when token hash does not match cookie token', async () => {
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: 50,
        session_token_hash: hashSessionCapability('different-token-different-token-xx'),
      },
      error: null,
    });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: 'cap-token-cap-token-cap-token',
    });

    await expect(
      loadSessionCapability(cookies as unknown as Parameters<typeof loadSessionCapability>[0]),
    ).rejects.toThrow('Invalid session capability');
  });

  it('falls back to baseline attention when DB attention is null', async () => {
    const token = 'cap-token-cap-token-cap-token';
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: null,
        session_token_hash: hashSessionCapability(token),
      },
      error: null,
    });

    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: token,
    });

    const session = await loadSessionCapability(
      cookies as unknown as Parameters<typeof loadSessionCapability>[0],
    );
    expect(session.attention).toBe(50);
  });

  it('clamps attention to 100 when DB value is too high', async () => {
    const token = 'cap-token-cap-token-cap-token';
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: 999,
        session_token_hash: hashSessionCapability(token),
      },
      error: null,
    });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: token,
    });

    const session = await loadSessionCapability(
      cookies as unknown as Parameters<typeof loadSessionCapability>[0],
    );
    expect(session.attention).toBe(100);
  });

  it('clamps attention to 0 when DB value is too low', async () => {
    const token = 'cap-token-cap-token-cap-token';
    setupSessionLookup({
      data: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        claim_id: '11111111-1111-4111-8111-111111111111',
        claim_text: 'Claim text',
        attention: -999,
        session_token_hash: hashSessionCapability(token),
      },
      error: null,
    });
    const cookies = makeCookies({
      [SESSION_ID_COOKIE]: '550e8400-e29b-41d4-a716-446655440000',
      [SESSION_TOKEN_COOKIE]: token,
    });

    const session = await loadSessionCapability(
      cookies as unknown as Parameters<typeof loadSessionCapability>[0],
    );
    expect(session.attention).toBe(0);
  });
});
