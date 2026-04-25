import { describe, it, expect } from 'vitest';
import { handle } from './hooks.server';

describe('hooks.server handle', () => {
  it('adds baseline security headers', async () => {
    const response = await handle({
      event: {} as Parameters<typeof handle>[0]['event'],
      resolve: async () =>
        new Response('ok', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
          },
        }),
    });

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Content-Type')).toBe('text/plain');
  });
});
