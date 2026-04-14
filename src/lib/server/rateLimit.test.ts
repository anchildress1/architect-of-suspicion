import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock $env/dynamic/private before importing the module
vi.mock('$env/dynamic/private', () => ({
  env: {
    API_RATE_LIMIT_MAX_REQUESTS: '5',
    API_RATE_LIMIT_WINDOW_MS: '1000',
  },
}));

import { checkRateLimit, getClientIp, rateLimitGuard, _resetStore } from './rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('allows requests within the limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('127.0.0.1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('blocks requests when limit is exceeded', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('127.0.0.1');
    }
    const result = checkRateLimit('127.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs!).toBeGreaterThanOrEqual(0);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('10.0.0.1');
    }
    const blocked = checkRateLimit('10.0.0.1');
    expect(blocked.allowed).toBe(false);

    const otherIp = checkRateLimit('10.0.0.2');
    expect(otherIp.allowed).toBe(true);
    expect(otherIp.remaining).toBe(4);
  });

  it('resets after the window expires', async () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('192.168.1.1');
    }
    expect(checkRateLimit('192.168.1.1').allowed).toBe(false);

    // Advance time past the 1000ms window
    vi.useFakeTimers();
    vi.advanceTimersByTime(1100);

    const result = checkRateLimit('192.168.1.1');
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
    });
    expect(getClientIp(req)).toBe('203.0.113.50');
  });

  it('extracts IP from x-real-ip header', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '203.0.113.99' },
    });
    expect(getClientIp(req)).toBe('203.0.113.99');
  });

  it('falls back to unknown when no headers present', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('rateLimitGuard', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('returns null when within limits', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.50' },
    });
    expect(rateLimitGuard(req)).toBeNull();
  });

  it('returns a 429 Response when limit exceeded', async () => {
    const makeReq = () =>
      new Request('http://localhost', {
        headers: { 'x-forwarded-for': '10.0.0.60' },
      });

    for (let i = 0; i < 5; i++) {
      rateLimitGuard(makeReq());
    }

    const response = rateLimitGuard(makeReq());
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get('Retry-After')).toBeTruthy();

    const body = await response!.json();
    expect(body.message).toContain('Too many requests');
  });
});
