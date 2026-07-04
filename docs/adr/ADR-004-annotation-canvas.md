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

## Amendment (2026-06-28): angle-based axis snapping while dragging

Dragging a connector endpoint (or resizing a line) snaps the run to horizontal/
vertical. The snap originally used a fixed *normalized distance* (`AXIS = 0.04`)
between the dragged point and the reference, so the snap's *angular* width grew as
the run got shorter — a short connector snapped flat over a ~±20° band and could
not be held at a shallow angle ("jumpy / hard to control"). Replaced with a pure
`snapAxisVector` helper (`lib/annotations.ts`, `AXIS_SNAP_DEG = 6`) that snaps
based on **angle**, so the zone is the same width at any length; Shift still
hard-locks the dominant axis and signs are preserved (lines keep 360° freedom).
Shared by the connector-endpoint and line-resize paths in `PreviewAnnotations`.
Editor-interaction only — no schema or render change.

## Amendment (2026-06-30): orthogonal elbow routing (P1)

Resolves the *Deferred* note in the 2026-06-28 anchor-aware square-routing
amendment. `connectorPoints` now produces a full orthogonal route for `square`
connectors via the pure helper `squareRoute` (`lib/annotations.ts`). Each
edge-anchored end exits perpendicular to **and outward from** its edge; the shape
is chosen deterministically from the two anchors and the resolved endpoints:

- **L** — perpendicular axes (one horizontal magnet, one vertical): single elbow
  (unchanged from the 2026-06-28 fix).
- **Z** — opposite magnets facing toward each other: two corners at the midpoint
  of the shared axis.
- **C** — parallel magnets (same direction, e.g. right→right): route out past the
  far edge by `STUB` and back.
- **U** — opposite magnets facing away: stub both ends outward by `STUB` and cross
  at the midpoint of the perpendicular axis.

Direction comes only from the anchor name (`anchorDir`) — the connected surface's
bounds are never consulted, so true **obstacle avoidance is out of scope** (a
route may cross a box body in degenerate overlaps; the planned segment handles are
the remedy). `STUB = 0.04` (normalized, tunable). No schema change; the route
renders identically in `AnnotationLayer` (print) and `PreviewAnnotations` (editor)
because both consume `connectorPoints`. Tests: `lib/annotations.test.ts`.

This is **P1 of the FigJam-style elbow-connector epic**. Follow-ups (own specs):
**P2** rounded corners (single `<path>` + `stroke-linejoin="round"`, pure render);
**P3** interactive axis-constrained segment-midpoint handles + a relative-offset
storage model that survives object moves (schema change + its own amendment).

## Amendment (2026-06-30): rounded connector corners (P2)

`square` connector elbows now render with a visible rounded corner. Because
`AnnotationLayer` is `viewBox`-free and uses percentage coordinates (so it never
measures the DOM — required for the static print path), and SVG `<path d>` forbids
percentages, the rounded geometry is built by the pure helper
`buildRoundedConnector` (`lib/annotations.ts`) and rendered in a nested
`<svg viewBox="0 0 1 1" preserveAspectRatio="none">` with
`vector-effect="non-scaling-stroke"` — the same pattern the diamond surface uses.
Each interior corner becomes a quadratic bend of `CORNER_RADIUS = 0.02`
(normalized; clamped per corner to half the shorter adjoining segment).

Arrowhead markers use `markerUnits="userSpaceOnUse"` with px sizes, which a nested
`viewBox` would blow up and distort, so the **first and last straight segments are
drawn as outer percentage `<line>`s that carry the markers**, and only the rounded
*middle* lives in the nested path. The two meet collinearly at the corner
pull-back points, so the join is seamless and markers stay undistorted. Straight
(2-point) connectors emit no path and are unchanged. No schema change; editor and
print render identically through `ConnectorLine`. Corner arcs are slightly
elliptical under the page's non-square aspect (accepted; small radius). Verified
in the `elbow-demo` print render.

P2 of the FigJam-style elbow-connector epic. Remaining: **P3** interactive
axis-constrained segment-midpoint handles + relative-offset storage (schema change
+ its own amendment).

## Amendment (2026-06-30): interactive segment handles + relative-offset bends (P3)

`square` connectors gain manual segment adjustment (FigJam-style elbow handles),
the final phase of the elbow epic (after P1 routing, P2 rounding). Completes the
"segment handles are the remedy" note left by P1.

