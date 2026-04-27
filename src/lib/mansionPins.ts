/**
 * Pin layout contract for the mansion overlay.
 *
 * Each pin owns ONE rectangle — its **surface** — expressed as percentages
 * of the mansion canvas (0..100 on each axis). The brass dot AND the
 * info tag both render strictly INSIDE this rectangle. The renderer uses
 * `overflow: hidden` on the surface element, so a careless tweak cannot
 * visually escape the declared box. This is the property that makes pin
 * tweaks safe — the artwork can be retuned without breaking the frame.
 *
 * `flip` selects which corner of the surface holds the dot:
 *   - flip=false → dot pinned to the TOP-LEFT  (tag fills the right side)
 *   - flip=true  → dot pinned to the TOP-RIGHT (tag fills the left side)
 *
 * Authoritative table + diagram: docs/mansion-pin-layout.md
 *
 * Invariants (enforced by mansionPins.test.ts):
 *   1. Every surface fits inside [0..100, 0..100].
 *   2. No two surfaces overlap.
 *   3. Chamber numerals are unique across pins.
 *   4. Every room slug from $lib/rooms has a matching pin (and vice versa).
 *
 * Visual debugging: append `?debug=pins` to /mansion to outline every
 * surface, so collisions or out-of-bounds tweaks are immediately visible.
 */
export interface PinSurface {
  /** Left edge of the surface, percent of canvas width. */
  x: number;
  /** Top edge of the surface, percent of canvas height. */
  y: number;
  /** Width of the surface, percent of canvas width. */
  w: number;
  /** Height of the surface, percent of canvas height. */
  h: number;
}

export interface MansionPin {
  surface: PinSurface;
  /** When true, dot anchors to the top-RIGHT of the surface and the tag
   *  fills the area to its left (mirrored layout for right-edge pins). */
  flip: boolean;
  /** Roman-numeral chamber label. Display-only, must be unique. */
  chamber: string;
}

function freezePins<T extends Record<string, MansionPin>>(pins: T): Readonly<T> {
  for (const pin of Object.values(pins)) {
    Object.freeze(pin.surface);
    Object.freeze(pin);
  }
  return Object.freeze(pins);
}

/**
 * Authoritative pin layout. Surfaces hand-tuned to:
 *   - Sit on the artwork's named architectural features
 *   - Stay inside [0..100, 0..100] on both axes (Invariant 1)
 *   - Not overlap any other surface (Invariant 2)
 *
 * If the mansion artwork changes, retune all surfaces together — they form
 * a single composition. Update docs/mansion-pin-layout.md in the same commit.
 */
export const MANSION_PINS = freezePins({
  attic: { surface: { x: 6, y: 20, w: 22, h: 12 }, flip: false, chamber: 'I' },
  gallery: { surface: { x: 38, y: 4, w: 22, h: 12 }, flip: false, chamber: 'II' },
  'control-room': { surface: { x: 72, y: 20, w: 22, h: 12 }, flip: true, chamber: 'III' },
  parlor: { surface: { x: 6, y: 52, w: 22, h: 12 }, flip: false, chamber: 'IV' },
  'entry-hall': { surface: { x: 38, y: 44, w: 22, h: 12 }, flip: false, chamber: 'V' },
  library: { surface: { x: 60, y: 52, w: 22, h: 12 }, flip: true, chamber: 'VI' },
  workshop: { surface: { x: 6, y: 80, w: 22, h: 12 }, flip: false, chamber: 'VII' },
  cellar: { surface: { x: 38, y: 70, w: 22, h: 12 }, flip: false, chamber: 'VIII' },
  'back-hall': { surface: { x: 72, y: 80, w: 22, h: 12 }, flip: true, chamber: 'IX' },
}) satisfies Readonly<Record<string, MansionPin>>;

export function getMansionPin(slug: string): MansionPin | undefined {
  return (MANSION_PINS as Record<string, MansionPin>)[slug];
}

/** Two surfaces overlap when their rectangles intersect on both axes. */
export function surfacesOverlap(a: PinSurface, b: PinSurface): boolean {
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;
  return a.x < bRight && aRight > b.x && a.y < bBottom && aBottom > b.y;
}
