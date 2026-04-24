import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPickRandomClaim = vi.fn();

vi.mock('$lib/server/claims', () => ({
  pickRandomClaim: (...args: unknown[]) => mockPickRandomClaim(...args),
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

import { GET } from './+server';

describe('GET /api/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the picked claim', async () => {
    mockPickRandomClaim.mockResolvedValue({
      claim: { id: 'c-1', text: 'Ashley resists standard practices' },
      error: null,
    });

    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();

    expect(body).toEqual({ id: 'c-1', text: 'Ashley resists standard practices' });
  });

  it('throws 503 when no claims are available', async () => {
    mockPickRandomClaim.mockResolvedValue({ claim: null, error: 'No claims seeded' });

    await expect(GET({} as Parameters<typeof GET>[0])).rejects.toThrow('No claims seeded');
  });
});
