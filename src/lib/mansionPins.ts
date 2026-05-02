/**
 * Pin layout for the mansion overlay.
 *
 * Two independent points define each pin:
 *   - `dot` — where the brass dot lands on the artwork (the architectural
 *     feature for the chamber)
 *   - `tag` — the top-left of the dark info tag
 *
 * Both are expressed as percentages of the mansion canvas (0..100 on each
 * axis). The renderer places the dot centered on `dot`, places the tag
 * top-left at `tag`, and draws a brass hairline leader from one to the
 * other. Tag width is a fixed pixel value declared in CSS — tag content
 * doesn't dictate canvas geometry, so a long category label can't push
 * the layout sideways.
 *
 * Authoritative table + diagram: docs/mansion-pin-layout.md
 *
 * Invariants (enforced by mansionPins.test.ts):
 *   1. `dot` and `tag` both fit inside [0..100, 0..100].
 *   2. Chamber numerals are unique across pins.
 *   3. Every room slug from $lib/rooms has a matching pin (and vice versa).
 *   4. `MANSION_PINS` is deeply frozen — coords cannot be mutated at runtime.
 *
 * Visual debugging: append `?debug=pins` to /mansion to outline every tag
 * (and stay on the page without a session).
 */
export interface PinPoint {
  /** Percent of canvas width (0..100). */
  x: number;
  /** Percent of canvas height (0..100). */
  y: number;
}

export interface MansionPin {
  /** Brass dot anchor — sits on the artwork's named architectural feature. */
  dot: PinPoint;
  /** Top-left of the info tag. Tag width is fixed in CSS. */
  tag: PinPoint;
  /** Roman-numeral chamber label. Display-only, must be unique. */
  chamber: string;
}

function freezePins<T extends Record<string, MansionPin>>(pins: T): Readonly<T> {
  for (const pin of Object.values(pins)) {
    Object.freeze(pin.dot);
    Object.freeze(pin.tag);
    Object.freeze(pin);
  }
  return Object.freeze(pins);
}

/**
 * Authoritative pin layout. Hand-tuned against the design QA reference
 * render so each dot lands on its named architectural feature, with the
 * tag floating clear of the artwork's central detail.
 */
export const MANSION_PINS = freezePins({
  attic: { dot: { x: 22, y: 18 }, tag: { x: 28, y: 14 }, chamber: 'I' },
  gallery: { dot: { x: 53, y: 13 }, tag: { x: 56, y: 24 }, chamber: 'II' },
  'control-room': { dot: { x: 78, y: 18 }, tag: { x: 60, y: 7 }, chamber: 'III' },
  parlor: { dot: { x: 22, y: 41 }, tag: { x: 28, y: 38 }, chamber: 'IV' },
  'entry-hall': { dot: { x: 50, y: 50 }, tag: { x: 54, y: 56 }, chamber: 'V' },
  library: { dot: { x: 78, y: 41 }, tag: { x: 60, y: 38 }, chamber: 'VI' },
  workshop: { dot: { x: 20, y: 78 }, tag: { x: 26, y: 75 }, chamber: 'VII' },
  cellar: { dot: { x: 50, y: 90 }, tag: { x: 54, y: 88 }, chamber: 'VIII' },
  'back-hall': { dot: { x: 80, y: 78 }, tag: { x: 62, y: 75 }, chamber: 'IX' },
}) satisfies Readonly<Record<string, Readonly<MansionPin>>>;

export function getMansionPin(slug: string): Readonly<MansionPin> | undefined {
  return (MANSION_PINS as Readonly<Record<string, Readonly<MansionPin>>>)[slug];
}
