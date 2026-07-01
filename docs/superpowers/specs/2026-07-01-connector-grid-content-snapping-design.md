# Connector endpoints snap to grid content (design)

**Date:** 2026-07-01
**Branch:** `feat/connector-grid-content-snapping` (base `1e8687b`)
**Status:** Approved — proceeding to implementation plan.

## Context

Connector endpoints today snap only to **drawn Surface** anchors (`box`/`line`/
`bracket`/`diamond`) via `snapPoint`, binding through `ref`+`anchor`. Grid content —
cell borders, screenshots (image slots), callouts, text blocks — are *not* Surface
annotations, so a connector has nothing to grab over a grid step. When a project has
no drawn shapes, the focused-connector snap dots don't appear either, so it looks
like "snapping doesn't work."

This feature lets a connector endpoint **snap to grid content**, landing as a
**free point** (snap-and-stay, not a live binding), and shows snap dots on that
content so the targets are visible.

## Locked decisions (from brainstorming)

1. **Snap-and-stay (free point)** — snapping to grid content stores an absolute
   `x/y`; it does NOT bind/re-track when the content later moves. (Drawn-shape
   binding via `ref`+`anchor` is unchanged.)
2. **Targets = grid content:** cell borders, screenshots, callouts, text blocks.
3. **Show snap dots** on grid content when a connector is focused.
4. **No schema change** — grid snaps store free `x/y`; drawn-shape snaps keep
   `ref`+`anchor`. Both already resolve in print. Editor-only; renderer/print
   untouched.

## Architecture

### Pure geometry (`lib/annotations.ts`)

```ts
/** The 9 anchor points of a rectangle: 4 corners, 4 edge midpoints, center. */
export function rectAnchors(rect: Rect): Point[];

/** The nearest point to `p` within `thr` (Euclidean, normalized), or null. */
export function nearestPoint(p: Point, points: Point[], thr: number): Point | null;
```

`rectAnchors` returns, for `{x,y,w,h}`: top-left, top-center, top-right,
mid-left, center, mid-right, bottom-left, bottom-center, bottom-right (a fixed,
documented order). `nearestPoint` scans and returns the closest within `thr` (first
wins on exact tie), else null. Both pure, unit-tested. (`Rect`/`Point` already
exist from the alignment-snapping feature.)

### Editor (`PreviewAnnotations.tsx`)

**Grid-content anchors** are measured from the DOM when a connector is focused and
kept in component state:

- A `useLayoutEffect` (keyed on the focused connector id + `fitKey` + `scale`, like
  the existing page-rect effect) measures `.grid-cell, .img-slot, .callout,
  .grid-text` elements inside the focused page via `getBoundingClientRect`,
  normalizes each against the page rect (the same conversion `collectSnapTargets`
  uses), runs `rectAnchors` on each, and flattens to a `gridAnchors: Point[]` state.
  When the focused annotation is not a connector, `gridAnchors` is `[]`.

**Snap dots:** the existing focused-connector `showSnap` block (which renders dots
at every drawn-surface anchor) also renders a dot at each `gridAnchors` point, same
`.preview-anno-snap` style. Now the user sees where an endpoint can land.

**Snapping in the drag** — the connector-endpoint branch of `apply` becomes:

```
if (alt)                    → raw free point { x: p.x, y: p.y }        (existing bypass)
else:
  snap = snapPoint(surfaces, p, 0.025)
  if (snap.ref)             → bind to the drawn surface (ref + anchor)  (existing)
  else:
    gp = nearestPoint(p, gridAnchors, GRID_THR)
    if (gp)                 → free point { x: gp.x, y: gp.y }           (NEW)
    else                    → free point, axis-snapped to the other end (existing)
```

Precedence is **drawn-surface first** (explicit shapes win when in range), then
grid content, then the axis-snap fallback — simple and predictable, no
distance-comparison across the two systems. `GRID_THR = POINT_SNAP_PX / (W * scale)`
with `POINT_SNAP_PX = 8` (screen-consistent, slightly larger than the alignment
feature's 6px because point-to-point is finer than edge-to-line). Both `from` and
`to` endpoints use this. `gridAnchors` is read from state (already current), so no
separate drag-start measurement is needed.

### No other changes

The renderer (`AnnotationLayer.tsx`) and print path are untouched. A grid snap
produces a plain free-point endpoint that resolves identically in the PDF. No
schema field is added. Alignment snapping (surfaces) is unaffected.

## Testing

### Unit (`lib/annotations.test.ts`)

1. **`rectAnchors`** — `r(0.2, 0.1, 0.4, 0.2)` returns the 9 expected points in
   the documented order (corners `(0.2,0.1)…(0.6,0.3)`, edge mids, center
   `(0.4,0.2)`).
2. **`nearestPoint` — hit** — nearest within `thr` is returned (e.g. picks the
   closer of two candidates).
3. **`nearestPoint` — miss** — all points beyond `thr` → `null`.
4. **`nearestPoint` — tie** — two equidistant points → the first is returned
   (deterministic).

### Visual (editor) — in-browser

Over a grid step: focus a connector → snap dots appear on cells, screenshots,
callouts, text blocks. Drag an endpoint near a cell edge / screenshot / callout →
it snaps to that anchor and drops as a free point (the `from`/`to` panel shows the
snapped `x/y`, still `free point`). Hold **Alt** → no snap. Confirm a connector
bound to a drawn Box still binds (draw a Box, snap to it → `ref` shown). Confirm
`/print` renders the connector identically (no dots, endpoint at the snapped point).

## Out of scope

- **True binding / re-tracking** to grid content (chosen: snap-and-stay). If the
  cell/content later moves, the endpoint stays put.
- Binding to sub-parts of a callout/text (word/line level).
- Fixed-grid snapping and distribution guides (separate backlog item).
- Distance-based precedence between drawn-surface and grid anchors (drawn-surface
  first is intentional).

## Docs

- **ADR-004** amended: a short interaction record — connector endpoints snap to
  grid-content anchors (`.grid-cell`/`.img-slot`/`.callout`/`.grid-text`,
  DOM-measured, `rectAnchors`/`nearestPoint` pure helpers) as **free points**
  (snap-and-stay, no binding), with snap dots shown on grid content; drawn-surface
  binding and Alt bypass unchanged; no schema change; editor-only (renders
  identically in print).
- **ROADMAP.md**: note connector→grid-content snapping done (snap-and-stay);
  true-binding re-tracking remains a possible future item.
