# P1 — Connector orthogonal (elbow) routing (design)

**Date:** 2026-06-29
**Branch:** `feat/connector-elbow-routing` (base `ae1f57d`)
**Status:** Approved — proceeding to implementation plan.

## Context — the FigJam-elbow epic

This is **P1 of three** in a "FigJam-style elbow connector" epic. Each sub-project
gets its own spec → plan → implementation cycle:

- **P1 (this spec) — Orthogonal auto-routing geometry.** Multi-corner square
  routing (L / Z / C / U) computed purely from endpoints. No schema change, no
  renderer change.
- **P2 — Rounded corners.** Render the route as one `<path>` with
  `stroke-linejoin="round"` (+ optional arc radius) in both editor overlay and
  print. Pure render; independent; lands after P1 so it rounds whatever corners
  P1 produces.
- **P3 — Interactive segment handles + relative-offset storage.** Axis-constrained
  midpoint handles on each straight run, a *stored* relative-offset model so
  manual drags persist, and reflow preservation on object move. Schema change +
  new ADR; gets its own dedicated brainstorm (today's `waypoints` are absolute
  and would not track object moves).

P1 is deliberately pure geometry: it gives FigJam-quality default routes; P3's
handles later let the user refine them.

## Goal

Extend `square` connector routing from a single elbow (1 corner) to a full
orthogonal router that exits each edge-anchored endpoint **perpendicular to and
outward from** its edge, then routes to the other endpoint with right angles —
producing L, Z, C, or U shapes as the geometry requires, with no backtracking
over an anchored endpoint for the common arrangements.

Today (`lib/annotations.ts`, `connectorPoints` → `squareHorizontalFirst`) a
square route is always `[a, corner, b]` (one elbow). That correctly handles the
case where the two ends need **different** axes (one horizontal exit, one
vertical). It cannot satisfy two ends that need the **same** axis — e.g. a
`right`-edge source and a `left`-edge target — which currently enters the target
from the wrong side. P1 closes that gap and generalizes to all edge-to-edge
arrangements.

## Scope decisions (locked during brainstorming)

- **Stub-based routing, not midpoint-only.** Each edge-anchored end steps outward
  by a fixed normalized stub `STUB` along its edge normal before routing. This
  guarantees the line leaves each box outward even for facing-away / parallel
  arrangements (U / C), at the cost of one tuning constant + a sign-aware
  direction helper.
- **Anchor name is the only input needed for direction.** `right → (+1, 0)`,
  `left → (−1, 0)`, `top → (0, −1)`, `bottom → (0, +1)`. The connected surface's
  *bounds* are **not** consulted — routing stays a pure function of the two
  resolved endpoints and their anchors. (This is what keeps it out of obstacle
  avoidance; see Out of scope.)
- **Five deterministic shapes** (see Routing taxonomy). The choice is fully
  determined by the two anchors and the two resolved points — no heuristics
  beyond the existing dominant-axis fallback for unanchored ends.
- **No schema change, no migration.** `connectorPoints` output is derived
  geometry; nothing is stored.
- **Renderer and print are untouched.** `AnnotationLayer` (print) and
  `PreviewAnnotations` (editor) already build their polyline from
  `connectorPoints` and draw one `<line>` per segment with markers on the first
  and last segment. A 2- to 6-point polyline "just works". Arrowheads stay
  correct because the first and last segments remain perpendicular to the edges.
- **Manual `waypoints` still win.** When a connector has `waypoints`, that branch
  runs first and the auto-router is bypassed (unchanged).

## Out of scope

- **True obstacle avoidance** — routing around the bodies of the connected boxes
  (or any other shape) in pathological overlap/reversal cases. P1 produces a
  clean orthogonal route from anchor geometry only; it may cross a box body in
  degenerate overlaps. P3's drag handles are the remedy.
- **Interactive segment handles and offset persistence** — that is P3.
- **Rounded corners** — that is P2.
- **Changes to `straight` routing, marker/arrowhead code, or the schema.**

## Routing taxonomy

Let `a`, `b` be the resolved normalized endpoints, and `dirA`, `dirB` their
outward edge normals (`anchorDir`, `null` for free / center / corner anchors).
`STUB` is a module constant (`0.04` normalized; tunable).

| Shape | Condition | Interior corners |
|---|---|---|
| **straight** | `routing !== "square"` | none → `[a, b]` |
| **fallback elbow** | `dirA` or `dirB` is `null` (free / center / corner) | existing `squareHorizontalFirst` single elbow |
| **L** (1) | both anchored, **axes differ** (one H, one V) | existing single elbow (already correct) |
| **Z** (2) | same axis, **opposite** dirs, facing **toward** | `[(midX, a.y), (midX, b.y)]`, `midX = (a.x + b.x) / 2` |
| **C** (2) | same axis, **same** dir (parallel magnets) | `[(extX, a.y), (extX, b.y)]`, `extX = dir>0 ? max(a.x,b.x)+STUB : min(a.x,b.x)−STUB` |
| **U** (4) | same axis, **opposite** dirs, facing **away** | `[(ax, a.y), (ax, midY), (bx, midY), (bx, b.y)]`, `ax = a.x + dirA.x·STUB`, `bx = b.x + dirB.x·STUB`, `midY = (a.y + b.y) / 2` |

