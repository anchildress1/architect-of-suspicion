import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mocks ---
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
    }),
  }),
}));

const mockLoadSessionCapability = vi.fn();
const mockRateLimitGuard = vi.fn();
vi.mock('$lib/server/sessionCapability', () => ({
  loadSessionCapability: (...args: unknown[]) => mockLoadSessionCapability(...args),
}));
vi.mock('$lib/server/rateLimit', () => ({
  rateLimitGuard: (...args: unknown[]) => mockRateLimitGuard(...args),
}));

vi.mock('@sveltejs/kit', () => ({
  json: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    }),
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
    request: new Request('http://localhost/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

const validBody = {
  card_id: '11111111-1111-4111-8111-111111111111',
  classification: 'proof',
};

interface MockOptions {
  pairScore?: number | null;
  pairError?: unknown;
  insertError?: unknown;
  insertedId?: string;
  attentionUpdateError?: unknown;
  canonicalPick?: { classification: string } | null;
  canonicalPickError?: unknown;
  canonicalAttention?: { attention: number | null } | null;
  canonicalAttentionError?: unknown;
}

const insertCalls: unknown[] = [];
const attentionUpdateCalls: unknown[] = [];
const claimCardEqCalls: unknown[] = [];

function setupSupabase(opts: MockOptions = {}) {
  insertCalls.length = 0;
  attentionUpdateCalls.length = 0;
  claimCardEqCalls.length = 0;

  const pairScore = opts.pairScore;
  const pair = pairScore === null ? null : { ai_score: pairScore ?? 0.5 };

  let picksCallCount = 0;
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'claim_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((column: string, value: unknown) => {
            claimCardEqCalls.push([column, value]);
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: pair, error: opts.pairError ?? null }),
              }),
            };
          }),
        }),
      };
    }
    if (table === 'picks') {
      picksCallCount++;
      if (picksCallCount === 1) {
        // insert(...).select('id').single()
        return {
          insert: vi.fn().mockImplementation((row: unknown) => {
            insertCalls.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: opts.insertError
                    ? null
                    : { id: opts.insertedId ?? '99999999-9999-4999-8999-999999999999' },
                  error: opts.insertError ?? null,
                }),
              }),
            };
          }),
        };
      }
      // Subsequent call: loadCanonicalPick — select('classification').eq().eq().maybeSingle()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  opts.canonicalPick === undefined
                    ? { classification: 'proof' }
                    : opts.canonicalPick,
                error: opts.canonicalPickError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'sessions') {
      return {
        update: vi.fn().mockImplementation((row: unknown) => {
          attentionUpdateCalls.push(row);
          return {
            eq: vi.fn().mockResolvedValue({ error: opts.attentionUpdateError ?? null }),
          };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                opts.canonicalAttention === undefined ? { attention: 60 } : opts.canonicalAttention,
              error: opts.canonicalAttentionError ?? null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe('POST /api/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitGuard.mockReturnValue(null);
    mockLoadSessionCapability.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      claimId: '33333333-3333-4333-8333-333333333333',
      claimText: 'Ashley depends on AI too much',
      attention: 50,
    });
  });

  it('rejects missing card_id', async () => {
    await expect(POST(makeRequest({ ...validBody, card_id: undefined }))).rejects.toThrow(
      'Missing or invalid card_id',
    );
  });

  it('rejects non-uuid card_id', async () => {
    await expect(POST(makeRequest({ ...validBody, card_id: 'card-1' }))).rejects.toThrow(
      'Missing or invalid card_id',
    );
  });

  it('rejects unknown classification', async () => {
    await expect(POST(makeRequest({ ...validBody, classification: 'maybe' }))).rejects.toThrow(
      'classification must be "proof", "objection", or "dismiss"',
    );
  });

  it('rejects invalid JSON', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];
    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });

  it('rejects oversized request bodies', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '5000' },
        body: JSON.stringify(validBody),
      }),
    } as Parameters<typeof POST>[0];
    await expect(POST(req)).rejects.toThrow('Request body too large (max 1024 bytes)');
  });

  it('requires a valid session capability before mutating state', async () => {
    mockLoadSessionCapability.mockRejectedValue(new Error('Missing session capability'));
    setupSupabase();
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Missing session capability');
  });

  it('binds seed score lookup to session.claimId, not client input', async () => {
    setupSupabase({ pairScore: 0.3 });
    await POST(makeRequest(validBody));
    expect(claimCardEqCalls[0]).toEqual(['claim_id', '33333333-3333-4333-8333-333333333333']);
  });

  it('404s when the (session-claim, card) pair has no row', async () => {
    setupSupabase({ pairScore: null });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Card not in this claim deck');
  });

  it('500s when claim_cards read fails', async () => {
    setupSupabase({ pairScore: null, pairError: { message: 'pg-down' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to read claim_cards');
  });

  it('persists the pre-seeded ai_score on a Proof pick and returns smoothed attention + pick_id', async () => {
    setupSupabase({ pairScore: 0.72, insertedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

    const res = await POST(makeRequest({ ...validBody, classification: 'proof' }));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({
      session_id: '22222222-2222-4222-8222-222222222222',
      card_id: '11111111-1111-4111-8111-111111111111',
      classification: 'proof',
      ai_score: 0.72,
    });
    // Reaction text is filled async by /api/reaction — not on the evaluate path.
    expect(insertCalls[0]).not.toHaveProperty('ai_reaction_text');
    expect(body.pick_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(body.attention).toBeGreaterThan(50);
    expect(body.attention).toBeLessThanOrEqual(100);
    expect(Number.isInteger(body.attention)).toBe(true);
    // Decoupled response — no reaction text in this body.
    expect(body).not.toHaveProperty('ai_reaction');
    expect(body).not.toHaveProperty('reaction_fallback');
    // INVARIANT #1: the card's fact field must never reach the client.
    expect(body).not.toHaveProperty('fact');
  });

  it('drives attention down on Objection of a supporting card', async () => {
    setupSupabase({ pairScore: 0.4 });
    const res = await POST(makeRequest({ ...validBody, classification: 'objection' }));
    const body = await res.json();
    expect(body.attention).toBeLessThan(50);
  });

  it('leaves attention unchanged on Dismiss and writes ai_score=0', async () => {
    setupSupabase({ pairScore: 0.9 });
    const res = await POST(makeRequest({ ...validBody, classification: 'dismiss' }));
    const body = await res.json();
    expect(insertCalls[0]).toMatchObject({
      classification: 'dismiss',
      ai_score: 0,
    });
    expect(body.attention).toBe(50);
  });

  it('clamps the persisted score within [-1, 1]', async () => {
    setupSupabase({ pairScore: 5 });
    const res = await POST(makeRequest(validBody));
    const body = await res.json();
    expect(insertCalls[0]).toMatchObject({ ai_score: 1 });
    expect(body.attention).toBeGreaterThan(50);
  });

  it('500s when the pick insert fails with a non-unique error', async () => {
    setupSupabase({ pairScore: 0.3, insertError: { message: 'rls-block' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to record pick');
  });

  it('returns 409 with canonical classification + attention when the card was already ruled', async () => {
    setupSupabase({
      pairScore: 0.3,
      insertError: { message: 'duplicate', code: '23505' },
      canonicalPick: { classification: 'objection' },
      canonicalAttention: { attention: 42 },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      canonical: { classification: 'objection', attention: 42 },
    });
  });

  it.each([
    { label: 'null', dbValue: null, expected: 50 },
    { label: 'too low', dbValue: -999, expected: 0 },
    { label: 'too high', dbValue: 999, expected: 100 },
  ])(
    'normalizes $label canonical attention before returning a conflict',
    async ({ dbValue, expected }) => {
      setupSupabase({
        pairScore: 0.3,
        insertError: { message: 'duplicate', code: '23505' },
        canonicalPick: { classification: 'proof' },
        canonicalAttention: { attention: dbValue },
      });

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body).toEqual({
        canonical: { classification: 'proof', attention: expected },
      });
    },
  );

  it('500s on conflict if the canonical pick cannot be re-read', async () => {
    setupSupabase({
      pairScore: 0.3,
      insertError: { message: 'duplicate', code: '23505' },
      canonicalPick: null,
    });
    await expect(POST(makeRequest(validBody))).rejects.toThrow(
      'Failed to recover canonical pick after conflict',
    );
  });

  it('500s on conflict if the canonical attention cannot be re-read', async () => {
    setupSupabase({
      pairScore: 0.3,
      insertError: { message: 'duplicate', code: '23505' },
      canonicalAttention: null,
    });
    await expect(POST(makeRequest(validBody))).rejects.toThrow(
      'Failed to recover canonical attention after conflict',
    );
  });

  it('500s when the session attention update fails', async () => {
    setupSupabase({ pairScore: 0.3, attentionUpdateError: { message: 'rls-block' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to persist attention');
  });

  it('persists the new attention value to the session', async () => {
    setupSupabase({ pairScore: 0.5 });
    const res = await POST(makeRequest({ ...validBody, classification: 'proof' }));
    const body = await res.json();
    expect(attentionUpdateCalls).toHaveLength(1);
    expect((attentionUpdateCalls[0] as { attention: number }).attention).toBe(body.attention);
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('blocked', { status: 429 }));
    setupSupabase({ pairScore: 0.3 });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockLoadSessionCapability).not.toHaveBeenCalled();
  });
});
