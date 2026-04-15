import { describe, it, expect } from 'vitest';
import { claims, getRandomClaim } from './claims';

describe('claims', () => {
  it('has at least one claim', () => {
    expect(claims.length).toBeGreaterThan(0);
  });

  it('all claims are non-empty strings', () => {
    for (const claim of claims) {
      expect(typeof claim).toBe('string');
      expect(claim.length).toBeGreaterThan(0);
    }
  });
});

describe('getRandomClaim', () => {
  it('returns a string from the claims array', () => {
    const result = getRandomClaim();
    expect(claims).toContain(result);
  });

  it('returns a valid claim across multiple calls', () => {
    for (let i = 0; i < 20; i++) {
      expect(claims).toContain(getRandomClaim());
    }
  });
});