- **Schema (additive, no migration, no version bump):**
  `Connector.bends?: ConnectorBend[]`, each `{ seg, axis, offset }`. `offset` is a
  perpendicular displacement **from the recomputed auto-route**, not an absolute
  coordinate — so a bend rides along when a connected surface moves. A bend is
  dropped at render time if a reflow puts its `seg` out of range or changes that
  base segment's axis (graceful degradation on L↔Z↔C↔U class change). At most one
  bend per base segment (first wins).
- **Geometry (`lib/annotations.ts`, pure):** `routeWithBends(base, bends)` layers
  bends onto the `squareRoute` auto-route — interior runs displace perpendicular in
  place; a bend on an anchored run (touching `a`/`b`) inserts a `STUB`-length stub +
  perpendicular jog (L-bending) so the endpoint exit stays perpendicular (the P1
  invariant). It returns the rendered polyline plus `SegmentMeta` provenance
  (`{ baseSeg, bend, draggable }`). `connectorRoute` wires it; `connectorPoints`
  delegates (signature unchanged); `squareBaseRoute` exposes the unbent route for
  offset computation; `bendForDrag` converts a perpendicular drag into a bend (or
  null to snap-to-auto). The no-bend path returns the base route **unrounded**, so
  existing routes are byte-identical.
- **Render parity:** editor preview and the Playwright print path both consume
  `connectorPoints`; `AnnotationLayer.tsx` and the print path are **unchanged**, and
  P2 rounded corners apply to the bent polyline unchanged. `waypoints` (absolute) is
  retained for `straight` connectors; legacy square+waypoints (no bends) renders as
  before.
- **Editor (`PreviewAnnotations.tsx`):** a midpoint handle per draggable rendered
  segment; the drag is axis-constrained (horizontal run moves in Y, vertical in X)
  and writes `bends` immutably via `updateAnnotation`. Endpoint drag/snapping
  unchanged.
- Tests: `lib/annotations.test.ts` (interior displacement, L-bending insert,
  graceful drop, ride-with-reflow, provenance, `bendForDrag`, wiring/back-compat).
  Verified in the `elbow-demo` print render (bent L + Z routes stay orthogonal with
  rounded corners; unbent C + U unchanged).

This completes the FigJam-style elbow-connector epic (P1 routing + P2 rounding + P3
segment handles).

## Amendment (2026-07-01): object alignment snapping + smart guides

Moving or resizing a rectangular surface (box, diamond, text, bracket) now snaps
its edges/center to alignment lines from other surfaces, the grid cells and primary
image slots beneath, and the page (center + edges), with Figma-style guide lines.

- **Pure geometry (`lib/annotations.ts`):** `snapAlign(moving, targets, thrX, thrY,
  mode)` returns `{ dx, dy, guides }` — the per-axis nearest-line delta plus one
  `GuideLine { axis, at }` per snapped axis. Matching is **any-to-any** (any moving
  line may snap to any target line — edge-to-edge, edge-to-center, center-to-center),
  the exact Figma behavior. `move` snaps all six reference lines; `resize` snaps only
  the dragged right/bottom edge. X and Y resolve independently. The result type is
  `AlignSnapResult` (the name `SnapResult` was already taken by `snapPoint`). The
  helper is source-agnostic; the caller supplies the target rects.
- **Editor (`PreviewAnnotations.tsx`):** at drag-start it collects targets once via
  `collectSnapTargets` — data-model rectangular surfaces (excluding the dragged one)
  + DOM-measured `.grid-cell`/`.img-slot` rects (normalized to the page rect, the
  same measurement `PreviewGridResize` uses) + the page `{0,0,1,1}`. Threshold is
  screen-consistent (`SNAP_PX = 6` px ÷ on-screen size `W*scale`/`H*scale`). Guides
  render as transient red lines and clear on pointer-up. **Editor-only — nothing
  prints** (guides live in `PreviewAnnotations`, not `AnnotationLayer`; verified by
  grep — no snapping/guide refs in the renderer or print path). **No schema change.**
- **Connectors stay free:** endpoints are neither source nor target of alignment
  snapping; behavior is unchanged (anchor-snap-or-free).
- **Alt = universal bypass:** disables alignment for surfaces and the anchor/axis
  snap for connectors (fully-free placement on demand).

