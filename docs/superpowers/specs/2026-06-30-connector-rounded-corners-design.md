# P2 — Connector rounded corners (design)

**Date:** 2026-06-30
**Branch:** `feat/connector-rounded-corners` (base `01644d7`)
**Status:** Approved — proceeding to implementation plan.

## Context — the FigJam-elbow epic

P2 of three. **P1** (orthogonal L/Z/C/U routing) shipped to `main` (`01644d7`).
P2 rounds the elbow corners. **P3** (interactive segment handles + relative-offset
storage) is later, its own spec.

## Goal

The `square` route currently renders as separate butt-capped `<line>` segments
meeting at a sharp 90° elbow (`AnnotationLayer.ConnectorLine`), which shows a
slight notch at thicker widths and looks unlike FigJam. Render each elbow with a
visible **rounded corner** — a tunable radius, clamped per corner — in both the
editor overlay and the print path. **No schema change** (data unchanged; the
radius is a global constant).

## Why this needs more than `stroke-linejoin`

`AnnotationLayer` is intentionally resolution-independent: each connector segment
is a `<line>` with **percentage** coordinates (`x1="17%"`) and the layer has **no
`viewBox`**, so it never measures the DOM (required for the static Playwright
print path). Two consequences:

1. A rounded corner needs a single multi-vertex `<path>`, and SVG `<path d>` only
   accepts **numeric** user-unit coordinates — percentages are illegal in `d`.
2. `stroke-linejoin="round"` alone rounds by only ≈ ½·strokeWidth (≈1px at width
   2) — it removes the notch but is not visibly "rounded". We want an explicit
   radius.

So the path must live in a numeric coordinate space. The file already does this
for the **diamond** surface: a nested `<svg viewBox="0 0 100 100"
preserveAspectRatio="none" overflow="visible">` containing a `<path>` with
`Q` curves and `vector-effect="non-scaling-stroke"` (keeps the stroke at px width
despite the viewBox scaling). P2 reuses that exact pattern (with `viewBox
"0 0 1 1"` so path units match the normalized model).

## Marker constraint (drives the split)

Connector arrowheads are SVG markers with `markerUnits="userSpaceOnUse"` and
**explicit px** dimensions (`MARKER_PX`). Inside a nested `viewBox 0 0 1 1`,
`userSpaceOnUse` would interpret those px numbers as *normalized* units → markers
render ~100× too large and aspect-distorted. **Markers must stay in the outer
percentage space.**

Resolution: **draw the first and last straight segments as outer `%`-based
`<line>`s carrying the markers (unchanged from today), and render only the rounded
*middle* as the nested-`<svg>` path.** The outer end-lines are trimmed to stop at
the corner pull-back points; the nested path runs pull-back → corner curve →
pull-back. They meet **collinearly at the same page coordinate** (a normalized
point `p` is `p×100 %` in the outer space and `p` in the `viewBox 0 0 1 1` space —
the same pixel), so the join is seamless and markers are undistorted.

## Scope decisions (locked during brainstorming)

- **Explicit corner radius**, not just `stroke-linejoin`. Global constant
  `CORNER_RADIUS = 0.02` (normalized; tunable). No schema field.
- **Per-corner clamp:** each corner's effective radius is
  `min(CORNER_RADIUS, ½·prevSegLen, ½·nextSegLen)` so short routes degrade
  gracefully (the curve never overshoots a segment).
- **Markers in the outer space** via trimmed end-segment `<line>`s; rounded middle
  in a nested `<svg viewBox="0 0 1 1">` path with `vector-effect="non-scaling-stroke"`.
- **Straight connectors and 2-point routes are unchanged** — no corners, so a
  single outer `<line>` (or two end-lines) carries both markers; no path emitted.
- **Editor + print identical** — both render via `AnnotationLayer.ConnectorLine`.
  `PreviewAnnotations`' transparent hit-polyline is untouched (invisible).
- **Corner shape may be slightly elliptical** under the page's non-square aspect
  (the nested `viewBox` stretches non-uniformly, same as the diamond). Accepted;
  the radius is small. Verified by eye in the print PDF.

## Out of scope

- Per-connector radius (schema field) — YAGNI; revisit if needed.
- Rounding the `straight` route (it has no corners).
- Any change to routing geometry (P1), markers, the schema, or other annotation
  kinds.
- P3 interaction.

## Architecture

### `lib/annotations.ts` — pure helper

```
buildRoundedConnector(points: Point[], radius: number): {
  d: string;                 // path for the rounded MIDDLE (viewBox 0..1 units),
                             // "" when there are no corners
  startSeg: [Point, Point];  // outer end-line carrying markerStart  [p0 → firstPullback]
  endSeg:   [Point, Point];  // outer end-line carrying markerEnd    [lastPullback → pLast]
}
```

