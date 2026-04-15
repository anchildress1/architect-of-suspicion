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
  session_id: 'test-session-uuid',
  claim: 'Ashley depends on AI too much',
  verdict: 'accuse',
};

const mockPicks = [
  { card_id: 'card-1', classification: 'proof' },
  { card_id: 'card-2', classification: 'objection' },
];

const mockCards = [
  {
    objectID: 'card-1',
    title: 'AI Tools Usage',
    blurb: 'Evidence about AI usage',
    fact: 'Ashley uses AI tools extensively.',
    category: 'Philosophy',
    signal: 5,
  },
  {
    objectID: 'card-2',
    title: 'Manual Testing',
    blurb: 'Evidence about manual processes',
    fact: 'Ashley tests everything by hand too.',
    category: 'Engineering',
    signal: 3,
  },
];

function setupMocks(options?: {
  picks?: unknown[];
  picksError?: unknown;
  cards?: unknown[];
  cardsError?: unknown;
  sessionUpdateError?: unknown;
}) {
  const picks = options?.picks ?? mockPicks;
  const cards = options?.cards ?? mockCards;

  // public schema: cards
  mockFrom.mockImplementation((table: string) => {
    if (table === 'cards') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: cards,
              error: options?.cardsError ?? null,
            }),
          }),
        }),
      };
    }
    return {};
  });

  // suspicion schema: picks + sessions
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'picks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: picks,
              error: options?.picksError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === 'sessions') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: options?.sessionUpdateError ?? null,
          }),
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

  it('returns 400 when session_id is missing', async () => {
    await expect(POST(makeRequest({ ...validBody, session_id: undefined }))).rejects.toThrow(
      'Missing or invalid session_id',
    );
  });

  it('returns 400 when claim is missing', async () => {
    await expect(POST(makeRequest({ ...validBody, claim: undefined }))).rejects.toThrow(
      'Missing or invalid claim',
    );
  });

  it('returns 400 when verdict is invalid', async () => {
    await expect(POST(makeRequest({ ...validBody, verdict: 'maybe' }))).rejects.toThrow(
      'verdict must be "accuse" or "pardon"',
    );
  });

  it('returns 400 for invalid JSON body', async () => {
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

  it('fetches all picks for session from Supabase', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'A dramatic letter...' }],
    });

    await POST(makeRequest(validBody));

    expect(mockSchemaFrom).toHaveBeenCalledWith('picks');
  });

  it('fetches full card data for each pick', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'A dramatic letter...' }],
    });

    await POST(makeRequest(validBody));

    expect(mockFrom).toHaveBeenCalledWith('cards');
  });

  it('updates session with verdict', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'A dramatic letter...' }],
    });

    await POST(makeRequest(validBody));

    expect(mockSchemaFrom).toHaveBeenCalledWith('sessions');
  });

  it('returns cover letter and closing from Claude', async () => {
    setupMocks();
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The gears have spoken. This letter is dramatic.' }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The trial ends in iron silence.' }],
      });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.cover_letter).toBe('The gears have spoken. This letter is dramatic.');
    expect(body.architect_closing).toBe('The trial ends in iron silence.');
  });

  it('calls Claude with cover letter model and max_tokens', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Letter text' }],
    });

    await POST(makeRequest(validBody));

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const letterCall = mockCreate.mock.calls[0][0];
    expect(letterCall.model).toBe('claude-sonnet-4-5-20250514');
    expect(letterCall.max_tokens).toBe(2000);

    const closingCall = mockCreate.mock.calls[1][0];
    expect(closingCall.max_tokens).toBe(200);
  });

  it('handles Claude failure gracefully with fallback', async () => {
    setupMocks();
    mockCreate.mockRejectedValue(new Error('Claude API error'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
    expect(body.cover_letter.length).toBeGreaterThan(0);
    expect(typeof body.architect_closing).toBe('string');
    expect(body.architect_closing.length).toBeGreaterThan(0);
  });

  it('handles empty evidence gracefully', async () => {
    setupMocks({ picks: [], cards: [] });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'A letter about nothing.' }],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
    expect(typeof body.architect_closing).toBe('string');
  });

  it('returns 500 when picks fetch fails', async () => {
    setupMocks({ picksError: { message: 'db error' } });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to fetch picks');
  });

  it('returns 500 when session update fails', async () => {
    setupMocks({ sessionUpdateError: { message: 'update failed' } });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Letter' }],
    });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Failed to update session');
  });

  it('accepts pardon as a valid verdict', async () => {
    setupMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Pardoned!' }],
    });

    const res = await POST(makeRequest({ ...validBody, verdict: 'pardon' }));
    const body = await res.json();

    expect(typeof body.cover_letter).toBe('string');
  });
});