Verification: 8 unit tests for `snapAlign` (suite 168/168). Live-drag UX is an
in-browser check (the ephemeral demo project had expired at implementation time).
Out of scope (future): fixed-grid snapping, distribution/equal-spacing guides,
connector binding to cells/objects, object-spanning guide extent.

## Amendment (2026-07-01): connector endpoints snap to grid content

Connector endpoints now snap to **grid-content** anchors — cell borders, screenshots
(`.img-slot`), callouts, and text blocks — landing as a **free point**
(snap-and-stay, no binding). Drawn-Surface binding (`ref`+`anchor`) and the Alt
bypass are unchanged. (Resolves the "connector snapping doesn't work over a grid
step" report — a grid step with no drawn shapes previously offered no snap targets
and no snap dots.)

- **Pure helpers (`lib/annotations.ts`):** `rectAnchors(rect)` (the 9 box anchor
  points) and `nearestPoint(p, points, thr)` (closest within threshold, or null).
- **Editor (`PreviewAnnotations.tsx`):** when a connector is focused, a
  `useLayoutEffect` measures `.grid-cell`/`.img-slot`/`.callout`/`.grid-text` rects
  (normalized to the page rect) and flattens `rectAnchors` into `gridAnchors`; those
  points render as snap dots (same `.preview-anno-snap` style) so targets are
  visible. The endpoint drag snaps in precedence order: drawn-surface anchor (binds)
  → grid-content anchor (free point, via `nearestPoint`, `POINT_SNAP_PX = 8` px ÷
  on-screen size) → axis-snap fallback.
- **No schema change; editor-only.** A grid snap stores a plain free `{x, y}` that
  resolves identically in the PDF; the renderer/print path is untouched. Grid content
  isn't re-tracked (snap-and-stay). The connector is stored in `step.annotations`
  for both legacy and grid steps, so this works in both modes.

Out of scope (future): true binding/re-tracking of a connector to grid content;
binding to sub-parts of a callout.

## Amendment (2026-07-01): connector endpoint direction override (Phase 1)

