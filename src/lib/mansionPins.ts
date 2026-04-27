/**
 * Pin geometry for the mansion overlay.
 *
 * Each pin is a percentage-based offset onto the `house-exterior.webp`
 * artwork. Coords are hand-placed onto real architectural features in the
 * photograph (windows, doors, archways) so the overlay reads as
 * "notes pinned onto a building" rather than a tabular layout.
 *
 * Feature map (locked to the artwork — do not reorder or rename):
 *   - attic        = far-left tower upper window
 *   - gallery      = peaked dormer left of the clock
 *   - control-room = right peaked dormer
 *   - parlor       = 2nd-floor bay window, left
 *   - library      = 2nd-floor bay window, right
 *   - entry-hall   = sealed main door (centred)
 *   - workshop     = ground-floor lit window, left of the door
 *   - back-hall    = ground-floor lit window, right of the door
 *   - cellar       = archway at the base of the stairs
 *
 * `flip: true` draws the leader/tag LEFT instead of right, so right-edge
 * pins don't overflow the canvas. The chamber numerals (I–IX) are display
 * labels only and follow the in-game ordering, not the slug list order.
 *
 * Coordinates are tuned for the 1440×900 board aspect ratio. If the
 * artwork is ever swapped, re-tune all pins together — they form a
 * single composition. The `?debug=pins` querystring on /mansion paints
 * leader bounding boxes for collision checks.
 */
export interface MansionPin {
  /** Percent-offset from the left of `house-exterior.webp`. */
  x: number;
  /** Percent-offset from the top of `house-exterior.webp`. */
  y: number;
  /** Draw the leader/tag to the LEFT of the dot when true. */
  flip: boolean;
  /** Roman-numeral chamber label. Display-only. */
  chamber: string;
}

function freezePins<T extends Record<string, MansionPin>>(pins: T): Readonly<T> {
  for (const pin of Object.values(pins)) Object.freeze(pin);
  return Object.freeze(pins);
}

export const MANSION_PINS = freezePins({
  attic: { x: 18, y: 23, flip: false, chamber: 'I' },
  gallery: { x: 48, y: 6, flip: false, chamber: 'II' },
  'control-room': { x: 95, y: 21, flip: true, chamber: 'III' },
  'entry-hall': { x: 52, y: 49, flip: false, chamber: 'V' },
  parlor: { x: 22, y: 55, flip: false, chamber: 'IV' },
  library: { x: 80, y: 60, flip: true, chamber: 'VI' },
  cellar: { x: 59, y: 79, flip: false, chamber: 'VIII' },
  workshop: { x: 19, y: 83, flip: false, chamber: 'VII' },
  'back-hall': { x: 95, y: 92, flip: true, chamber: 'IX' },
}) satisfies Readonly<Record<string, MansionPin>>;

export function getMansionPin(slug: string): MansionPin | undefined {
  return (MANSION_PINS as Record<string, MansionPin>)[slug];
}
