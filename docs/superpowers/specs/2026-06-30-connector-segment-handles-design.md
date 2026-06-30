# P3 — Connector segment-drag handles + relative-offset routing (design)

**Date:** 2026-06-30
**Branch:** `feat/connector-segment-handles` (base `f54a5da`)
**Status:** Approved — proceeding to implementation plan.

## Context — the FigJam-elbow epic

P3 of three, the final phase. **P1** (orthogonal L/Z/C/U routing) and **P2**
(rounded corners) shipped to `main` (`f54a5da`). P1 made `square` connectors
auto-route as right-angle elbows; P2 rounded the corners. Both are pure geometry
in `lib/annotations.ts`, consumed identically by the editor preview and the
Playwright print path through `connectorPoints`.

P3 adds the interactive layer: **drag any segment of a square connector to
reshape its route, and have the manual adjustment survive when a connected box
moves** — FigJam's draggable elbow handles.

## Goal

For a `square` (orthogonal) connector, render a midpoint handle on every segment.
Dragging a handle moves that run on its perpendicular axis (a horizontal run
moves vertically, a vertical run moves horizontally), keeping the whole route
orthogonal. The manual adjustment is stored **relative to the auto-route**, so
when a connected surface moves and the route recomputes, the adjustment rides
along. Editor preview and print stay identical (pure geometry, no renderer
divergence). Additive schema — no data migration.

## Locked decisions (from brainstorming)

1. **Storage = relative offset that rides the auto-route** (the FigJam model),
   *not* absolute page coordinates and *not* proportional-to-endpoints. A manual
   drag is stored as a perpendicular **offset from where the auto-route would
   place that run**; every render recomputes the auto-route from current
   endpoints and re-applies the offset.
2. **Every segment draggable, including L-bending.** A single-elbow L route (no
   interior run) can be grabbed and pulled into a new bend; the drag **inserts**
   a detour rather than only moving an existing run.

## Storage model

New **additive** types in `lib/book-schema.ts`:

```ts
/** A manual adjustment to one segment of a square connector's auto-route. */
export interface ConnectorBend {
  /** Index of the auto-route segment this bend adjusts/inserts into
   *  (0-based, into the pure squareRoute polyline's segment list). */
  seg: number;
  /** Orientation of the controlled run: "h" = horizontal (offset moves it in
   *  Y), "v" = vertical (offset moves it in X). */
  axis: "h" | "v";
  /** Signed perpendicular displacement FROM the auto-route baseline,
   *  normalized page units. */
  offset: number;
}
```

`Connector` gains:

```ts
/** Manual segment adjustments for square routing (P3). Each rides the
 *  recomputed auto-route as a perpendicular offset; dropped if a reflow changes
 *  the route's class so the segment no longer matches. Square-only —
 *  `waypoints` remains the mechanism for `straight` connectors. */
bends?: ConnectorBend[];
```

### Why this rides with reflow

Endpoints resolve from (possibly moved) surfaces every render. `connectorPoints`
recomputes the pure `squareRoute` auto-route, then applies each bend as a
perpendicular offset on top. Move a box → endpoint moves → base segment moves to
its new position → the manual run sits at `newBasePosition + offset`. The
adjustment rides along — exactly the chosen behavior.

### Graceful drop on class change

If a surface moves far enough to change the route's class (L↔Z↔C↔U), the base
route's segment count and per-segment axes change. A bend whose `seg` is now out
of range, or whose `axis` no longer matches the base segment at that index, is
**dropped**; the route reverts to the clean auto-route. This matches FigJam,
which also discards manual bends when topology changes drastically. Dropping is a
pure render-time decision — the stored `bends` are left as-is (a later reflow
back to the original class could even revive them), but they do not corrupt the
rendered path.

### Scope cap (YAGNI)

**At most one bend per base segment.** Dragging a run that already has a bend
updates that bend's `offset` (it does not stack). An L (2 base segments) can be
bent into an S/Z; a Z (3 base segments) can have all three runs nudged. This
covers the real cases without a general multi-via orthogonal router. More than
one bend per base segment is out of scope.

### Relationship to `waypoints`

`waypoints` (absolute points, straight segments through them) is **untouched**
and remains the mechanism for **`straight`** connectors' free polyline. `bends`
is **square-only**. The two never coexist on one connector:

- `routing === "square"` → route = `squareRoute` auto-route + `bends`.
  (Legacy back-compat: a square connector that still carries `waypoints` and has
  no `bends` renders its `waypoints` as today, so no existing book regresses.)
- `routing !== "square"` → `waypoints` as today.

## Routing / render

New pure helper in `lib/annotations.ts`:

```ts
/** Provenance of one rendered route segment, so the editor can map a handle
 *  drag back to a bend. `bend` is the index into the connector's `bends` array
 *  the segment is controlled by (the run the user drags), or null for fixed
 *  segments (anchor stubs, untouched base runs have baseSeg set). */
export interface SegmentMeta {
  /** Base auto-route segment this rendered segment derives from. */
  baseSeg: number;
  /** Index into `bends` this segment's perpendicular position is governed by,
   *  or null if this rendered segment is not the draggable run of a bend. */
  bend: number | null;
}

export function routeWithBends(
  base: Point[],
  bends: ConnectorBend[],
  from: Endpoint,
  to: Endpoint,
): { points: Point[]; segments: SegmentMeta[] };
```

Algorithm, per bend (validated, then applied; invalid → dropped):

- **Validate:** `0 ≤ seg < base.length - 1`; the base segment `[base[seg],
  base[seg+1]]` orientation matches `axis` (a horizontal base segment for `axis:
  "h"`, vertical for `axis: "v"`). Fail → drop the bend.