A square connector's arrowhead orients along its final segment; for a free-point
connector that orientation came only from a dominant-axis heuristic, so the arrow
direction couldn't be controlled. New additive `Endpoint.dir?: "left" | "right" |
"up" | "down"` sets the way the connector runs at that end — for `to` the arrow
points that way; for `from` it leaves that way. Absent = auto.

- **Routing (`lib/annotations.ts`, pure):** `anchorAxis`/`anchorDir` honor `dir`
  even for free points (precedence explicit `dir` → anchor edge → heuristic);
  `anchorDir(ep, isTo)` is role-aware (`to`'s outward normal is −arrow).
  `squareRoute` sign-forces a single explicitly-directed end (clean elbow when the
  far end already sits on the arrow side, else a `STUB` so `left` vs `right` differ)
  — gated on an explicit `dir` (`from.dir`/`to.dir`, not `anchorDir`) so anchored /
  free-no-`dir` connectors route byte-identically (no regression). P3 bends still
  apply on top.
- **Editor + print parity:** `dir` flows through `connectorPoints`; the renderer
  (`AnnotationLayer.tsx`) is untouched. Square routing only; no schema-version
  bump / migration.
- **UI:** an auto/←/→/↑/↓ `<select>` in the connector inspector's From/To rows
  (shown only for square connectors).

Phase 2 (later): an on-canvas drag handle to set `dir` spatially. Known Phase-1
limitation: for a mixed case (explicit `dir` on one end, the other end anchored on
a different axis) the `dir` is not yet forced over the far anchor (sign follows
layout).

## Amendment (2026-07-01): connector direction drag handle (Phase 2)

Completes the endpoint-direction feature: an on-canvas direction knob to set
`Endpoint.dir` spatially (Phase 1 shipped the panel control).

- **Editor-only (`PreviewAnnotations.tsx`):** a focused `square` connector shows a
  draggable knob on a short stem (`KNOB_PX = 24`) at each endpoint, positioned along
  the endpoint's current run direction (derived from `connectorRoute`'s first/last
  segment, so it reflects `dir` or the auto route — the `to` knob sits on the arrow
  side, the `from` knob along the leave direction). A new `"dir"` drag part snaps the
  `(pointer − endpoint)` vector via the pure `compassDir(dx, dy)` helper
  (`lib/annotations.ts`) and writes `ep.dir` immutably — uniform "drag the way it
  runs here" (the routing's role-aware `anchorDir` handles the from/to sign).
  Clearing to auto stays on the panel.
- **Reuses Phase-1 `dir`; no schema change; no renderer/print change** (the knob is
  editor chrome, not in `AnnotationLayer`). Square-only.

The endpoint-direction override is now complete (panel + on-canvas).

## Amendment (2026-07-02): floating annotation palette — SP1 (palette + on-canvas creation)

First slice of the hybrid inspector (`DESIGN.md` §7 / `PRD.md` P0). Annotation
creation moves off the left panel onto a floating bottom-center tool palette over
the page canvas; shapes are drawn directly on the page.

- **Transient store state:** `activeTool` (`select | box | line | bracket | diamond |
  text | connector`) + `drawColor` — editor-only, never persisted (no schema change).
- **`AnnotationPalette.tsx`:** floating bar, fixed to the preview viewport; tool
  buttons + one plain-hex current-color control (chip + presets + picker). The full
  OKLCH swatch palette is the next slice; this control is its swap-in point.
- **On-canvas drawing (`useAnnotationDraw` + `PreviewAnnotations.tsx`):** press→drag→
  release creates a shape via the pure `boundsFromDrag` helper (`lib/annotations.ts`) —
  rubber-band for box/diamond/text/bracket, signed start→end for line/connector; a
  bare click drops a default-sized shape. One-shot tools (revert to Select + select
  the new shape); `Esc` cancels. In grid mode the overlay captures pointer events only
  while a tool is active, else it stays `pointer-events:none` for the grid overlays.
- **Editor-only:** renderer + `/print` untouched; the palette/preview/handles never
  render in export. The left-panel per-shape property cards remain (trimming them is a
  later slice); only the six add-buttons were removed.

## Amendment (2026-07-02): annotation delete key + confirm modal

Adds a keyboard delete for annotations behind a styled confirmation.

- **Keyboard (`useAnnotationDeleteKey`, mounted via `AnnotationDeleteController`
  inside the store provider):** Delete/Backspace requests removal of the selected
  annotation. A pure `shouldHandleDeleteKey(key, active, hasSelection)` guard
  (`lib/keyboard.ts`, unit-tested) skips `<input>`/`<textarea>`/`<select>`/
  `contenteditable`, so editing text is never hijacked.
- **One confirm path:** the key and the left-panel `×` both call
  `requestDeleteAnnotation` (transient store `pendingDelete`), opening a reusable
  presentational `ConfirmDialog` (Esc / overlay / Cancel dismiss; focus on Cancel;
  danger-toned Delete). Confirm → existing `removeAnnotation`.
- **Editor-only:** transient state, no schema change; renderer/`/print` untouched
  (the modal is editor chrome).

## Amendment (2026-07-03): swatch palette + stroke-width presets

Replaces the plain-hex color control in `AnnotationPalette` with the DESIGN.md §2.2
8-swatch paired-token set and adds four stroke-width presets.

- **`lib/annotation-palette.ts`:** defines `Swatch[]` (8 OKLCH tokens: Ink / Red /
  Orange / Amber / Green / Teal / Blue / Violet; fill + stroke pairs) and `WidthPreset[]`
  (Thin 1 / Medium 2 / Thick 4 / Heavy 6), `swatchByStroke` lookup, `DEFAULT_STROKE`
  (`#024450` Ink), and `DEFAULT_SWATCH_ID`. Pure `buildDrawnShape` helper extracted to
  `lib/annotation-draw.ts`.
- **Store:** transient `drawSwatch` / `drawWidth` (no persistence, no schema change);
  `swatchId` + `width` written to shapes on draw and applied to selection on pick.
  Default draw color changed to Ink (`#024450`).
- **`AnnotationPalette.tsx`:** 8-swatch chip row + 4-width chip row replace the
  freeform chip and arbitrary hex presets; picking either applies to the current
  selection and sets the next-draw default.
- **Scope (deferred):** paired fill tint, Fill/No-fill toggle, editor-tint-vs-export
  opacity split, callout unification, and `@theme` CSS token registration are deferred
  to the full OKLCH color system slice.
- **Editor-only:** no schema migration (`swatchId?`/`fill?` already existed in schema);
  renderer and `/print` route untouched.

## Amendment (2026-07-03): selection popover (SP2)

