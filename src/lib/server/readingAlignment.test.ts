import { describe, it, expect } from 'vitest';
import { readingAlignment } from './readingAlignment';

// readingAlignment is the tone-steering signal driving the per-pick reaction
// prompt. It maps (classification, ai_score) into one of three zones —
// aligned / strained / null — across a six-cell matrix. The tests below
// walk every cell plus the |0.1| threshold edge.
describe('readingAlignment', () => {
  describe('proof / objection on a card with clear directional pull', () => {
    it('returns aligned when proof matches a positive score', () => {
      expect(readingAlignment('proof', 0.6)).toBe('aligned');
    });

    it('returns aligned when objection matches a negative score', () => {
      expect(readingAlignment('objection', -0.6)).toBe('aligned');
    });

    it('returns strained when proof is called on a negative-score card', () => {
      expect(readingAlignment('proof', -0.6)).toBe('strained');
    });

    it('returns strained when objection is called on a positive-score card', () => {
      expect(readingAlignment('objection', 0.6)).toBe('strained');
    });
  });

  describe('dismiss is part of the alignment matrix, not exempt', () => {
    it('returns null when dismissing a near-zero card (legitimate strike)', () => {
      expect(readingAlignment('dismiss', 0)).toBeNull();
      expect(readingAlignment('dismiss', 0.05)).toBeNull();
      expect(readingAlignment('dismiss', -0.05)).toBeNull();
    });

    it('returns strained when dismissing a card with clear positive pull', () => {
      expect(readingAlignment('dismiss', 0.6)).toBe('strained');
    });

    it('returns strained when dismissing a card with clear negative pull', () => {
      expect(readingAlignment('dismiss', -0.6)).toBe('strained');
    });
  });

  describe('near-zero scores collapse to neutral regardless of classification', () => {
    it('returns null for proof on a near-zero card', () => {
      expect(readingAlignment('proof', 0.05)).toBeNull();
      expect(readingAlignment('proof', -0.05)).toBeNull();
    });

    it('returns null for objection on a near-zero card', () => {
      expect(readingAlignment('objection', 0.05)).toBeNull();
      expect(readingAlignment('objection', -0.05)).toBeNull();
    });
  });

  describe('threshold edges', () => {
    it('treats |score| === 0.1 as a clear pull (strict less-than threshold)', () => {
      expect(readingAlignment('proof', 0.1)).toBe('aligned');
      expect(readingAlignment('proof', -0.1)).toBe('strained');
      expect(readingAlignment('dismiss', 0.1)).toBe('strained');
    });

    it('treats |score| just under 0.1 as neutral', () => {
      expect(readingAlignment('proof', 0.0999)).toBeNull();
      expect(readingAlignment('objection', -0.0999)).toBeNull();
      expect(readingAlignment('dismiss', 0.0999)).toBeNull();
    });
  });
});
