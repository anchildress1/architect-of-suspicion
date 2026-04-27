# Mansion Pin Layout

Authoritative spec for the chamber pins overlaid on `house-exterior.webp`
on `/mansion`.

## The contract

Each pin owns **one rectangle** — its `surface` — expressed as percentages
of the mansion canvas (0..100 on each axis). The brass dot **and** the info
tag both render strictly **inside** that rectangle.

This is the only rule. The renderer enforces it with `overflow: hidden`
on the surface element so a sloppy tweak (a too-wide tag, an over-sized
dot, a stray `translate()`) is **clipped**, not leaked into other surfaces
or out of the brass frame.

> If the box says you have 22% × 12%, that is what you get.
> The pixel-px offsets that used to drive the leader and tag are gone.
> Width/height are surface-relative. Do not reintroduce pixel offsets
> on the tag — that defeats the contract.

## Data model

`src/lib/mansionPins.ts`:

```ts
interface MansionPin {
  surface: { x: number; y: number; w: number; h: number }; // canvas %
  flip: boolean; // false = dot in top-LEFT, true = dot in top-RIGHT
  chamber: string; // Roman numeral, must be unique
}
```

## Invariants (enforced by `mansionPins.test.ts`)

1. Every surface fits inside `[0..100, 0..100]` on both axes.
2. No two surfaces overlap (touching edges is allowed).
3. Chamber numerals are unique across pins.
4. Every room slug from `$lib/rooms` has a matching pin (and vice versa).
5. `MANSION_PINS` is deeply frozen — coords cannot be mutated at runtime.

## Surface table

Hand-tuned to land on the artwork's named architectural features while
respecting Invariants 1 and 2.

| Slug           | Chamber | Surface (x, y, w, h) | Flip  | Anchored on (artwork)             |
| -------------- | ------- | -------------------- | ----- | --------------------------------- |
| `attic`        | I       | (6, 20, 22, 12)      | false | left tower upper window           |
| `gallery`      | II      | (38, 4, 22, 12)      | false | peaked dormer left of the clock   |
| `control-room` | III     | (72, 20, 22, 12)     | true  | right peaked dormer               |
| `parlor`       | IV      | (6, 52, 22, 12)      | false | 2nd-floor bay window, left        |
| `entry-hall`   | V       | (38, 44, 22, 12)     | false | sealed main door                  |
| `library`      | VI      | (60, 52, 22, 12)     | true  | 2nd-floor bay window, right       |
| `workshop`     | VII     | (6, 80, 22, 12)      | false | ground-floor lit window, left     |
| `cellar`       | VIII    | (38, 70, 22, 12)     | false | archway at the base of the stairs |
| `back-hall`    | IX      | (72, 80, 22, 12)     | true  | ground-floor lit window, right    |

## Rendering

```
┌─────────────────────────────────────┐  surface (overflow:hidden)
│ ●  ┌──────────────────────────────┐ │
│    │ Ch. N           ENTER         │ │  pin-tag (fills the rest)
│    │ Chamber Name                  │ │
│    │ CATEGORY                      │ │
│    └──────────────────────────────┘ │
└─────────────────────────────────────┘
```

The dot lives in the top-left (or top-right, when `flip: true`) of the
surface. The tag fills the rest. There is **no leader** in the new model
— the dot and tag are visually adjacent inside the same rectangle, and
proximity is enough.

## States

The same surface is shared across all four states. Only colours change.

| State     | Dot                | Tag border  |
| --------- | ------------------ | ----------- |
| Default   | warm brass + ping  | warm brass  |
| Visited   | bright gold + ping | bright gold |
| Sealed    | charcoal, no ping  | ember red   |
| Exhausted | cyan, no ping      | cyan        |

## Tweaking the layout

When the artwork changes, retune **all** surfaces together — they form
one composition.

Workflow:

1. Append `?debug=pins` to the `/mansion` URL. Surfaces and tags get
   dashed outlines so you can see the rectangles. **Debug mode also
   skips the session redirect**, so you can inspect the layout without
   spinning up a real game (chambers won't be enterable, but the pins
   render).
2. Edit `MANSION_PINS` in `src/lib/mansionPins.ts`.
3. Update the table in this doc in the **same commit**.
4. `pnpm vitest run src/lib/mansionPins.test.ts` — the test suite fails
   if any surface drifts outside the canvas, overlaps another surface,
   or loses parity with `$lib/rooms`.

## Why this exists

Earlier passes at this overlay used point-based coords (`{ x, y }`) plus
pixel-px offsets for the leader and tag. Each artwork tweak forced a
ripple of follow-up tweaks because the geometry wasn't bounded — a 2%
shift on a dot's `x` would push its tag past the brass frame at some
viewport widths. The surface-bounded model trades expressive freedom for
predictability: you can move pins freely, but you cannot move them out.