The hybrid inspector gains its middle piece — a compact `AnnotationSelectionPopover`
component (sibling of `AnnotationPalette` in `.editor-right`) that anchors above the
selected shape and flips below near the top edge, with horizontal clamping to keep it
in view.

- **Placement:** pure `popoverPlacement(box, size, viewport)` + `shapeBounds(annotation)`
  helpers in `lib/annotation-popover.ts` compute the anchor position from normalized
  annotation coordinates; unscaled overlay so the popover renders at 1:1 regardless of
  canvas zoom.
- **Common row (all shapes):** 8 OKLCH swatch chips + 4 stroke-width presets (reused from
  SP1.1 via `swatchPatch` helper) + a danger `×` button routed through the existing
  `requestDeleteAnnotation` → `ConfirmDialog` flow.
- **Connector row:** `from`/`to` endpoint style selectors, routing toggle
  (straight / rectangular), and — for `square` connectors only — a direction selector
  written to the `to` endpoint.
- **Shared option lists:** `ENDPOINT_STYLES`, `ROUTINGS`, and `DIRECTION_OPTIONS`
  extracted to `lib/annotation-options.ts`; consumed by both the popover and the
  left-panel `AnnotationEditor` (DRY).
- **Hide-during-drag:** transient `annotationDragging` / `setAnnotationDragging` store
  flag set by `PreviewAnnotations` on pointer-down/up; the popover reads this flag and
  hides while a drag or resize is in progress, re-appearing once released.
- **Editor-only:** no schema change, no migration; `components/renderer/**` and the
  `/print` route are untouched.

## Amendment (2026-07-03): endpoint marker-size consistency

Endpoint markers were rendered at inconsistent sizes across styles — the filled arrow
occupied the whole marker box while circle / diamond / point occupied 0.4–0.68 of it, so
the arrow looked ~2× the others at the same `EndpointSize`. Fix: retune the per-style
geometry in `AnnotationLayer.tsx`'s `endpointMarker` so every style (arrow / circle /
diamond / point / bar) renders at a shared ~0.7·s visual extent for a given size. Stroke-
width-relative marker scaling was deliberately left out of scope.

- **Scope:** renderer change only (`components/renderer/AnnotationLayer.tsx`,
  `endpointMarker`); editor preview and `/print` are identical (the same renderer runs in
  both). `MARKER_PX` size keywords and marker `refX` are unchanged.
- **No schema change:** `Endpoint.style` values are unchanged; no migration required.

## Amendment (2026-07-03): annotation inspector redistribution

Annotation editing is now consolidated onto exactly two floating surfaces plus the canvas,
replacing the left-sidebar `AnnotationEditor` entirely.

- **Context-aware bottom palette (`AnnotationContext.tsx`):** when a shape is selected the
  bottom `AnnotationPalette` grows a context row with per-shape detail controls — freeform
  color + width (all shapes); connector routing, waypoint stepper, and from/to endpoint
  (style / size / direction[square] / binding ref+anchor); text font/size/align/color;
  bracket orientation/flip. Implemented in `components/editor/AnnotationContext.tsx`,
  mounted inside the existing `AnnotationPalette`.
- **Minimal popover:** `AnnotationSelectionPopover` trimmed to color swatches, stroke-width
  chips, and delete `×` only. The connector detail row (routing/endpoints) moved to the
  bottom palette context row.
- **`AnnotationEditor` removed:** `components/editor/AnnotationEditor.tsx` deleted; the
  "Annotations" section in `StepEditor` removed; associated dead CSS pruned.
- **Option lists consolidated:** `SIZES`, `ANCHORS`, `FONTS`, `FONT_LABELS`, and `ALIGNS`
  joined the existing `ENDPOINT_STYLES`, `ROUTINGS`, and `DIRECTION_OPTIONS` in
  `lib/annotation-options.ts` (single source of truth for all annotation option sets).
- **Intentionally dropped:** numeric coordinate fields (x/y/w/h), endpoint free-point x/y,
  and the shape list — all are canvas-reachable via direct manipulation.
- **Canvas direct manipulation unchanged:** move/resize/endpoint drag in
  `PreviewAnnotations.tsx` is untouched.
- **Editor-only:** no schema change, no migration; `components/renderer/**` and the
  `/print` route are untouched. Branch `feat/annotation-inspector-redistribution`;
  suite 219/219.

