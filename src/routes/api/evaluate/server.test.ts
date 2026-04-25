import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mocks ---
const mockFrom = vi.fn();
const mockSchemaFrom = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
    }),
  }),
}));

// --- Claude SDK mock ---
const mockCreate = vi.fn();

vi.mock('$lib/server/claude', () => ({
  getClaudeClient: () => ({
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
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

const mockCard = {
  objectID: '11111111-1111-4111-8111-111111111111',
  title: 'Refactored to escape',
  blurb: 'Player blurb',
  fact: 'Hidden context: Ashley shipped the refactor in 22 days.',
  category: 'Decisions',
  signal: 5,
};

interface MockOptions {
  pairScore?: number | null;
  pairError?: unknown;
  card?: Record<string, unknown> | null;
  cardError?: unknown;
  picks?: Array<{ card_id: string; classification: string }>;
  picksError?: unknown;
  titleRows?: Array<{ objectID: string; title: string }>;
  titlesError?: unknown;
  insertError?: unknown;
  attentionUpdateError?: unknown;
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

  // public schema: cards table — used twice, once for the full card, once for history titles.
  let cardsCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'cards') return {};
    cardsCallCount++;
    if (cardsCallCount === 1) {
      // Full card .eq().is().maybeSingle()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.card === undefined ? mockCard : opts.card,
                error: opts.cardError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    // Title lookup .in()
    return {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: opts.titleRows ?? [
            { objectID: '11111111-1111-4111-8111-111111111111', title: 'Refactored to escape' },
          ],
          error: opts.titlesError ?? null,
        }),
      }),
    };
  });

  // suspicion schema: claim_cards (read), picks (history + insert), sessions (update)
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi
                .fn()
                .mockResolvedValue({ data: opts.picks ?? [], error: opts.picksError ?? null }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockImplementation((row: unknown) => {
          insertCalls.push(row);
          return Promise.resolve({ error: opts.insertError ?? null });
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

  it('rejects invalid Content-Length header', async () => {
    const req = {
      cookies: {} as Parameters<typeof POST>[0]['cookies'],
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 'oops' },
        body: JSON.stringify(validBody),
      }),
    } as Parameters<typeof POST>[0];
    await expect(POST(req)).rejects.toThrow('Invalid Content-Length header');
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
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

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

  it('404s when the card row is missing', async () => {
    setupSupabase({ pairScore: 0.5, card: null });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Card not found');
  });

  it('500s when the card fetch errors', async () => {
    setupSupabase({ pairScore: 0.5, card: null, cardError: { message: 'gone' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to read card');
  });

  it('500s when pick history read fails', async () => {
    setupSupabase({ pairScore: 0.3, picksError: { message: 'history-down' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to read pick history');
  });

  it('500s when history titles lookup fails', async () => {
    setupSupabase({
      pairScore: 0.3,
      picks: [{ card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', classification: 'proof' }],
      titlesError: { message: 'titles-down' },
    });
    await expect(POST(makeRequest(validBody))).rejects.toThrow(
      'Failed to read pick history titles',
    );
  });

  it('persists the pre-seeded ai_score on a Proof pick and returns smoothed attention', async () => {
    setupSupabase({ pairScore: 0.72 });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'A pointed observation.' }],
    });

    const res = await POST(makeRequest({ ...validBody, classification: 'proof' }));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({
      session_id: '22222222-2222-4222-8222-222222222222',
      card_id: '11111111-1111-4111-8111-111111111111',
      classification: 'proof',
      ai_score: 0.72,
      ai_reaction_text: 'A pointed observation.',
    });
    expect(body.attention).toBeGreaterThan(50);
    expect(body.attention).toBeLessThanOrEqual(100);
    expect(Number.isInteger(body.attention)).toBe(true);
    expect(body.ai_reaction).toBe('A pointed observation.');
    expect(body.reaction_fallback).toBe(false);
    expect(body).not.toHaveProperty('ai_score');
    expect(body).not.toHaveProperty('attention_delta');
    // INVARIANT #1: the card's fact field must never reach the client.
    expect(body).not.toHaveProperty('fact');
    expect(JSON.stringify(body)).not.toContain(mockCard.fact);
  });

  it('drives attention down on Objection of a supporting card', async () => {
    setupSupabase({ pairScore: 0.4 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hm.' }] });

    const res = await POST(makeRequest({ ...validBody, classification: 'objection' }));
    const body = await res.json();

    expect(body.attention).toBeLessThan(50);
  });

  it('leaves attention unchanged on Dismiss and writes ai_score=0', async () => {
    setupSupabase({ pairScore: 0.9 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Struck.' }] });

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
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '...' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({ ai_score: 1 });
    expect(body.attention).toBeGreaterThan(50);
  });

  it('falls back to canned reaction when Claude fails and flags reaction_fallback', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockRejectedValue(new Error('Claude down'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.ai_reaction).toBe('string');
    expect(body.ai_reaction.length).toBeGreaterThan(0);
    expect(body.reaction_fallback).toBe(true);
    expect(insertCalls).toHaveLength(1);
  });

  it('falls back to canned reaction when Claude throws a non-Error value', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockRejectedValue('network-down');

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.ai_reaction).toBe('string');
    expect(body.reaction_fallback).toBe(true);
  });

  it('flags reaction_fallback when Claude returns empty text', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.reaction_fallback).toBe(true);
  });

  it('500s when the pick insert fails with a non-unique error', async () => {
    setupSupabase({
      pairScore: 0.3,
      insertError: { message: 'rls-block' },
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to record pick');
  });

  it('409s when the card has already been ruled in the session', async () => {
    setupSupabase({
      pairScore: 0.3,
      insertError: { message: 'duplicate', code: '23505' },
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(POST(makeRequest(validBody))).rejects.toThrow(
      'Card already ruled in this session',
    );
  });

  it('500s when the session attention update fails', async () => {
    setupSupabase({
      pairScore: 0.3,
      attentionUpdateError: { message: 'rls-block' },
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to persist attention');
  });

  it('persists the new attention value to the session', async () => {
    setupSupabase({ pairScore: 0.5 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    const res = await POST(makeRequest({ ...validBody, classification: 'proof' }));
    const body = await res.json();

    expect(attentionUpdateCalls).toHaveLength(1);
    expect((attentionUpdateCalls[0] as { attention: number }).attention).toBe(body.attention);
  });

  it('threads pick history (with resolved titles) into the reaction prompt', async () => {
    setupSupabase({
      pairScore: 0.3,
      picks: [
        { card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', classification: 'proof' },
        { card_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', classification: 'objection' },
      ],
      titleRows: [
        { objectID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Refactored to escape' },
        { objectID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Another exhibit' },
      ],
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'noted' }] });

    await POST(makeRequest(validBody));

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('Refactored to escape');
    expect(userPrompt).toContain('proof');
    expect(userPrompt).toContain('objection');
  });

  it('substitutes "(unknown)" for history entries missing a title row', async () => {
    setupSupabase({
      pairScore: 0.3,
      picks: [{ card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', classification: 'proof' }],
      titleRows: [],
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'noted' }] });

    await POST(makeRequest(validBody));

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('(unknown)');
  });

  it('does not call Claude with a JSON-shaped prompt (reaction-only contract)', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'reaction' }] });

    await POST(makeRequest(validBody));

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('ONLY the reaction text');
    expect(userPrompt).not.toMatch(/"score":/);
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('blocked', { status: 429 }));
    setupSupabase({ pairScore: 0.3 });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockLoadSessionCapability).not.toHaveBeenCalled();
  });
});
