import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mocks ---
const mockFrom = vi.fn();
const mockSchemaFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();

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
    request: new Request('http://localhost/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

function setupCardMock(card: Record<string, unknown> | null, error: unknown = null) {
  mockSingle.mockResolvedValue({ data: card, error });
  mockIs.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ is: mockIs });
  mockSelect.mockReturnValue({ eq: mockEq });
}

function setupPicksQueryMock(picks: unknown[] = []) {
  mockOrder.mockResolvedValue({ data: picks, error: null });
}

function setupInsertMock(error: unknown = null) {
  mockInsert.mockResolvedValue({ error });
}

function setupFromMock(card: Record<string, unknown> | null, picks: unknown[] = [], insertError: unknown = null) {
  setupCardMock(card);
  setupPicksQueryMock(picks);
  setupInsertMock(insertError);

  // public schema: only cards
  mockFrom.mockImplementation((table: string) => {
    if (table === 'cards') {
      return { select: mockSelect };
    }
    return {};
  });

  // suspicion schema: picks (history query + insert)
  let schemaCallCount = 0;
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'picks') {
      schemaCallCount++;
      // First picks call is the history query, second is insert
      if (schemaCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: mockOrder,
            }),
          }),
        };
      }
      return { insert: mockInsert };
    }
    return {};
  });
}

const validBody = {
  session_id: 'test-session-uuid',
  claim: 'Ashley depends on AI too much',
  card_id: 'card-123',
  classification: 'proof',
};

const mockCard = {
  objectID: 'card-123',
  title: 'AI Tools Usage',
  blurb: 'Evidence about AI tool usage',
  fact: 'Ashley uses AI tools for code generation, documentation, and project planning.',
  category: 'Philosophy',
  signal: 5,
};

describe('POST /api/evaluate', () => {
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

  it('returns 400 when card_id is missing', async () => {
    await expect(POST(makeRequest({ ...validBody, card_id: undefined }))).rejects.toThrow(
      'Missing or invalid card_id',
    );
  });

  it('returns 400 when classification is invalid', async () => {
    await expect(POST(makeRequest({ ...validBody, classification: 'maybe' }))).rejects.toThrow(
      'classification must be "proof" or "objection"',
    );
  });

  it('returns 400 for invalid JSON body', async () => {
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

  it('fetches full card including fact from Supabase', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "score": 0.5, "reaction": "A fine deduction!" }' }],
    });

    await POST(makeRequest(validBody));

    expect(mockFrom).toHaveBeenCalledWith('cards');
    expect(mockSelect).toHaveBeenCalledWith('objectID, title, blurb, fact, category, signal');
  });

  it('returns 404 when card is not found', async () => {
    setupFromMock(null);
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    await expect(POST(makeRequest(validBody))).rejects.toThrow('Card not found');
  });

  it('calls Claude SDK with evaluation prompt', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "score": 0.7, "reaction": "Brilliant!" }' }],
    });

    await POST(makeRequest(validBody));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
    expect(callArgs.messages[0].content).toContain('Ashley depends on AI too much');
    expect(callArgs.messages[0].content).toContain('AI Tools Usage');
    expect(callArgs.messages[0].content).toContain('proof');
  });

  it('writes pick to suspicion.picks before returning', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "score": 0.6, "reaction": "The gears align!" }' }],
    });

    await POST(makeRequest(validBody));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'test-session-uuid',
        card_id: 'card-123',
        classification: 'proof',
        ai_score: 0.6,
        ai_reaction_text: 'The gears align!',
      }),
    );
  });

  it('returns score in [-1.0, 1.0] range', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "score": 0.75, "reaction": "Indeed!" }' }],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.ai_score).toBeGreaterThanOrEqual(-1.0);
    expect(body.ai_score).toBeLessThanOrEqual(1.0);
    expect(typeof body.ai_reaction).toBe('string');
  });

  it('clamps score to [-1.0, 1.0] range', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "score": 5.0, "reaction": "Too much!" }' }],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.ai_score).toBe(1.0);
  });

  it('handles Claude failure gracefully with fallback', async () => {
    setupFromMock(mockCard);

    mockCreate.mockRejectedValue(new Error('Claude API error'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.ai_score).toBe(0.0);
    expect(typeof body.ai_reaction).toBe('string');
    expect(body.ai_reaction.length).toBeGreaterThan(0);

    // Still writes pick even on Claude failure
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'test-session-uuid',
        card_id: 'card-123',
        ai_score: 0.0,
      }),
    );
  });

  it('handles invalid JSON from Claude gracefully', async () => {
    setupFromMock(mockCard);

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not valid JSON' }],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.ai_score).toBe(0.0);
    expect(typeof body.ai_reaction).toBe('string');
  });
});
