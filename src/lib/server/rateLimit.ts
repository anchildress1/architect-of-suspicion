import { env } from '$env/dynamic/private';

interface RequestRecord {
  timestamps: number[];
}

const store = new Map<string, RequestRecord>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function getConfig() {
  const maxRequests = parseInt(env.API_RATE_LIMIT_MAX_REQUESTS ?? '30', 10);
  const windowMs = parseInt(env.API_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
  return { maxRequests, windowMs };
}

/**
 * Clean up expired entries from the store.
 * Runs periodically to prevent memory leaks.
 */
function cleanup() {
  const { windowMs } = getConfig();
  const now = Date.now();
  for (const [key, record] of store) {
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
    if (record.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

function ensureCleanup() {
  if (!cleanupInterval) {
    // Clean up every 60 seconds
    cleanupInterval = setInterval(cleanup, 60_000);
    // Allow Node process to exit even if interval is active
    if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
      cleanupInterval.unref();
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check if a request from the given IP is within the rate limit.
 * Returns { allowed, remaining, retryAfterMs }.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  ensureCleanup();

  const { maxRequests, windowMs } = getConfig();
  const now = Date.now();

  let record = store.get(ip);
  if (!record) {
    record = { timestamps: [] };
    store.set(ip, record);
  }

  // Remove expired timestamps
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldestInWindow = record.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
  };
}

/**
 * Extract client IP from a SvelteKit request event.
 * Checks common proxy headers, falls back to 'unknown'.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Check rate limit for a request and return a 429 Response if exceeded.
 * Returns null when the request is within limits.
 */
export function rateLimitGuard(request: Request): Response | null {
  const ip = getClientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ message: 'Too many requests. The Architect needs a moment.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((limit.retryAfterMs ?? 60000) / 1000)),
        },
      },
    );
  }
  return null;
}

/** Reset the store — for testing only. */
export function _resetStore() {
  store.clear();
}