## Amendment (2026-07-04): ellipse primitive + opt-in closed-shape fill

Adds the `ellipse` shape kind ("Circle" in the UI) and an opt-in interior fill tint
for closed shapes (`box` / `diamond` / `ellipse`). Both are additive — no
`schemaVersion` bump, no migration; existing books are unaffected.

- **New primitive `ellipse` (schema and renderer):** `"ellipse"` is added to the
  `Surface.kind` union in `lib/book-schema.ts`. It is a free ellipse inscribed in the
  shape's normalized `x/y/w/h` bounds — no new fields; `cx`/`cy`/`rx`/`ry` are derived
  at render time (`cx = x + w/2`, etc.). In the UI the tool label is "Circle"; in the
  ISO-32000 vocabulary this corresponds to `/Circle` (an ellipse in a Rect). The ellipse
  mirrors the diamond: edge-midpoint + center anchors only (`center`, `top`, `bottom`,
  `left`, `right`) — no corner anchors (corners are empty space on a curve). The renderer
  (`AnnotationLayer.tsx`) emits `<ellipse>` with percentage `cx/cy/rx/ry` (the
  `preserveAspectRatio="none"` overlay scales correctly at any aspect). Move, resize, and
  connector-snap all derive from the bounding rect and are inherited for free.
- **Opt-in closed-shape fill:** the existing `Surface.fill?: string` field is now set
  via a per-shape Fill checkbox in `AnnotationContext.tsx` (shown only for `box`,
  `diamond`, and `ellipse`). New shapes remain outline-only by default (no fill on
  draw). Toggling Fill on writes `fill = fillForStroke(shape.stroke)` — the swatch's
  paired light token (`Swatch.fill`, L≈0.96) when the stroke is one of the 8 OKLCH
  swatches, or an sRGB tint mixed ~85% toward white for custom strokes (`mixToWhite` in
  `lib/annotation-palette.ts`). Both helpers are pure and unit-tested. Fill re-pairs
  automatically when the stroke changes — via a `filled` flag added to `swatchPatch`, and
  via the custom-color `onChange` in `AnnotationContext`.
- **WYSIWYG rendering decision (amends `DESIGN.md §2.2`):** fill is painted at full
  opacity in both the editor canvas and the Playwright-generated PDF. There is no
  `@media print` opacity split, and no separate prop threading for export. The L≈0.96
  token already reads as a subtle tint at full opacity, making the split unnecessary.
  This intentionally supersedes `DESIGN.md §2.2`'s "~50% on canvas" wording. The
  project's "renderer print-accurate to preview" guardrail is upheld — fill is
  data-driven, so `AnnotationLayer` renders identically in both routes unchanged.
- **Additive:** no `schemaVersion` bump; no migration. `box` and `diamond` already had
  `fill?` in the schema but it was never set. Adding `ellipse` and wiring the Fill toggle
  is purely additive; the renderer's existing `fill={s.fill ?? "none"}` pattern on box
  and diamond is the model the ellipse case follows.

## Amendment (2026-07-04): text labels + text-box frame

Adds two coupled text capabilities to the annotation canvas: an opt-in border and
independent background for the standalone `text` box (Piece A), and a double-click
in-shape text label for any shape kind (Piece B). Both are additive — no
`schemaVersion` bump, no migration; existing books are unaffected.

### Three-role model (no new schema fields)

Every `Surface` already carries all required fields; this amendment formalizes their
widened roles:

- **Text:** `text`, `color`, `fontSize`, `fontFamily`, `align` — `color` is the text
  color (defaults to the value of `stroke` on existing shapes).
- **Border:** `stroke`, `width` — `width: 0` means no border (the text box default
  today).
- **Background:** `fill` — on a `text` box this is an independent background color,
  chosen freely and not paired with `stroke`. On other closed shapes it remains the
  stroke-paired tint introduced by the ellipse/fill amendment.

### Piece A: text-box frame (opt-in)

The `kind:"text"` renderer case gains inline border and background driven by the
existing fields: `background: s.fill` when `fill` is set; `border: ${s.width}px solid
${s.stroke}` when `width > 0`; padding added when either is present so text is not
flush. Both are off by default — existing text boxes are visually unchanged.

The editor (`AnnotationContext.tsx`, text branch) gains:

- A **Border** checkbox that toggles `width` between `0` and a default of `2`; the
  existing width input activates only while the checkbox is on.
