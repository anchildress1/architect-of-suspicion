import { describe, it, expect } from 'vitest';
import { rooms } from './rooms';
import { MANSION_PINS, getMansionPin, type MansionPin } from './mansionPins';

describe('MANSION_PINS', () => {
  it('covers every room slug exactly once', () => {
    const pinSlugs = Object.keys(MANSION_PINS).toSorted();
    const roomSlugs = rooms.map((r) => r.slug).toSorted();
    expect(pinSlugs).toEqual(roomSlugs);
  });

  it('uses unique chamber numerals across all pins', () => {
    const numerals = Object.values(MANSION_PINS).map((p) => p.chamber);
    expect(new Set(numerals).size).toBe(numerals.length);
  });

  it('keeps every coordinate inside the canvas (0..100)', () => {
    for (const [slug, pin] of Object.entries(MANSION_PINS)) {
      expect(pin.x, `x for ${slug}`).toBeGreaterThanOrEqual(0);
      expect(pin.x, `x for ${slug}`).toBeLessThanOrEqual(100);
      expect(pin.y, `y for ${slug}`).toBeGreaterThanOrEqual(0);
      expect(pin.y, `y for ${slug}`).toBeLessThanOrEqual(100);
    }
  });

  it('flips right-edge pins so the leader/tag drops left', () => {
    // Pins at x ≥ 70 must flip; the tag would otherwise overflow the canvas.
    for (const [slug, pin] of Object.entries(MANSION_PINS)) {
      if (pin.x >= 70) expect(pin.flip, `${slug} should flip`).toBe(true);
      if (pin.x <= 30) expect(pin.flip, `${slug} should not flip`).toBe(false);
    }
  });

  it('is frozen — coords cannot be mutated at runtime', () => {
    expect(Object.isFrozen(MANSION_PINS)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic)).toBe(true);
    expect(() => {
      (MANSION_PINS as unknown as Record<string, MansionPin>).attic.x = 99;
    }).toThrow();
  });
});

describe('getMansionPin', () => {
  it('returns the pin for a known slug', () => {
    expect(getMansionPin('parlor')).toEqual(MANSION_PINS.parlor);
  });

  it('returns undefined for an unknown slug', () => {
    expect(getMansionPin('dungeon')).toBeUndefined();
  });
});
