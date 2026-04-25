import { env } from '$env/dynamic/private';

interface RequestRecord {
  timestamps: number[];
}

const store = new Map<string, RequestRecord>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 60_000;
const MIN_MAX_REQUESTS = 1;
const MAX_MAX_REQUESTS = 5_000;
const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 60 * 60 * 1_000;

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function getConfig() {
  const maxRequests = parseBoundedInt(
    env.API_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_MAX_REQUESTS,
    MIN_MAX_REQUESTS,
    MAX_MAX_REQUESTS,
  );
  const windowMs = parseBoundedInt(
    env.API_RATE_LIMIT_WINDOW_MS,
    DEFAULT_WINDOW_MS,
    MIN_WINDOW_MS,
    MAX_WINDOW_MS,
  );
  return { maxRequests, windowMs };
}

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
    cleanupInterval = setInterval(cleanup, 60_000);
    // unref() prevents this interval from keeping the Cloud Run container alive
    // past its intended shutdown window, allowing graceful termination.
    if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
      cleanupInterval.unref();
    }
  }
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterMs: number };

export function checkRateLimit(ip: string): RateLimitResult {
  ensureCleanup();

  const { maxRequests, windowMs } = getConfig();
  const now = Date.now();

  let record = store.get(ip);
  if (!record) {
    record = { timestamps: [] };
    store.set(ip, record);
  }

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
 * @param clientAddress - Use `event.getClientAddress()` from SvelteKit
 *   to get the trusted client IP (set by the platform/proxy, not spoofable).
 */
export function rateLimitGuard(clientAddress: string): Response | null {
  if (!clientAddress) {
    console.error(
      '[rate-limit] getClientAddress() returned empty — falling back to shared bucket. Check platform adapter configuration.',
    );
  }
  const limit = checkRateLimit(clientAddress || 'unknown');
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ message: 'Too many requests. The Architect needs a moment.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)),
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
