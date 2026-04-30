# Mansion Pin Layout

Authoritative spec for the chamber pins overlaid on `house-exterior.webp`
on `/mansion`.

## The model

Each pin is **two independent points** in canvas-percent coordinates plus
a chamber numeral. The renderer places a brass dot at one, a dark info
tag at the other, and connects them with an SVG hairline.

```ts
interface MansionPin {
  dot: { x: number; y: number }; // 0..100, percent of canvas
  tag: { x: number; y: number }; // 0..100, top-left of the tag
  chamber: string; // unique Roman numeral
}
```

That's it. The dot and tag are decoupled — moving the dot doesn't push
the tag, and a long category label can't push the layout sideways
because the tag's width is fixed in CSS (200px).

## Invariants (enforced by `mansionPins.test.ts`)

1. Both `dot` and `tag` fit inside `[0..100, 0..100]`.
2. Chamber numerals are unique across pins.
3. Every room slug from `$lib/rooms` has a matching pin (and vice versa).
4. `MANSION_PINS` is deeply frozen — coords cannot be mutated at runtime.

## Pin table

Hand-tuned against the design QA reference render so each dot lands on
its named architectural feature.

| Slug           | Chamber | Dot (x, y) | Tag (x, y) | Anchored on (artwork)             |
| -------------- | ------- | ---------- | ---------- | --------------------------------- |
| `attic`        | I       | (14, 18)   | (19, 14)   | left tower upper window           |
| `gallery`      | II      | (51, 12)   | (54, 10)   | central clock face                |
| `control-room` | III     | (89, 18)   | (74, 15)   | right tower upper window          |
| `parlor`       | IV      | (13, 47)   | (17, 46)   | 2nd-floor bay window, left        |
| `entry-hall`   | V       | (52, 42)   | (60, 40)   | 2nd-floor central pediment        |
| `library`      | VI      | (90, 49)   | (75, 49)   | 2nd-floor bay window, right       |
| `workshop`     | VII     | (13, 78)   | (22, 77)   | 1st-floor lit window, left        |
| `cellar`       | VIII    | (49, 71)   | (53, 71)   | central front door under the lamp |
| `back-hall`    | IX      | (89, 82)   | (75, 83)   | 1st-floor lit window, right       |

Tag width is 200px (set in CSS, not data). When the tag sits to the left
of the dot, give it room: pick a `tag.x` that leaves the tag visually
clear of the dot. The leader auto-routes from `dot` to the closest
horizontal tag edge.

## Rendering

```
●─────  Ch. N        Enter
        Chamber Name
        CATEGORY
```

- The dot is centered on `dot` (CSS `transform: translate(-50%, -50%)`).
- The tag's top-left is at `tag`. It has a fixed pixel width and
  auto height.
- The leader is an SVG line in a `<svg viewBox="0 0 100 100">` that
  shares the canvas — no manual scale math, the line stays correct as
  the canvas resizes.

## Tweaking the layout

When the artwork changes:

1. Append `?debug=pins` to `/mansion`. Every tag gets a dashed yellow
   outline, and debug mode skips the session redirect so you can inspect
   the layout without spinning up a real game (chambers won't be
   enterable, but the pins render).
2. Edit `MANSION_PINS` in `src/lib/mansionPins.ts`.
3. Update the table above in the **same commit**.
4. `pnpm vitest run src/lib/mansionPins.test.ts` — the suite fails if
   any coord drifts outside the canvas or loses parity with `$lib/rooms`.

## Why this exists

Earlier iterations bound dot and tag together inside a single
"surface" rectangle with `overflow: hidden` to prevent geometry tweaks
from leaking into other pins. That gave us predictability but cost us
the freedom to place a tag where it needed to be — the surface had to
be enlarged whenever the tag wanted breathing room, and tag widths
ended up dictated by surface widths instead of typography.

The current model is simpler: dot and tag are independent points; a
leader connects them; tag size is a typography decision (fixed pixel
width); the canvas is the only shared coordinate space.
