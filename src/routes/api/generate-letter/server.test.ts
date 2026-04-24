import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockSchemaFrom = vi.fn();
const mockCreate = vi.fn();

vi.mock('$lib/server/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
    }),
  }),
}));

vi.mock('$lib/server/claude', () => ({
  getClaudeClient: () => ({
    messages: { create: (...args: unknown[]) => mockCreate(...args) },
  }),
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
    request: new Request('http://localhost/api/generate-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

const validBody = {
  session_id: 'sess-1',
  claim: 'Ashley depends on AI too much',
  verdict: 'accuse',
};

const mockPicks = [
  { card_id: 'card-1', classification: 'proof' },
  { card_id: 'card-2', classification: 'objection' },
  { card_id: 'card-3', classification: 'dismiss' },
];

const mockCards = [
  {
    objectID: 'card-1',
    title: 'AI Tools Usage',
    blurb: 'AI usage',
    fact: 'Ashley uses AI tools.',
    category: 'Philosophy',
    signal: 5,
  },
  {
    objectID: 'card-2',
    title: 'Manual Testing',
    blurb: 'Manual processes',
    fact: 'Ashley tests by hand too.',
    category: 'Engineering',
    signal: 3,
  },
];

const sessionUpdates: Array<Record<string, unknown>> = [];
const lastCardsInCall: { ids: string[] } = { ids: [] };

interface MockOptions {
  picks?: unknown[];
  picksError?: unknown;
  cards?: unknown[];
  cardsError?: unknown;
  sessionUpdateError?: unknown;
}

function setupMocks(options: MockOptions = {}) {
  sessionUpdates.length = 0;
  lastCardsInCall.ids = [];
  const picks = options.picks ?? mockPicks;
  const cards = options.cards ?? mockCards;

  mockFrom.mockImplementation((table: string) => {
    if (table !== 'cards') return {};
    return {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
          lastCardsInCall.ids = ids;
          return {
            is: vi
              .fn()
              .mockResolvedValue({ data: cards, error: options.cardsError ?? null }),
          };
        }),
      }),
    };
  });

  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'picks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi
              .fn()
              .mockResolvedValue({ data: picks, error: options.picksError ?? null }),
          }),
        }),
      };
    }
    if (table === 'sessions') {
      return {
        update: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          sessionUpdates.push(row);
          return {
            eq: vi.fn().mockResolvedValue({ error: options.sessionUpdateError ?? null }),
          };
        }),
      };
    }
    return {};
  });
}

describe('POST /api/generate-letter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing session_id', async () => {
    await expect(POST(makeRequest({ ...validBody, session_id: undefined }))).rejects.toThrow(
      'Missing or invalid session_id',
    );
  });

  it('rejects missing claim', async () => {
    await expect(POST(makeRequest({ ...validBody, claim: undefined }))).rejects.toThrow(
      'Missing or invalid claim',
    );
  });

  it('rejects unknown verdict', async () => {
    await expect(POST(makeRequest({ ...validBody, verdict: 'maybe' }))).rejects.toThrow(
      'verdict must be "accuse" or "pardon"',
    );
  });

  it('rejects invalid JSON', async () => {
    const req = {
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];
    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });

  it('filters dismissed picks before fetching cards', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'A letter.' }] });

    await POST(makeRequest(validBody));

    expect(lastCardsInCall.ids).toEqual(['card-1', 'card-2']);
  });

  it('persists the verdict and the composed letter on the session', async () => {
    setupMocks();
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'The letter body.' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'The closing.' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.cover_letter).toBe('The letter body.');
    expect(body.architect_closing).toBe('The closing.');
    expect(sessionUpdates[0]).toMatchObject({ verdict: 'accuse' });
    expect(sessionUpdates[1]).toMatchObject({
      cover_letter: 'The letter body.',
      architect_closing: 'The closing.',
    });
  });

  it('falls back to canned text when Claude fails', async () => {
    setupMocks();
    mockCreate.mockRejectedValue(new Error('Claude down'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
    expect(body.cover_letter.length).toBeGreaterThan(0);
    expect(typeof body.architect_closing).toBe('string');
    expect(body.architect_closing.length).toBeGreaterThan(0);
  });

  it('handles a fully-dismissed session by sending empty evidence to the prompt', async () => {
    setupMocks({
      picks: [{ card_id: 'card-1', classification: 'dismiss' }],
      cards: [],
    });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Nothing to rule on.' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
    expect(lastCardsInCall.ids).toEqual([]);
  });

  it('500s when picks fetch fails', async () => {
    setupMocks({ picksError: { message: 'pg-down' } });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to fetch picks');
  });

  it('500s when session update fails', async () => {
    setupMocks({ sessionUpdateError: { message: 'rls' } });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to update session');
  });

  it('accepts pardon as a valid verdict', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'P.' }] });

    const res = await POST(makeRequest({ ...validBody, verdict: 'pardon' }));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
  });
});
