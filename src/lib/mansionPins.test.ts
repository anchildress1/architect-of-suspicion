import { describe, it, expect } from 'vitest';
import { rooms } from './rooms';
import {
  MANSION_PINS,
  getMansionPin,
  surfacesOverlap,
  type MansionPin,
  type PinSurface,
} from './mansionPins';

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

  it('keeps every surface inside the canvas (Invariant 1)', () => {
    for (const [slug, pin] of Object.entries(MANSION_PINS)) {
      const { x, y, w, h } = pin.surface;
      expect(x, `${slug}.surface.x`).toBeGreaterThanOrEqual(0);
      expect(y, `${slug}.surface.y`).toBeGreaterThanOrEqual(0);
      expect(w, `${slug}.surface.w`).toBeGreaterThan(0);
      expect(h, `${slug}.surface.h`).toBeGreaterThan(0);
      expect(x + w, `${slug}.surface right edge`).toBeLessThanOrEqual(100);
      expect(y + h, `${slug}.surface bottom edge`).toBeLessThanOrEqual(100);
    }
  });

  it('keeps surfaces from overlapping each other (Invariant 2)', () => {
    const entries = Object.entries(MANSION_PINS);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [aSlug, a] = entries[i];
        const [bSlug, b] = entries[j];
        expect(
          surfacesOverlap(a.surface, b.surface),
          `${aSlug} surface overlaps ${bSlug} surface`,
        ).toBe(false);
      }
    }
  });

  it('is deeply frozen — coords cannot be mutated at runtime', () => {
    expect(Object.isFrozen(MANSION_PINS)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic)).toBe(true);
    expect(Object.isFrozen(MANSION_PINS.attic.surface)).toBe(true);
    expect(() => {
      (MANSION_PINS as unknown as Record<string, MansionPin>).attic.surface.x = 99;
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

describe('surfacesOverlap', () => {
  const base: PinSurface = { x: 10, y: 10, w: 20, h: 20 };

  it('returns true when rectangles intersect', () => {
    expect(surfacesOverlap(base, { x: 15, y: 15, w: 20, h: 20 })).toBe(true);
  });

  it('returns false when rectangles share only an edge', () => {
    // Right edge of base touches left edge of next at x=30. Touching != overlapping.
    expect(surfacesOverlap(base, { x: 30, y: 10, w: 5, h: 20 })).toBe(false);
  });

  it('returns false when rectangles are far apart', () => {
    expect(surfacesOverlap(base, { x: 60, y: 60, w: 20, h: 20 })).toBe(false);
  });

  it('returns false when one is fully above the other', () => {
    expect(surfacesOverlap(base, { x: 10, y: 31, w: 20, h: 5 })).toBe(false);
  });
});