Vertical-axis cases mirror the above with x and y swapped (Z/C extend along y,
U crosses at `midX`).

### Facing toward vs. away (horizontal axis example)

For `dirA.x === +1` (source exits right) and `dirB.x === −1` (target exits left):
- **toward** iff `b.x >= a.x` → **Z**. `midX` lies between the two, so the first
  segment exits the source rightward and the last enters the target leftward.
- **away** iff `b.x < a.x` → **U**. Both ends stub outward (source right, target
  left, away from each other) and the route crosses at `midY` to connect.

For `dirA.x === dirB.x` (both exit the same way, e.g. both `right`) → **C**: route
out to the far extreme `extX` beyond both ends, down, and back, forming a bracket
opening toward the shared exit direction.

The boundary cases are benign: when `b.x === a.x` in the Z case the route
degenerates to a straight vertical line through `midX`; zero-length stub/cross
segments render harmlessly (an SVG zero-length `<line>` draws nothing).

## Architecture

### `lib/annotations.ts` (the only logic change)

1. **`anchorDir(ep: Endpoint): Point | null`** — sign-aware sibling of the
   existing `anchorAxis`. Returns the outward unit normal for `left/right/top/
   bottom` edge anchors, `null` for free points and `center` / corner anchors.
   `anchorAxis` is retained for the L fallback.

2. **`squareRoute(a, b, from, to): Point[]`** — pure function returning the
   *interior* corners (0, 1, 2, or 4 points) per the taxonomy:
   - `dirA == null || dirB == null` → `squareHorizontalFirst(...)` single elbow
     (unchanged behaviour for unanchored / center / corner ends).
   - axes differ → single elbow (L).
   - same axis → Z / C / U by the direction tests above.

3. **`connectorPoints`** — the `square` branch becomes
   `return [a, ...squareRoute(a, b, c.from, c.to), b]`. The `waypoints` guard and
   the `routing !== "square"` guard are unchanged and still precede this.

`squareHorizontalFirst` and `anchorAxis` stay as-is (still used by the L /
fallback path and their existing tests).

### No other files change

- `components/renderer/AnnotationLayer.tsx` — unchanged (consumes
  `connectorPoints`; `pts.slice(0, -1)` already maps any-length polylines to
  segments with `markerStart` on `i === 0` and `markerEnd` on `i === last`).
- `components/editor/PreviewAnnotations.tsx` — unchanged (consumes
  `connectorPoints`; waypoint editing and endpoint drag are unaffected).
- `lib/book-schema.ts` — unchanged (no new fields).

## Data flow

```
Connector (from.anchor, to.anchor, routing:"square")
        │
        ▼  resolveEndpoint × 2  →  a, b (normalized)
connectorPoints
        │  waypoints?  → [a, …waypoints, b]            (unchanged)
        │  routing!=="square"? → [a, b]                (unchanged)
        ▼  squareRoute(a, b, from, to)
  anchorDir(from), anchorDir(to) → dirA, dirB
        ▼  taxonomy → interior corners
   [a, …corners, b]  ──►  AnnotationLayer (print)  &  PreviewAnnotations (editor)
                          identical polyline in both
```

## Error / edge handling

- **Unanchored or center/corner ends** → `anchorDir` returns `null` → existing
  single-elbow / dominant-axis behaviour. No regression.
- **Mixed (one anchored, one free)** → the anchored end drives the existing
  single elbow (already handled by `squareHorizontalFirst`).
- **Degenerate coincident axes** (`a.x === b.x` etc.) → zero-length segments,
  render harmlessly.
- **Overlapping / reversed boxes beyond the stub** → may cross a box body; out of
  scope (P3 handles), documented above.

## Testing (TDD — `lib/annotations.test.ts`)

Pure-geometry unit tests, one assertion set per shape, asserting the exact
returned point array from `connectorPoints`:

1. **L** — source `right`, target `top` (axes differ) → single elbow (regression:
   unchanged from current behaviour).
2. **Z (horizontal)** — source `right`, target `left`, target to the right →
   `[a, (midX,a.y), (midX,b.y), b]`.
3. **Z (vertical)** — source `bottom`, target `top`, target below →
   `[a, (a.x,midY), (b.x,midY), b]`.
4. **C (horizontal)** — both `right` → `[a, (extX,a.y), (extX,b.y), b]` with
   `extX = max(a.x,b.x)+STUB`.
5. **U (horizontal)** — source `right`, target `left`, target to the **left**
   (facing away) → `[a, (ax,a.y), (ax,midY), (bx,midY), (bx,b.y), b]`.
6. **Regression — waypoints override** → `[a, …waypoints, b]` regardless of
   anchors.
7. **Regression — free/free** → existing dominant-axis single elbow.
8. **Regression — one anchored + one free** → single elbow driven by the
   anchored end.

Success criteria: all eight pass; full suite green; `pnpm typecheck` and
`pnpm lint` clean.

## Docs

- **ADR-004** amended: replace the orthogonal-routing entry's "Deferred:
  two-corner (Z) route when both endpoints anchor to conflicting axes" note with
  the P1 router (L/Z/C/U via outward stubs), and note P2/P3 as planned follow-ups.
- **ROADMAP.md**: fold the standalone connector items (Z-route, and the routing
  portion) into the FigJam-elbow epic; mark P1 in progress / done as it lands.
