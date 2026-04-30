import { describe, it, expect } from 'vitest';
import { rooms } from './rooms';
import { MANSION_PINS, getMansionPin, type MansionPin } from './mansionPins';

describe('MANSION_PINS contract', () => {
  it('covers every room slug exactly once', () => {
    const pinSlugs = Object.keys(MANSION_PINS).toSorted();
    const roomSlugs = rooms.map((r) => r.slug).toSorted();
    expect(pinSlugs).toEqual(roomSlugs);
  });

  it('uses unique chamber numerals across all pins', () => {
    const numerals = Object.values(MANSION_PINS).map((p) => p.chamber);
    expect(new Set(numerals).size).toBe(numerals.length);
  });

  it('keeps every dot and tag inside the canvas (Invariant 1)', () => {
    for (const [slug, pin] of Object.entries(MANSION_PINS)) {
      for (const [name, p] of [
        ['dot', pin.dot],
        ['tag', pin.tag],
      ] as const) {
        expect(p.x, `${slug}.${name}.x`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${slug}.${name}.x`).toBeLessThanOrEqual(100);
        expect(p.y, `${slug}.${name}.y`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${slug}.${name}.y`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is deeply frozen — coords cannot be mutated at runtime', () => {
    expect(Object.isFrozen(MANSION_PINS)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic.dot)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic.tag)).toBe(true);
    expect(() => {
      (MANSION_PINS as unknown as Record<string, MansionPin>).attic.dot.x = 99;
    }).toThrow();
    expect(() => {
      (MANSION_PINS as unknown as Record<string, MansionPin>).attic.tag.x = 99;
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
