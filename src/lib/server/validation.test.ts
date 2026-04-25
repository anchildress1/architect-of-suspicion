import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  },
}));
import {
  isUuid,
  parseJsonBodyWithLimit,
  requireBoundedString,
  requireNonNegativeInteger,
} from './validation';

describe('validation helpers', () => {
  it('validates UUID strings', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });

  it('parses JSON body within size limit', async () => {
    const body = await parseJsonBodyWithLimit<{ ok: boolean }>(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }),
      1024,
    );

    expect(body).toEqual({ ok: true });
  });

  it('throws on invalid JSON', async () => {
    await expect(
      parseJsonBodyWithLimit(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        }),
        1024,
      ),
    ).rejects.toThrow('Invalid JSON body');
  });

  it('throws on invalid Content-Length header', async () => {
    await expect(
      parseJsonBodyWithLimit(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 'oops' },
          body: JSON.stringify({ ok: true }),
        }),
        1024,
      ),
    ).rejects.toThrow('Invalid Content-Length header');
  });

  it('throws on negative Content-Length header', async () => {
    await expect(
      parseJsonBodyWithLimit(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': '-1' },
          body: JSON.stringify({ ok: true }),
        }),
        1024,
      ),
    ).rejects.toThrow('Invalid Content-Length header');
  });

  it('throws when declared content-length exceeds limit', async () => {
    await expect(
      parseJsonBodyWithLimit(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': '5000' },
          body: JSON.stringify({ ok: true }),
        }),
        1024,
      ),
    ).rejects.toThrow('Request body too large (max 1024 bytes)');
  });

  it('throws when actual body size exceeds limit', async () => {
    await expect(
      parseJsonBodyWithLimit(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'x'.repeat(1200) }),
        }),
        1024,
      ),
    ).rejects.toThrow('Request body too large (max 1024 bytes)');
  });

  it('requires bounded non-empty strings', () => {
    expect(requireBoundedString('  hello ', 'claim', 10)).toBe('hello');
    expect(() => requireBoundedString(123, 'claim', 10)).toThrow('Missing or invalid claim');
    expect(() => requireBoundedString('  ', 'claim', 10)).toThrow('Missing or invalid claim');
    expect(() => requireBoundedString('x'.repeat(11), 'claim', 10)).toThrow(
      'Missing or invalid claim',
    );
  });

  it('requires non-negative integers in range', () => {
    expect(requireNonNegativeInteger(0, 'count', 5)).toBe(0);
    expect(requireNonNegativeInteger(5, 'count', 5)).toBe(5);
    expect(() => requireNonNegativeInteger('1', 'count', 5)).toThrow('Missing or invalid count');
    expect(() => requireNonNegativeInteger(Number.NaN, 'count', 5)).toThrow(
      'Missing or invalid count',
    );
    expect(() => requireNonNegativeInteger(-1, 'count', 5)).toThrow('Missing or invalid count');
    expect(() => requireNonNegativeInteger(1.5, 'count', 5)).toThrow('Missing or invalid count');
    expect(() => requireNonNegativeInteger(6, 'count', 5)).toThrow('Missing or invalid count');
  });
});
