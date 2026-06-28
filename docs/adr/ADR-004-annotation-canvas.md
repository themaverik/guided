# ADR-004: Annotation Canvas

- Status: Accepted (design of record; implementation in ROADMAP Phase 11 after a spike)
- Date: 2026-05-30
- Deciders: Lamtei
- Relates to: ADR-001 (config-driven model), ADR-002 (styling primitives).

## Context and Problem Statement

ROADMAP Phase 11 (Theme C, feature #4) adds freeform annotation over screenshots: arrows and
shapes with color/width and varied endpoints, plus snapping. The user further specified a
Figma-style interaction: **drag-and-drop connectors with different endpoint types that snap to
other canvas surfaces** — a box, a line, or a long square bracket (horizontal or vertical).

We must decide how annotations are stored and rendered so they (a) survive the auto-fit scaling
that resizes every image slot, (b) print crisply, (c) stay hand-editable like the rest of the
config, and (d) support connector-to-surface snapping with live re-anchoring.

## Decision

### Store a structured model, render SVG from it — never store raw SVG

Annotations live on the row, per image, as a typed model in `book.json`. The renderer generates
one `<svg>` overlay per image slot from that model. Storing raw SVG markup is rejected: it would
not track the slot through auto-fit scaling, would be opaque and a sanitization/XSS liability, and
would not be hand-editable.

### Coordinate system

All geometry is **normalized 0–1 relative to the image slot box**. The overlay SVG uses
`viewBox="0 0 1 1"` with `preserveAspectRatio="none"`, so annotations scale automatically with the
slot at any zoom or print size. Stroke widths use `vector-effect: non-scaling-stroke` so line
weight stays visually consistent rather than ballooning when scaled.

### Two kinds of element: surfaces and connectors

- **Surfaces** are annotation shapes that are *also snap targets*: `box` (rectangle), `line`,
  and `bracket` (a long square bracket, `orientation: 'horizontal' | 'vertical'`). Each surface
  exposes named **anchor points** (box: 4 corners + 4 edge midpoints + center; line: 2 ends +
  midpoint; bracket: 2 tips + center).
- **Connectors** are arrows/lines drawn between two endpoints, Figma-style. Each endpoint is
  either **free** (a fixed normalized `{x,y}`) or **bound** to a surface anchor
  (`{ ref: surfaceId, anchor }`). A bound endpoint re-tracks its surface when the surface moves —
  this is what makes snapping "live."

```ts
type Anchor =
  | "top" | "right" | "bottom" | "left"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  | "center" | "start" | "end" | "mid";

type EndpointStyle = "none" | "arrow" | "circle" | "point" | "bar";

interface Endpoint {
  // free endpoint OR bound to a surface anchor:
  x?: number; y?: number;            // normalized, when free
  ref?: string; anchor?: Anchor;     // when bound (snapped)
  style: EndpointStyle;              // Figma-style cap
}

interface Connector {
  id: string;
  kind: "connector";
  from: Endpoint;
  to: Endpoint;
  stroke: string;
  width: number;                     // px (non-scaling)
  curve?: "straight" | "elbow";      // routing
}

interface Surface {
  id: string;
  kind: "box" | "line" | "bracket";
  // bounding rect in normalized coords (line/bracket use it as their extent):
  x: number; y: number; w: number; h: number;
  orientation?: "horizontal" | "vertical"; // bracket/line
  stroke: string;
  width: number;
  fill?: string;                     // box only, optional
}

type Annotation = Surface | Connector;
// ImageRow.annotations?: Annotation[]   (per image)
```

### Snapping

Snapping is computed in the **editor** in normalized space while dragging a connector endpoint:
candidate anchors are every surface's anchor points (plus optional slot edges/center and a
configurable grid). On release, the endpoint is bound (`ref` + `anchor`) rather than stored as raw
coordinates, so it stays attached. A snap threshold (in normalized distance) with visual snap
hints is part of the spike. Snapping to *detected UI elements inside the screenshot* remains a
deferred stretch goal.

### Two render surfaces, one model

- **Editor overlay:** an interactive SVG with pointer handles — drag to move surfaces, drag
  endpoints to re-snap, select to edit color/width/endpoint. Bound endpoints resolve their `{x,y}`
  from the referenced surface's current geometry at render time.
- **Print overlay:** the same model rendered to a static, `pointer-events: none` SVG in the print
  route. Connectors resolve bound endpoints identically, so editor and PDF match exactly.

Endpoint styles map to SVG `marker-start` / `marker-end` definitions (arrowhead, circle/dot,
point, bar, none).

## Consequences

- Annotations are resolution-independent and auto-fit-proof, and print crisply.
- The config stays structured and hand-editable; no opaque SVG blobs, no new XSS surface.
- Live snapping requires resolving bound endpoints at render time (a small graph of
  connector → surface lookups per image) — cheap, but the editor must prevent dangling refs when a
  surface is deleted (cascade or convert the endpoint back to free).
- This is the largest new subsystem; it warrants a throwaway spike (hit-testing, drag math,
  snap UX) before committing the editor interactions.

## Open questions (resolve in the spike)

- Elbow/orthogonal connector routing vs. straight-only for v1.
- Snap threshold and grid granularity; whether to snap to slot edges by default.
- Multi-select / grouping of annotations; z-order within the overlay.
- Whether bracket labels (text alongside a bracket) are in scope or a later addition.

## References

- ROADMAP "v2 — Feature expansion", Phase 11.
- Feature request item #4.

## Amendment (2026-06-28): anchor-aware square routing

`square` (orthogonal) routing previously chose its single elbow purely from the
normalized run (`|Δx| ≥ |Δy|` → horizontal-first, else vertical-first). For a
connector bound to a surface that produced a route that left/entered the edge
along the *wrong* axis — e.g. a connector on a box's **right** anchor ran straight
down the box edge instead of exiting rightward. Fix (`connectorPoints` /
`squareHorizontalFirst` in `lib/annotations.ts`): an anchored endpoint now forces
the touching segment perpendicular to its edge — left/right → horizontal, top/bottom
→ vertical. The **source** anchor wins; failing that the **target** anchor sets the
last segment; failing both (free points, corner/center anchors) the dominant-axis
heuristic is unchanged. Pure-geometry change, so it renders identically in the
editor overlay and the print path. Tests: `lib/annotations.test.ts`. **Deferred:**
when both endpoints are anchored to *conflicting* axes (e.g. right→right) a single
elbow cannot satisfy both; a two-corner (Z) route is a later enhancement.
