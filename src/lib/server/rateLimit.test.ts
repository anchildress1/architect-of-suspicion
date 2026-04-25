import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock $env/dynamic/private before importing the module
vi.mock('$env/dynamic/private', () => ({
  env: {
    API_RATE_LIMIT_MAX_REQUESTS: '5',
    API_RATE_LIMIT_WINDOW_MS: '1000',
  },
}));

import { checkRateLimit, rateLimitGuard, _resetStore } from './rateLimit';
import { env } from '$env/dynamic/private';

describe('rateLimit', () => {
  beforeEach(() => {
    _resetStore();
    env.API_RATE_LIMIT_MAX_REQUESTS = '5';
    env.API_RATE_LIMIT_WINDOW_MS = '1000';
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
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
    }
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

  it('runs periodic cleanup and prunes stale timestamps', () => {
    vi.useFakeTimers();
    env.API_RATE_LIMIT_MAX_REQUESTS = '2';
    env.API_RATE_LIMIT_WINDOW_MS = '1000';

    checkRateLimit('198.51.100.10');
    checkRateLimit('198.51.100.10');
    expect(checkRateLimit('198.51.100.10').allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit('198.51.100.10').allowed).toBe(true);

    vi.useRealTimers();
  });

  it('falls back to secure defaults when env config is invalid', () => {
    env.API_RATE_LIMIT_MAX_REQUESTS = 'not-a-number';
    env.API_RATE_LIMIT_WINDOW_MS = '-1';

    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('203.0.113.1').allowed).toBe(true);
    }
    expect(checkRateLimit('203.0.113.1').allowed).toBe(false);
  });

  it('falls back to secure defaults when env config is out of bounds', () => {
    env.API_RATE_LIMIT_MAX_REQUESTS = '0';
    env.API_RATE_LIMIT_WINDOW_MS = '999999999999';

    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('203.0.113.2').allowed).toBe(true);
    }
    expect(checkRateLimit('203.0.113.2').allowed).toBe(false);
  });
});

describe('rateLimitGuard', () => {
  beforeEach(() => {
    _resetStore();
    env.API_RATE_LIMIT_MAX_REQUESTS = '5';
    env.API_RATE_LIMIT_WINDOW_MS = '1000';
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

  it('falls back to unknown bucket and logs when address is empty', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = rateLimitGuard('');

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[rate-limit]'));
    errorSpy.mockRestore();
  });
});