- **Interior run** (neither endpoint of the base segment is the route's `a`/`b`):
  displace the run perpendicular by `offset`. Both shared corners move with it;
  the two neighboring (perpendicular) runs lengthen/shorten. Stays orthogonal.
- **Anchored run** (the base segment touches `a` or `b`): insert a detour. Keep a
  short perpendicular **stub** off the box edge (reusing the existing P1 `STUB`
  constant, so the anchor exit stays perpendicular — the P1 invariant), then jog
  by `offset` to the displaced run, then continue to the rest of the route. This
  is L-bending: a 2-segment base becomes a 4-segment rendered route.

Multiple bends are applied in `seg` order on a working copy, tracking index
shifts from inserted detours so later bends address the correct base runs.

`connectorPoints` wiring:

```ts
if (c.routing !== "square") return [a, ...wps.map(...), b];        // straight: unchanged
if (wps.length > 0 && !(c.bends?.length)) return [a, ...wps, b];   // legacy square+waypoints back-compat
return routeWithBends([a, ...squareRoute(a, b, c.from, c.to), b],
                      c.bends ?? [], c.from, c.to).points;
```

`connectorPoints` continues to return `Point[]` for all existing callers. The
editor obtains the `segments` provenance via a sibling export (e.g. a
`connectorRoute(annotations, c)` that returns `{ points, segments }`, with
`connectorPoints` delegating to it for the points). **P2 rounded corners apply
unchanged** — `buildRoundedConnector` consumes the final polyline regardless of
how the corners arose. `AnnotationLayer.tsx` needs **no change**.

## Interaction (editor only — `PreviewAnnotations.tsx`)

- A focused **square** connector shows a **midpoint handle on every rendered
  segment** (from the route's `points`/`segments`).
- Dragging a handle is **axis-constrained**: a horizontal run moves only in Y, a
  vertical run only in X. The perpendicular delta becomes the bend `offset`.
- **Provenance mapping:** the dragged segment's `SegmentMeta` says whether it
  already governs a bend (update its `offset`) or is a plain base run
  (create a `ConnectorBend { seg: baseSeg, axis, offset }`). One bend per base
  segment — re-dragging updates, never stacks.
- **Snap-to-auto:** dragging a run back within a small tolerance of its
  auto-route position snaps `offset` to 0 and **removes** the bend (clean reset).
- Endpoint (`from`/`to`) drag + anchor snapping is **unchanged**. `straight`
  connectors keep their existing absolute `waypoints` handles, unchanged.

The store mutation reuses `updateAnnotation(ci, si, id, { bends })` — `bends` is
rewritten immutably (new array) on each drag frame, consistent with the existing
throttled-to-rAF endpoint/waypoint drag.

## Architecture / files

- **`lib/book-schema.ts`** — add `ConnectorBend` + `Connector.bends?`.
- **`lib/annotations.ts`** — add `SegmentMeta`, `routeWithBends`,
  `connectorRoute`; wire `connectorPoints`. Pure, no mutation.
- **`components/renderer/AnnotationLayer.tsx`** — **no change** (consumes
  `connectorPoints`; rounded corners unaffected).
- **`components/editor/PreviewAnnotations.tsx`** — segment midpoint handles,
  axis-constrained perpendicular drag, provenance → bend create/update,
  snap-to-auto removal. Endpoint drag untouched.

## Testing

### Unit (`lib/annotations.test.ts`) — pure `routeWithBends` / `connectorRoute`

1. **Interior run displacement** — a Z route's middle cross-run offset by `+0.1`
   moves both its corners on the perpendicular axis; endpoints and anchor-exit
   runs unchanged; result stays orthogonal.
2. **L-bending insert** — an L (2 base segments) with one bend on the
   anchored run yields a 4-point rendered route (inserted detour); the anchor
   exit stays perpendicular (stub present).
3. **Graceful drop — out of range** — a bend with `seg` ≥ base segment count is
   ignored; route equals the clean auto-route.
4. **Graceful drop — axis mismatch** — a bend whose `axis` disagrees with the
   base segment at `seg` is ignored.
5. **Ride-with-reflow** — recompute the base route with a moved endpoint, apply
   the same bend `offset`; the manual run sits at `newBase + offset` (the offset
   is preserved, the absolute position moved).
6. **Provenance** — `segments` length equals rendered-segment count; the dragged
   run's `SegmentMeta.bend` points at the controlling bend; fixed stubs report
   `bend: null`.
7. **One-bend-per-segment** — two bends sharing a `seg` is not produced by the
   editor; the helper applies only the first (documented determinism).

### Visual (the print path) — gate before the docs commit

Using `data/projects/elbow-demo`: drag a segment of each shape; move a connected
box; render `/elbow-demo/print` (Playwright screenshot + `<line>`/`<path>` SVG
grep) and confirm by eye — runs sit where dragged, stay orthogonal, corners still
rounded, and a moved box carries its manual run along (ride-with-reflow). Editor
preview matches print.

## Out of scope

- More than one bend per base segment; a general multi-via orthogonal router.
- Changing endpoint anchoring behavior, snapping, or markers.
- Rounding or bending the `straight` route.
- Obstacle avoidance (a run may still cross a box body in degenerate overlaps —
  unchanged from P1; deferred).

## Docs

- **ADR-004** amended: a new section recording the relative-offset bend model
  (`ConnectorBend`, offset-from-auto-route, graceful drop, one-bend cap,
  `routeWithBends` provenance), why storage is relative not absolute, and that
  editor + print stay identical via `connectorPoints`. No schema migration.
- **ROADMAP.md**: mark epic **P3 — segment handles** done; the FigJam-elbow epic
  complete.
