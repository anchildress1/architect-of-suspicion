import { error } from '@sveltejs/kit';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Reads the request body stream, aborting once bytesRead exceeds maxBytes.
// Guards against absent or spoofed Content-Length without buffering the full body first.
async function readBodyUpToLimit(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        error(413, `Request body too large (max ${maxBytes} bytes)`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return text;
}

export async function parseJsonBodyWithLimit<T>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      error(400, 'Invalid Content-Length header');
    }
    if (parsedLength > maxBytes) {
      error(413, `Request body too large (max ${maxBytes} bytes)`);
    }
  }

  const raw = await readBodyUpToLimit(request, maxBytes);

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error('[validation] JSON parse failed:', err instanceof Error ? err.message : err);
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
