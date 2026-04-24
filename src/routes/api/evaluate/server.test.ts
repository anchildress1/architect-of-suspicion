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

// --- Claim resolver mock ---
const mockGetClaimById = vi.fn();

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
    getClientAddress: () => '127.0.0.1',
    request: new Request('http://localhost/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

const validBody = {
  session_id: 'sess-1',
  claim_id: 'claim-1',
  card_id: 'card-1',
  classification: 'proof',
};

const mockCard = {
  objectID: 'card-1',
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
  insertError?: unknown;
}

const insertCalls: unknown[] = [];

function setupSupabase(opts: MockOptions = {}) {
  insertCalls.length = 0;
  const pairScore = opts.pairScore;
  const pair = pairScore === null ? null : { ai_score: pairScore ?? 0.5 };

  // public schema: cards table — used twice, once for the full card, once for history titles.
  let cardsCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'cards') return {};
    cardsCallCount++;
    if (cardsCallCount === 1) {
      // Full card .eq().is().single()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: opts.card === undefined ? mockCard : opts.card, error: opts.cardError ?? null }),
            }),
          }),
        }),
      };
    }
    // Title lookup .in()
    return {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ objectID: 'card-1', title: 'Refactored to escape' }],
          error: null,
        }),
      }),
    };
  });

  // suspicion schema: claim_cards (read), picks (history + insert).
  let picksCallCount = 0;
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'claim_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: pair, error: opts.pairError ?? null }),
            }),
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
              order: vi.fn().mockResolvedValue({ data: opts.picks ?? [], error: null }),
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
    return {};
  });
}

describe('POST /api/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClaimById.mockResolvedValue({
      claim: { id: 'claim-1', text: 'Ashley depends on AI too much' },
      error: null,
    });
  });

  it('rejects missing session_id', async () => {
    await expect(POST(makeRequest({ ...validBody, session_id: undefined }))).rejects.toThrow(
      'Missing or invalid session_id',
    );
  });

  it('rejects missing claim_id', async () => {
    await expect(POST(makeRequest({ ...validBody, claim_id: undefined }))).rejects.toThrow(
      'Missing or invalid claim_id',
    );
  });

  it('rejects missing card_id', async () => {
    await expect(POST(makeRequest({ ...validBody, card_id: undefined }))).rejects.toThrow(
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
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];
    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });

  it('404s when the claim does not resolve', async () => {
    mockGetClaimById.mockResolvedValue({ claim: null, error: 'Claim not found' });
    setupSupabase();
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Claim not found');
  });

  it('404s when the (claim, card) pair has no row', async () => {
    setupSupabase({ pairScore: null });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Card not in this claim deck');
  });

  it('500s when claim_cards read fails', async () => {
    setupSupabase({ pairScore: null, pairError: { message: 'pg-down' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to read claim_cards');
  });

  it('404s when the card row is missing', async () => {
    setupSupabase({ pairScore: 0.5, card: null, cardError: { message: 'gone' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Card not found');
  });

  it('persists the pre-seeded ai_score on a Proof pick (positive direction)', async () => {
    setupSupabase({ pairScore: 0.72 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'A pointed observation.' }] });

    const res = await POST(makeRequest({ ...validBody, classification: 'proof' }));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({
      session_id: 'sess-1',
      card_id: 'card-1',
      classification: 'proof',
      ai_score: 0.72,
      ai_reaction_text: 'A pointed observation.',
    });
    // Proof × +0.72 → +0.72 attention delta
    expect(body.attention_delta).toBeCloseTo(0.72, 5);
    expect(body.ai_reaction).toBe('A pointed observation.');
  });

  it('inverts attention_delta sign on Objection', async () => {
    setupSupabase({ pairScore: 0.4 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Hm.' }] });

    const res = await POST(makeRequest({ ...validBody, classification: 'objection' }));
    const body = await res.json();

    expect(body.attention_delta).toBeCloseTo(-0.4, 5);
  });

  it('writes ai_score=0 and attention_delta=0 on Dismiss', async () => {
    setupSupabase({ pairScore: 0.9 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Struck.' }] });

    const res = await POST(makeRequest({ ...validBody, classification: 'dismiss' }));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({
      classification: 'dismiss',
      ai_score: 0,
    });
    expect(body.attention_delta).toBe(0);
  });

  it('clamps the persisted score within [-1, 1]', async () => {
    setupSupabase({ pairScore: 5 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '...' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(insertCalls[0]).toMatchObject({ ai_score: 1 });
    expect(body.attention_delta).toBeCloseTo(1, 5);
  });

  it('falls back to a canned reaction when Claude fails — pick is still recorded', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockRejectedValue(new Error('Claude down'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.ai_reaction).toBe('string');
    expect(body.ai_reaction.length).toBeGreaterThan(0);
    expect(insertCalls).toHaveLength(1);
  });

  it('500s when the pick insert fails', async () => {
    setupSupabase({ pairScore: 0.3, insertError: { message: 'rls-block' } });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to record pick');
  });

  it('threads pick history (with resolved titles) into the reaction prompt', async () => {
    setupSupabase({
      pairScore: 0.3,
      picks: [
        { card_id: 'card-prev-1', classification: 'proof' },
        { card_id: 'card-prev-2', classification: 'objection' },
      ],
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'noted' }] });

    await POST(makeRequest(validBody));

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('Refactored to escape');
    expect(userPrompt).toContain('proof');
    expect(userPrompt).toContain('objection');
  });

  it('does not call Claude with a JSON-shaped prompt (reaction-only contract)', async () => {
    setupSupabase({ pairScore: 0.3 });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'reaction' }] });

    await POST(makeRequest(validBody));

    const userPrompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('ONLY the reaction text');
    expect(userPrompt).not.toMatch(/"score":/);
  });
});
