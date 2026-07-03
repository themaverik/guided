# SP2 — Annotation selection popover (design)

**Date:** 2026-07-03
**Branch:** `feat/annotation-selection-popover` (base `a5d0adf`)
**Status:** Approved — proceeding to implementation plan.

## Context

The annotation inspector is **hybrid** (DESIGN.md §170-172, PRD.md Decision 9): a floating
tool/swatch palette over the canvas (SP1 + the swatch/width slice, shipped), a **compact
popover anchored to the selection**, and the full numeric properties in the left panel.
SP1 delivered the bottom-center `AnnotationPalette`; the swatch/width slice gave it the 8
OKLCH swatches + 4 width presets. **SP2 adds the missing middle piece:** a popover that
sits next to the selected shape for quick edits, so common changes don't require a trip to
the left panel. SP3 (later) trims the left-panel cards once the popover carries the primary
flow.

### Scope decisions (locked with the user)

- **Shape-aware contents.** Every shape: the 8 swatch chips + 4 width chips + a delete `×`.
  Connectors add a second row: `from`/`to` endpoint style, routing, and (square only)
  direction. Text/bracket-specific props (font, size, align, orientation/flip) stay in the
  left panel — deferred to SP3.
- **Complements, does not replace.** The bottom `AnnotationPalette` (tools + draw defaults)
  and the left panel both remain. All three write the same shape through the same immutable
  store path; concurrent editing is conflict-free.
- **Placement:** anchored **above** the selected shape's bounding box, centered; **flips
  below** when there's no room above; **clamped** horizontally to the preview viewport.
- **Hidden during an active drag/resize**, reappears when idle.
- **Compact `<select>` dropdowns** for the connector controls (matching the left panel's
  option sets), not custom icon/segmented controls.

### Why (almost) no new model

All fields already exist: `Surface.stroke/width/swatchId/color`, `Connector.stroke/width/
swatchId/routing`, `Endpoint.style/dir` (`lib/book-schema.ts`). So SP2 is **editor-only**:
no schema change, no migration, no renderer/print change, no new ADR (only an ADR-004
amendment note). The one addition is a **transient UI store flag** (`annotationDragging`),
never persisted.

## The component — `components/editor/AnnotationSelectionPopover.tsx`

An editor-only overlay mounted as a sibling of `AnnotationPalette` (a child of
`.editor-right`, **outside** `.preview-scaler`), gated on `selection.stepIndex != null &&
selectedAnnotation != null`. Rendering outside the scaler keeps it **unscaled** (constant
size / crisp text at any zoom), exactly like `AnnotationPalette`.

**Props:** `{ ci, si, scalerRef, containerRef, scrollRef, pageIndex, annotations,
selectedId, scale, fitKey }`.
- `scalerRef` → measure the `.page[pageIndex]` screen rect (same as `PreviewAnnotations`).
- `containerRef` → the `.editor-right` element, so screen coords convert to
  container-relative `top/left` for absolute positioning. (PreviewPane adds a `ref` to the
  existing `.editor-right` div and passes it.)
- `scrollRef` → subscribe to the preview scroll so the popover re-measures on scroll
  (it lives outside the scroll container, unlike the in-scaler overlays).

**Positioning:**
1. Compute the selected shape's **normalized bounding box**: surfaces from `x/y/w/h`;
   connectors from the min/max of `resolveEndpoint(annotations, from)`,
   `resolveEndpoint(annotations, to)`, and any `waypoints` (a close-enough anchor box; the
   rounded/elbow stubs' small overshoot doesn't matter for anchoring).
2. Convert to screen px via the measured page rect × `scale`, then to `.editor-right`-
   relative coords by subtracting `containerRef`'s rect.
3. Feed that box + the popover's measured size + the container viewport to the pure
   `popoverPlacement` helper.

Re-measure on: `scale`, `fitKey`, `selectedId`, `annotations` (shape moved/edited), and
scroll of `scrollRef` — mirroring `PreviewAnnotations`'s effect triggers plus scroll.

## Pure placement helper — `lib/annotation-popover.ts`

