import { describe, it, expect } from 'vitest';
import { handle } from './hooks.server';

async function resolve(status: number, contentType = 'text/plain') {
  return new Response('body', { status, headers: { 'Content-Type': contentType } });
}

describe('hooks.server handle', () => {
  it('adds baseline security headers on 200 responses', async () => {
    const response = await handle({
      event: {} as Parameters<typeof handle>[0]['event'],
      resolve: () => resolve(200),
    });

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Content-Type')).toBe('text/plain');
  });

  it('adds security headers on non-200 responses', async () => {
    for (const status of [400, 401, 404, 500]) {
      const response = await handle({
        event: {} as Parameters<typeof handle>[0]['event'],
        resolve: () => resolve(status),
      });
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    }
  });

  it('includes all required CSP directives', async () => {
    const response = await handle({
      event: {} as Parameters<typeof handle>[0]['event'],
      resolve: () => resolve(200),
    });

    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain('wss://*.supabase.co');
    expect(csp).toContain('api.anthropic.com');
  });

  it('does not overwrite the existing Content-Type from the resolved response', async () => {
    const response = await handle({
      event: {} as Parameters<typeof handle>[0]['event'],
      resolve: () => resolve(200, 'application/json'),
    });
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('sets worker-src so Vite HMR (dev) and bundled workers (prod) load without falling back to script-src', async () => {
    const response = await handle({
      event: {} as Parameters<typeof handle>[0]['event'],
      resolve: () => resolve(200),
    });
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/worker-src 'self'/);
    // In the test runtime (Vitest under Vite) `import.meta.env.DEV` is true,
    // so the dev-mode `blob:` allowance is in effect. Production builds
    // serve workers from same-origin URLs and drop `blob:`.
    expect(csp).toContain("worker-src 'self' blob:");
  });
});
