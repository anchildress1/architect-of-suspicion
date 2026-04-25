import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Claude SDK mock ---
const mockCreate = vi.fn();
const mockRateLimitGuard = vi.fn();

vi.mock('$lib/server/claude', () => ({
  getClaudeClient: () => ({
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  }),
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
    getClientAddress: () => '127.0.0.1',
    request: new Request('http://localhost/api/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

const validBody = {
  claim: 'Ashley depends on AI too much',
  action: 'enter_room',
  room: 'gallery',
  evidence_count: { proof: 3, objection: 1 },
  rooms_visited: ['parlor', 'gallery'],
};

describe('POST /api/narrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitGuard.mockReturnValue(null);
  });

  it('returns dialogue string for enter_room action', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'The gallery reveals its secrets, one cog at a time.' }],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.dialogue).toBe('The gallery reveals its secrets, one cog at a time.');
  });

  it('handles wander action', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'You pace the corridors like a lost piston.' }],
    });

    const res = await POST(makeRequest({ ...validBody, action: 'wander', room: 'mansion' }));
    const body = await res.json();

    expect(body.dialogue).toBe('You pace the corridors like a lost piston.');
  });

  it('handles idle action', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hesitation is the rust of progress.' }],
    });

    const res = await POST(makeRequest({ ...validBody, action: 'idle' }));
    const body = await res.json();

    expect(body.dialogue).toBe('Hesitation is the rust of progress.');
  });

  it('returns 400 for invalid action', async () => {
    await expect(POST(makeRequest({ ...validBody, action: 'dance' }))).rejects.toThrow(
      'action must be "enter_room", "idle", or "wander"',
    );
  });

  it('returns 400 for missing claim', async () => {
    await expect(POST(makeRequest({ ...validBody, claim: undefined }))).rejects.toThrow(
      'Missing or invalid claim',
    );
  });

  it('returns 400 for overlong claim', async () => {
    await expect(POST(makeRequest({ ...validBody, claim: 'a'.repeat(301) }))).rejects.toThrow(
      'Missing or invalid claim',
    );
  });

  it('returns 400 for missing room', async () => {
    await expect(POST(makeRequest({ ...validBody, room: undefined }))).rejects.toThrow(
      'Missing or invalid room',
    );
  });

  it('returns 400 for unknown room slug', async () => {
    await expect(POST(makeRequest({ ...validBody, room: 'dungeon' }))).rejects.toThrow(
      'Missing or invalid room',
    );
  });

  it('returns 400 when rooms_visited includes an unknown slug', async () => {
    await expect(
      POST(makeRequest({ ...validBody, rooms_visited: ['gallery', 'dungeon'] })),
    ).rejects.toThrow('Missing or invalid rooms_visited');
  });

  it('returns 400 when rooms_visited exceeds limit', async () => {
    await expect(
      POST(makeRequest({ ...validBody, rooms_visited: Array(13).fill('gallery') })),
    ).rejects.toThrow('Missing or invalid rooms_visited');
  });

  it('returns 400 when rooms_visited is not an array', async () => {
    await expect(
      POST(makeRequest({ ...validBody, rooms_visited: 'gallery' as unknown as string[] })),
    ).rejects.toThrow('Missing or invalid rooms_visited');
  });

  it('returns 400 when rooms_visited entry exceeds slug length cap', async () => {
    await expect(
      POST(makeRequest({ ...validBody, rooms_visited: ['x'.repeat(41)] })),
    ).rejects.toThrow('Missing or invalid rooms_visited');
  });

  it('returns 400 when evidence counts are negative', async () => {
    await expect(
      POST(makeRequest({ ...validBody, evidence_count: { proof: -1, objection: 1 } })),
    ).rejects.toThrow('Missing or invalid evidence_count.proof');
  });

  it('returns 400 when evidence counts are not integers', async () => {
    await expect(
      POST(makeRequest({ ...validBody, evidence_count: { proof: 1.5, objection: 1 } })),
    ).rejects.toThrow('Missing or invalid evidence_count.proof');
  });

  it('returns 400 when objection count is invalid', async () => {
    await expect(
      POST(makeRequest({ ...validBody, evidence_count: { proof: 1, objection: -1 } })),
    ).rejects.toThrow('Missing or invalid evidence_count.objection');
  });

  it('returns 413 for oversized body', async () => {
    const req = {
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, claim: 'x'.repeat(5000) }),
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Request body too large (max 4096 bytes)');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = {
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Invalid JSON body');
  });

  it('returns 400 for invalid Content-Length header', async () => {
    const req = {
      getClientAddress: () => '127.0.0.1',
      request: new Request('http://localhost/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 'invalid' },
        body: JSON.stringify(validBody),
      }),
    } as Parameters<typeof POST>[0];

    await expect(POST(req)).rejects.toThrow('Invalid Content-Length header');
  });

  it('returns fallback dialogue on Claude failure', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(typeof body.dialogue).toBe('string');
    expect(body.dialogue.length).toBeGreaterThan(0);
  });

  it('returns fallback dialogue when Claude returns only whitespace', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '   ' }] });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.dialogue).toContain('Go on, then.');
  });

  it('returns fallback dialogue when Claude throws a non-Error value', async () => {
    mockCreate.mockRejectedValue('network-down');

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.dialogue).toContain('Go on, then.');
  });

  it('defaults evidence_count and rooms_visited when missing', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'The mansion waits.' }],
    });

    const res = await POST(
      makeRequest({
        claim: 'Test claim',
        action: 'enter_room',
        room: 'parlor',
      }),
    );
    const body = await res.json();

    expect(body.dialogue).toBe('The mansion waits.');
  });

  it('returns rate-limit response when blocked', async () => {
    mockRateLimitGuard.mockReturnValue(new Response('blocked', { status: 429 }));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