```ts
export interface Box { x: number; y: number; w: number; h: number } // container-relative px
export interface Size { w: number; h: number }                       // popover px
export interface Viewport { w: number; h: number }                   // container px
export interface Placement { top: number; left: number; side: "above" | "below" }

/** Anchor a popover to a box: above-centered by default, flip below when it would clip
 *  the top, clamp left within [GAP, viewport.w - size.w - GAP]. GAP is the edge/target
 *  margin in px. */
export function popoverPlacement(
  box: Box, size: Size, viewport: Viewport, gap?: number,
): Placement;
```

Unit-tested: default above + centered; flip to below when `box.y - size.h - gap < 0`; left
clamp on both edges; centering math.

## Contents (shape-aware)

Rendered as a small card (DESIGN.md popover: white, 1px `line`, radius 8-9px, soft shadow),
two rows at most:

- **Common row (all shapes):** the 8 swatch chips (reused `SWATCHES`), the 4 width chips
  (reused `WIDTH_PRESETS`), then a danger-toned `×` (DESIGN mini-toolbar) that calls the
  existing `requestDeleteAnnotation(ci, si, id)` → `ConfirmDialog` flow (no new delete
  path). Active states derive the same way as the palette: `swatchByStroke(shape.stroke)`
  and `shape.width`.
- **Connector row (kind === "connector"):** `from` style + `to` style `<select>`
  (`EndpointStyle` list), `routing` `<select>` (straight / rectangular=square), and — when
  `routing === "square"` — a `direction` `<select>` (auto / ← / → / ↑ / ↓ writing
  `to.dir`, matching the panel's control; applies to the `to` endpoint, the arrow end).

Applying a swatch uses a new pure `swatchPatch(swatch, kind)` helper in
`lib/annotation-palette.ts` returning `{ stroke, swatchId, color? }` (`color` set only for
`kind === "text"`) — shared, testable, and adoptable by the palette later. All edits go
through the store's `updateAnnotation`.

The popover reflects the **selected shape's** current props (unlike the palette, which
shows the draw defaults) — this is the point of an anchored inspector.

## Store — one transient flag (`lib/store.tsx`)

Add `annotationDragging: boolean` (default `false`) + `setAnnotationDragging(v)`.
`PreviewAnnotations` sets it `true` at drag/resize start and `false` at pointer-up (in its
existing `drag.current` start/end handlers). The popover returns `null` while it's `true`.
Transient/UI only — never serialized (like `activeTool`/`drawColor`).

## Shared option lists — `lib/annotation-options.ts`

Extract the endpoint-style, routing, and direction option lists currently inline in
`AnnotationEditor.tsx` into a small pure module (`ENDPOINT_STYLES`, `ROUTINGS`,
`DIRECTION_OPTIONS`), imported by both `AnnotationEditor` and the popover so the option sets
can't drift. `AnnotationEditor` is refactored to import them (behavior unchanged).

## Testing

- `lib/annotation-popover.test.ts`: `popoverPlacement` — above/centered default, flip-below,
  left-clamp both edges.
- `lib/annotation-palette.test.ts` (extend): `swatchPatch` — non-text → `{stroke, swatchId}`
  (no `color`); text → adds `color`.
- Manual (deferred to human, extension not connected): select each shape kind → popover
  appears above it; swatch/width apply; `×` opens the confirm modal; connector row edits
  endpoint/routing/direction; popover hides during drag and re-anchors after; nothing prints.

## Boundaries

Editor-only: no change to `components/renderer/**`, the print path, `book-schema.ts`,
`book-io.ts`, or persistence. `pnpm typecheck` / `lint` / full suite / `build` green.

## Out of scope (deferred)

SP3 left-panel trimming; text/bracket-specific popover controls; fill tint / Fill-No-fill /
export-opacity / callout unification / `@theme` (the OKLCH color-system slice); per-endpoint
`size`/`anchor`/free-point `x`/`y` editing (stays in the panel).

## Success criteria

- Selecting any annotation shows an unscaled popover anchored above it (flips below near the
  top edge, clamped horizontally), reflecting that shape's color + width.
- Picking a swatch/width updates the selected shape (text gets `color`); `×` routes through
  the confirm modal; connector edits endpoint style / routing / direction live.
- The popover hides during drag/resize and re-anchors when idle; it tracks the shape on
  scroll and zoom.
- Editor + print output otherwise unchanged; no schema change; suite green; new unit tests
  for `popoverPlacement` + `swatchPatch` pass.
