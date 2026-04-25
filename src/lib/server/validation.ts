import { error } from '@sveltejs/kit';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function parseJsonBodyWithLimit<T>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      error(400, 'Invalid Content-Length header');
    }
    if (parsedLength > maxBytes) {
      error(413, `Request body too large (max ${maxBytes} bytes)`);
    }
  }

  const raw = await request.text();
  const bodySize = new TextEncoder().encode(raw).length;
  if (bodySize > maxBytes) {
    error(413, `Request body too large (max ${maxBytes} bytes)`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    error(400, 'Invalid JSON body');
  }
}

export function requireBoundedString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    error(400, `Missing or invalid ${fieldName}`);
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    error(400, `Missing or invalid ${fieldName}`);
  }

  return trimmed;
}

export function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
  maxValue: number,
): number {
  const numeric = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > maxValue) {
    error(400, `Missing or invalid ${fieldName}`);
  }
  return numeric;
}
