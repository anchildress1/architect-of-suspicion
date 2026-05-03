import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  history?: Array<{ id: string; card_id: string; classification: string }>;
  historyError?: unknown;
  titleRows?: Array<{ objectID: string; title: string }>;
  titlesError?: unknown;
  updateError?: unknown;
}

const updateCalls: Array<Record<string, unknown>> = [];

const defaultPick = {
  id: validPickId,
  session_id: '22222222-2222-4222-8222-222222222222',
  card_id: validCardId,
  classification: 'proof',
  ai_reaction_text: null,
};

const defaultCard = {
  objectID: validCardId,
  title: 'Refactored to escape',
  blurb: 'Player blurb',
  fact: 'Hidden context.',
  category: 'Decisions',
  signal: 5,
};

function setupSupabase(opts: MockOptions = {}) {
  updateCalls.length = 0;

  // public.cards — full card lookup
  mockFrom.mockImplementation((table: string) => {
    if (table === 'cards') {
      // Heuristic: full-card path uses .eq().is().maybeSingle();
      // history-titles path uses .in()
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
          in: vi.fn().mockResolvedValue({
            data: opts.titleRows ?? [],
            error: opts.titlesError ?? null,
          }),
        }),
      };
    }
    return {};
  });

  let picksCallCount = 0;
  mockSchemaFrom.mockImplementation((table: string) => {
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
    if (picksCallCount === 2) {
      // loadHistory: select.eq.neq.order
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
    // persistReactionText: update().eq()
    return {
      update: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        updateCalls.push(row);
        return {
          eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
        };
      }),
    };
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

  it('streams Haiku 4.5 deltas and persists final text', async () => {
    setupSupabase();
    mockStream.mockReturnValue(makeFakeStream(['The ', 'mechanism ', 'turns.']));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toBe('The mechanism turns.');
    expect(res.headers.get('Content-Type')).toContain('text/plain');

    // Wait a microtask cycle for the fire-and-forget persist to land.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-haiku-4-5');
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ ai_reaction_text: 'The mechanism turns.' });
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
    expect(updateCalls).toHaveLength(0);
  });

  it('serves a fallback when Claude returns empty deltas', async () => {
    setupSupabase();
    mockStream.mockReturnValue(makeFakeStream([]));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    const body = await readAll(res);

    expect(body).toContain('mechanism seized');
    expect(updateCalls).toHaveLength(0);
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
      titleRows: [
        { objectID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Refactored to escape' },
      ],
    });
    mockStream.mockReturnValue(makeFakeStream(['ok']));

    const res = await POST(makeRequest({ pick_id: validPickId }));
    await readAll(res);

    const userPrompt = mockStream.mock.calls[0][0].messages[0].content as string;
    expect(userPrompt).toContain('Refactored to escape');
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
});