- A **Fill** checkbox (background on/off) plus an independent fill color input bound
  directly to `fill`. Toggling on seeds `fill` to `#ffffff`; the color is then set
  freely, independent of `stroke`.

Result: three independent color controls for a text box — text color (`color`), border
color (`stroke`), background color (`fill`). Renders identically in the editor canvas
and the Playwright PDF export (WYSIWYG; no `@media print` split).

### Piece B: in-shape text labels

**`labelRect(s)` pure helper (`lib/annotations.ts`, unit-tested):** returns the
normalized rect the label occupies:

- **Closed shapes** (`box` / `diamond` / `ellipse`): the shape's own `{x, y, w, h}`
  bounds — the label fills the shape.
- **Open shapes** (`line` / `bracket`): a `LABEL_W × LABEL_H` (0.3 × 0.1 normalized)
  box centered on the shape's midpoint `(x + w/2, y + h/2)`, clamped to `[0, 1]`.
- **`text`**: returns the box's own bounds unchanged (no-op; text positions itself).

**Rendering (`AnnotationLayer.tsx`):** a shared `<foreignObject>` at `labelRect(s)` is
emitted when `s.text` is non-empty:

- Closed shape labels use a flex inner div (`align-items:center;
  justify-content:<align>`) so the text is centered vertically and horizontally over
  any fill.
- Open shape labels use an inline-block inner div with an opaque white background,
  padding, and rounded corners — a pill that masks the underlying stroke so the text
  never visually crosses the line or bracket spine. (A true stroke-gap is deferred.)

New CSS class `.anno-shape-label` (renderer.css) covers both variants; `.anno-text` is
unchanged except for the new inline border/fill styles.

**Editing (`PreviewAnnotations.tsx`):** double-clicking any surface hit region (not just
`kind:"text"`) calls `selectAnnotation` + `setEditingId`. The `TextEditor` positions at
`labelRect(s)` so the inline editor overlays the rendered label position. Clearing the
text field removes the label (an empty `text` renders nothing).

**Controls (`AnnotationContext.tsx`):** the text controls row (size / font / align /
text color) is shown whenever the selected shape has a non-null `text` field or is
`kind:"text"` — so text controls appear for a non-text shape as soon as a label is
added, alongside the shape's existing stroke/width/fill controls.

### Additive

No `schemaVersion` bump; no migration. All fields consumed (`text`, `color`,
`fontSize`, `fontFamily`, `align`, `stroke`, `width`, `fill`) were already present in
the `Surface` schema. The three-role interpretation is a rendering and editing
convention, not a structural change.

## Amendment (2026-07-04): connector text labels (shared TextLabel interface)

The text-label role (`text`, `fontSize`, `fontFamily`, `color`, `align`) is extracted
from `Surface` into a shared `TextLabel` interface so `Connector` can reuse it without
duplicating fields.

- **Schema (`lib/book-schema.ts`, additive, no version bump, no migration):**
  `export interface TextLabel` carries the five optional fields. `Surface extends
  TextLabel` — the fields move from inline to the inherited interface, behavior-identical
  for all existing Surface readers. `Connector extends TextLabel` is purely additive;
  existing connectors without these fields are unchanged.
- **Pure helpers (`lib/annotations.ts`):** `labelRectAt(cx, cy)` is extracted from
  `labelRect`'s open-shape branch (returns a `LABEL_W x LABEL_H` box centered on a
  point, clamped to `[0, 1]`). `connectorMidpoint(annotations, c)` computes the midpoint
  of a connector's resolved endpoints via the existing `resolveEndpoint`. Both are
  unit-tested (`lib/annotations.test.ts`).
- **Rendering (`AnnotationLayer.tsx`):** `ShapeLabel`'s body is extracted into a
  reusable `LabelBox` component (explicit props — not a `Surface`) so a connector can
  call it. `ShapeLabel` delegates to `LabelBox`. `ConnectorLine` renders a masked
  `LabelBox` at `labelRectAt(connectorMidpoint(...))` when the connector has non-empty
  text; `color` defaults to `c.color ?? c.stroke`. Masked label matches the open-shape
  pill style (opaque white background, masking the line). Renders identically in the
  editor canvas and the Playwright PDF export.
- **Editor-only controls:** connector label editing (text/font/size/align/color) wires
  into the existing text controls row in `AnnotationContext`; no new UI primitives.
