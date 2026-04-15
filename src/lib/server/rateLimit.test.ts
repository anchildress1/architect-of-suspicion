import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock $env/dynamic/private before importing the module
vi.mock('$env/dynamic/private', () => ({
  env: {
    API_RATE_LIMIT_MAX_REQUESTS: '5',
    API_RATE_LIMIT_WINDOW_MS: '1000',
  },
}));

import { checkRateLimit, rateLimitGuard, _resetStore } from './rateLimit';

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

describe('rateLimitGuard', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('returns null when within limits', () => {
    expect(rateLimitGuard('10.0.0.50')).toBeNull();
  });

  it('returns a 429 Response when limit exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      rateLimitGuard('10.0.0.60');
    }

    const response = rateLimitGuard('10.0.0.60');
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get('Retry-After')).toBeTruthy();

    const body = await response!.json();
    expect(body.message).toContain('Too many requests');
  });

  it('falls back to unknown for empty address', () => {
    expect(rateLimitGuard('')).toBeNull();
  });
});