Algorithm:
- `n < 3` (straight / 2-point): `{ d: "", startSeg: [p0, pLast], endSeg: [p0, pLast] }`
  — both end-lines coincide with the single segment; each carries one marker.
- otherwise, for each interior vertex `curr` (with `prev`, `next`):
  - `r = min(radius, dist(prev,curr)/2, dist(curr,next)/2)`
  - `pin  = curr + r·unit(prev − curr)` (point `r` before the corner)
  - `pout = curr + r·unit(next − curr)` (point `r` after the corner)
  - first vertex → `M pin`; else → `L pin`; then always `Q curr pout`
  - track `firstPullback = pin` of the first vertex, `lastPullback = pout` of the last
- returns `d` (the `M … Q … L … Q …` chain, ending at `lastPullback`),
  `startSeg = [p0, firstPullback]`, `endSeg = [lastPullback, pLast]`.

Coordinates in `d` are rounded to 4 decimals. Pure — no mutation; new point
objects. `CORNER_RADIUS` is an exported constant alongside it.

### `components/renderer/AnnotationLayer.tsx` — `ConnectorLine`

Replace the per-segment `<line>` map with:

```
const pts = connectorPoints(annotations, c);
const { d, startSeg, endSeg } = buildRoundedConnector(pts, CORNER_RADIUS);
return (
  <g fill="none">
    <defs>{startMarker}{endMarker}</defs>
    {d && (
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" overflow="visible"
           width="100%" height="100%">
        <path d={d} stroke={c.stroke} strokeWidth={c.width}
              vectorEffect="non-scaling-stroke" fill="none" />
      </svg>
    )}
    <line x1={pct(startSeg[0].x)} y1={pct(startSeg[0].y)}
          x2={pct(startSeg[1].x)} y2={pct(startSeg[1].y)}
          stroke={c.stroke} strokeWidth={c.width}
          markerStart={c.from.style !== "none" ? `url(#${startId})` : undefined} />
    <line x1={pct(endSeg[0].x)} y1={pct(endSeg[0].y)}
          x2={pct(endSeg[1].x)} y2={pct(endSeg[1].y)}
          stroke={c.stroke} strokeWidth={c.width}
          markerEnd={c.to.style !== "none" ? `url(#${endId})` : undefined} />
  </g>
);
```

The end-lines render straight in `%` (markers undistorted); the middle renders the
rounded corners in the nested unit space (non-scaling stroke). For a straight
connector `d` is empty and the two end-lines coincide with the single segment.

### No other files change

`PreviewAnnotations` (hit-polyline + handles), the schema, and all other surface
rendering are untouched.

## Testing

### Unit (`lib/annotations.test.ts`) — pure `buildRoundedConnector`

1. **Straight (2 points)** `[(0,0),(1,1)]` → `d === ""`, `startSeg === [(0,0),(1,1)]`,
   `endSeg === [(0,0),(1,1)]`.
2. **L (1 corner)** `[(0,0),(1,0),(1,1)]`, r=0.2 →
   `d === "M 0.8,0 Q 1,0 1,0.2"`, `startSeg === [(0,0),(0.8,0)]`,
   `endSeg === [(1,0.2),(1,1)]`.
3. **Z (2 corners)** `[(0,0),(0.5,0),(0.5,1),(1,1)]`, r=0.2 →
   `d === "M 0.3,0 Q 0.5,0 0.5,0.2 L 0.5,0.8 Q 0.5,1 0.7,1"`,
   `startSeg === [(0,0),(0.3,0)]`, `endSeg === [(0.7,1),(1,1)]`.
4. **Clamp on a short segment** `[(0,0),(0.1,0),(0.1,1)]`, r=0.2 → effective
   `r = min(0.2, 0.05, 0.5) = 0.05`: `d === "M 0.05,0 Q 0.1,0 0.1,0.05"`,
   `startSeg === [(0,0),(0.05,0)]`, `endSeg === [(0.1,0.05),(0.1,1)]`.

### Visual (the print path) — gate before the docs commit

Render `data/projects/elbow-demo` to PDF via `GET /api/projects/elbow-demo/pdf`
and confirm by eye: corners visibly rounded; arrowhead (the `U` target etc.)
correct size/orientation (not giant, not squished); no seam between the straight
end-lines and the rounded middle; stroke crisp.

## Docs

- **ADR-004** amended: new section recording the rounded-corner render
  (nested-`<svg>` path for the middle + outer marker-carrying end-lines, the
  marker-distortion reason for the split, `CORNER_RADIUS`, no schema change).
- **ROADMAP.md**: mark epic **P2 — rounded corners** done.
