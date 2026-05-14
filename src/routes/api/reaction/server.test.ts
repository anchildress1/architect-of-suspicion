import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockSchemaFrom = vi.fn();
const mockSchemaRpc = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
      rpc: (...args: unknown[]) => mockSchemaRpc(...args),
    }),
  }),
}));

const mockStream = vi.fn();

vi.mock('$lib/server/claude', () => ({
  getClaudeClient: () => ({
    messages: {
      stream: (...args: unknown[]) => mockStream(...args),
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

const validPickId = '99999999-9999-4999-8999-999999999999';
const validCardId = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return {
    cookies: {} as Parameters<typeof POST>[0]['cookies'],
    getClientAddress: () => '127.0.0.1',
    request: new Request('http://localhost/api/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

interface MockOptions {
  pickRow?: Record<string, unknown> | null;
  pickError?: unknown;
  card?: Record<string, unknown> | null;
  cardError?: unknown;
  claimCard?: Record<string, unknown> | null;
  claimCardError?: unknown;
  history?: Array<{ id: string; card_id: string; classification: string }>;
  historyError?: unknown;
  titleRows?: Array<{ card_id: string; rewritten_title: string }>;
  titlesError?: unknown;
  completionError?: unknown;
  /** Override the result of tryClaimReactionLock's atomic UPDATE.
   *  - true (default): the conditional UPDATE matches and we own the lock.
   *  - false: another request holds the lock (text still NULL on re-read).
   *  - 'cached': another request held the lock and JUST persisted text —
   *    the second loadPick after the failed claim returns the cached text. */
  lockClaim?: boolean | 'cached';
  lockError?: unknown;
}

const completionCalls: Array<Record<string, unknown>> = [];
const lockClaimCalls: Array<Record<string, unknown>> = [];

const defaultPick = {
  id: validPickId,
  session_id: '22222222-2222-4222-8222-222222222222',
  card_id: validCardId,
  classification: 'proof',
  ai_reaction_text: null,
};

const defaultCard = {
  objectID: validCardId,
  fact: 'Hidden context.',
  category: 'Decisions',
  signal: 5,
};

const defaultClaimCard = {
  rewritten_title: 'Refactored to escape',
  rewritten_blurb: 'Player blurb',
};

function setupSupabase(opts: MockOptions = {}) {
  completionCalls.length = 0;
  lockClaimCalls.length = 0;

  // tryClaimReactionLock RPC mock. The RPC returns a TABLE — Supabase JS
  // delivers that as an array. Empty = lock held by another request;
  // single-element = we own it.
  const lockClaimSucceedsValue = opts.lockClaim ?? true;
  mockSchemaRpc.mockImplementation((fnName: string, args: Record<string, unknown>) => {
    if (fnName === 'try_claim_reaction_lock') {
      lockClaimCalls.push(args);
      return Promise.resolve({
        data:
          lockClaimSucceedsValue === true
            ? [{ id: args.p_pick_id, locked_at: '2026-05-09T12:00:00.000Z' }]
            : [],
        error: opts.lockError ?? null,
      });
    }
    if (fnName === 'complete_reaction_generation') {
      completionCalls.push(args);
      return Promise.resolve({
        data: opts.completionError ? null : [{ id: args.p_pick_id }],
        error: opts.completionError ?? null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });

  // public.cards — full card lookup (no longer used for title/blurb;
  // those come from suspicion.claim_cards). Only the loadFullCard call
  // path goes through here now (eq.is.maybeSingle).
  mockFrom.mockImplementation((table: string) => {
    if (table === 'cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.card === undefined ? defaultCard : opts.card,
                error: opts.cardError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });

  // suspicion.picks call ordering. Both claim + completion now happen via
  // RPC, so the .schema('suspicion').from('picks') chain only covers reads:
  //
  //   Lock-succeeded path (default):
  //     1. loadPick — select.eq.eq.maybeSingle
  //     2. loadHistory — select.eq.neq.order
  //
  //   Lock-failed path (lockClaim: false | 'cached'):
  //     1. loadPick — select.eq.eq.maybeSingle
  //     2. second loadPick (refreshed pick after failed claim)
  //
  //   With lockClaim: 'cached', call #2 returns ai_reaction_text non-null,
  //   so the route streams that text and never reaches loadHistory.
  const lockClaimSucceeds = opts.lockClaim ?? true;
  const cachedAfterRace = lockClaimSucceeds === 'cached';
  let picksCallCount = 0;
  let claimCardsCallCount = 0;
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'claim_cards') {
      claimCardsCallCount++;
      // loadFullCard claim_cards lookup: select(rewritten_title,
      // rewritten_blurb).eq.eq.maybeSingle. Comes before loadHistory.
      if (claimCardsCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: opts.claimCard === undefined ? defaultClaimCard : opts.claimCard,
                  error: opts.claimCardError ?? null,
                }),
              }),
            }),
          }),
        };
      }
      // loadHistory titles lookup: select(card_id, rewritten_title).eq.in
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: opts.titleRows ?? [],
              error: opts.titlesError ?? null,
            }),
          }),
        }),
      };
    }
    if (table !== 'picks') return {};
    picksCallCount++;
    if (picksCallCount === 1) {
      // loadPick: select(...).eq(id).eq(session_id).maybeSingle()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.pickRow === undefined ? defaultPick : opts.pickRow,
                error: opts.pickError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    if (lockClaimSucceeds !== true && picksCallCount === 2) {
      // Lock-claim-failed path: route does a second loadPick to see if
      // the cached text landed mid-race.
      const refreshed = cachedAfterRace
        ? { ...defaultPick, ai_reaction_text: 'Cached by another request.' }
        : { ...defaultPick, ai_reaction_text: null };
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: refreshed, error: null }),
            }),
          }),
        }),
      };
    }
    // Lock-succeeded path:
    //   2 → loadHistory (select.eq.neq.order)
    if (picksCallCount === 2) {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockReturnValue({
              order: vi
                .fn()
                .mockResolvedValue({ data: opts.history ?? [], error: opts.historyError ?? null }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

function makeFakeStream(deltas: string[], finalize?: () => void) {
  const handlers: Record<string, ((delta: string) => void)[]> = {};
  return {
    on(event: string, fn: (delta: string) => void) {
      handlers[event] ??= [];
      handlers[event].push(fn);
      return this;
    },
    async finalMessage() {
      for (const delta of deltas) {
        handlers.text?.forEach((h) => h(delta));
      }
      finalize?.();
      return { content: [{ type: 'text', text: deltas.join('') }] };
    },
  };
}

async function readAll(res: Response): Promise<string> {
  return await res.text();
}

describe('POST /api/reaction', () => {
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

  it('rejects missing pick_id', async () => {
    await expect(POST(makeRequest({}))).rejects.toThrow('Missing or invalid pick_id');
  });

  it('rejects non-uuid pick_id', async () => {
    await expect(POST(makeRequest({ pick_id: 'not-a-uuid' }))).rejects.toThrow(
      'Missing or invalid pick_id',
    );
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('blocked', { status: 429 }));
    const res = await POST(makeRequest({ pick_id: validPickId }));
    expect(res.status).toBe(429);
    expect(mockLoadSessionCapability).not.toHaveBeenCalled();
  });

  it('404s when the pick does not belong to the session', async () => {
    setupSupabase({ pickRow: null });
    await expect(POST(makeRequest({ pick_id: validPickId }))).rejects.toThrow(
      'Pick not found for this session',
    );
  });

  it('returns the cached reaction text without calling Claude on retry', async () => {
    setupSupabase({ pickRow: { ...defaultPick, ai_reaction_text: 'Already filed.' } });

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toBe('Already filed.');
    expect(res.headers.get('X-Reaction-Cached')).toBe('1');
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('streams Sonnet 4.6 deltas and persists final text', async () => {
    setupSupabase();
    mockStream.mockReturnValue(makeFakeStream(['The ', 'mechanism ', 'turns.']));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toBe('The mechanism turns.');
    expect(res.headers.get('Content-Type')).toContain('text/plain');

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });

    expect(completionCalls).toHaveLength(1);
    expect(completionCalls[0]).toEqual({
      p_pick_id: validPickId,
      p_locked_at: '2026-05-09T12:00:00.000Z',
      p_text: 'The mechanism turns.',
    });
    // Generation also acquired the lock first via the
    // try_claim_reaction_lock RPC (the route uses RPC to bypass
    // PostgREST's column-name schema-cache validation on the lock column).
    expect(lockClaimCalls).toHaveLength(1);
    expect(lockClaimCalls[0]).toMatchObject({
      p_pick_id: validPickId,
      p_lock_timeout_seconds: expect.any(Number),
    });
  });

  it('returns 409 with a fallback when another request holds the in-flight lock', async () => {
    setupSupabase({ lockClaim: false });

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(res.status).toBe(409);
    expect(res.headers.get('X-Reaction-In-Flight')).toBe('1');
    expect(body).toContain('mechanism seized');
    // We must NOT have called Claude — that's the duplicate-spend race the
    // lock is preventing.
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('returns the just-cached text when another request finished mid-race', async () => {
    // The classic race: we read the pick (text NULL), another request claims
    // the lock and persists, we attempt to claim and fail, we re-read the
    // pick and find the text is now there.
    setupSupabase({ lockClaim: 'cached' });

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toBe('Cached by another request.');
    expect(res.headers.get('X-Reaction-Cached')).toBe('1');
    expect(res.status).toBe(200);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('serves a fallback when Claude throws before streaming any text', async () => {
    setupSupabase();
    mockStream.mockImplementation(() => {
      throw new Error('Claude down');
    });

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('mechanism seized');
    expect(completionCalls).toHaveLength(1);
    expect(completionCalls[0]).toEqual({
      p_pick_id: validPickId,
      p_locked_at: '2026-05-09T12:00:00.000Z',
      p_text: null,
    });
  });

  it('serves a fallback when Claude returns empty deltas', async () => {
    setupSupabase();
    mockStream.mockReturnValue(makeFakeStream([]));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toContain('mechanism seized');
    expect(completionCalls).toHaveLength(1);
    expect(completionCalls[0]).toEqual({
      p_pick_id: validPickId,
      p_locked_at: '2026-05-09T12:00:00.000Z',
      p_text: null,
    });
  });

  it('pulls the current card title and blurb from suspicion.claim_cards (rewritten, not public)', async () => {
    // VISIBLE SURFACE in the reaction prompt must match what the player
    // saw on the card. public.cards is first-person source; the player
    // sees the third-person rewrite from suspicion.claim_cards. Quoting
    // from public.cards would feed the model phrasing the player never
    // saw and break the card-authority contract.
    setupSupabase({
      claimCard: {
        rewritten_title: 'Ashley shipped a rough draft',
        rewritten_blurb: 'Pragmatic over polished, she pushed before the polish landed.',
      },
    });
    mockStream.mockReturnValue(makeFakeStream(['ok']));

    await POST(makeRequest({ pick_id: validPickId }));

    const userPrompt = mockStream.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('Ashley shipped a rough draft');
    expect(userPrompt).toContain('Pragmatic over polished, she pushed before the polish landed.');
  });

  it('threads pick history (with resolved titles) into the reaction prompt', async () => {
    setupSupabase({
      history: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          classification: 'proof',
        },
      ],
      // History titles come from suspicion.claim_cards.rewritten_title so
      // every cited prior exhibit reads in Ashley's third-person voice —
      // matches what the player saw when they ruled it.
      titleRows: [
        {
          card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          rewritten_title: 'Ashley archived the experiment',
        },
      ],
    });
    mockStream.mockReturnValue(makeFakeStream(['ok']));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    await readAll(res);

    const userPrompt = mockStream.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('Ashley archived the experiment');
    expect(userPrompt).toContain('proof');
  });

  it('substitutes "(unknown)" for history entries with no title row', async () => {
    setupSupabase({
      history: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          card_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          classification: 'proof',
        },
      ],
      titleRows: [],
    });
    mockStream.mockReturnValue(makeFakeStream(['ok']));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    await readAll(res);

    const userPrompt = mockStream.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('(unknown)');
  });

  it('releases the lock when pre-stream card loading fails', async () => {
    setupSupabase({ card: null });

    await expect(POST(makeRequest({ pick_id: validPickId }))).rejects.toThrow('Card not found');

    expect(completionCalls).toHaveLength(1);
    expect(completionCalls[0]).toEqual({
      p_pick_id: validPickId,
      p_locked_at: '2026-05-09T12:00:00.000Z',
      p_text: null,
    });
    expect(mockStream).not.toHaveBeenCalled();
  });
});
