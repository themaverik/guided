# Annotation alignment snapping + smart guides (design)

**Date:** 2026-07-01
**Branch:** `feat/annotation-alignment-snapping` (base `6cbdc09`)
**Status:** Approved — proceeding to implementation plan.

## Context

Today, only **connector endpoints** snap (to surface anchors, via `snapPoint`) and
**lines** axis-snap (`snapAxisVector`). Dragging or resizing a rectangular
**surface** (box, diamond, text, bracket) just clamps to the page (`clamp01` in
`PreviewAnnotations.apply`) — no alignment to other objects, no grid awareness, no
guides. This makes it hard to line annotations up with each other or with the
screenshots they annotate.

This feature adds **Figma-style object-alignment snapping with smart guides** for
surface move + resize, and broadens the alignment targets to include the grid
cells and the primary objects (screenshots) beneath the annotation layer.

## Locked decisions (from brainstorming)

1. **Model = object alignment + smart guides** (Figma-style), not grid snapping.
2. **Operations = move + resize** both snap.
3. **Targets = annotation surfaces + grid cell borders + primary objects + page**
   (center & edges). Cell/object targets are measured from the rendered DOM.
4. **Connectors stay free.** Connector endpoints are NOT part of alignment
   snapping: snap to an exact anchor when close, otherwise drop as a free point
   exactly where released (over any surface, any angle).
5. **Alt bypasses all snapping** — for a surface it disables alignment; for a
   connector endpoint it disables even the anchor/axis snap (fully-free placement).
6. **No schema change.** Snapping only adjusts the stored `x/y/w/h`. Editor-only —
   guides never render in print.

## Architecture

### Pure geometry (`lib/annotations.ts`)

Types:

```ts
/** An axis-aligned rectangle in normalized 0–1 page coordinates. */
export interface Rect { x: number; y: number; w: number; h: number }

/** A smart-guide line to draw while dragging. Full-page extent in v1. */
export interface GuideLine { axis: "x" | "y"; at: number }

export interface SnapResult { dx: number; dy: number; guides: GuideLine[] }
```

Helper:

```ts
export function snapAlign(
  moving: Rect,
  targets: Rect[],
  thrX: number,
  thrY: number,
  mode: "move" | "resize",
): SnapResult;
```

Algorithm (pure, per axis independently):

- **Source lines** of `moving`:
  - X (vertical lines): `move` → left `x`, centerX `x + w/2`, right `x + w`;
    `resize` → only the dragged right edge `x + w`.
  - Y (horizontal lines): `move` → top `y`, centerY `y + h/2`, bottom `y + h`;
    `resize` → only the dragged bottom edge `y + h`.
- **Target lines** of each `target` Rect: X at `left`, `centerX`, `right`; Y at
  `top`, `centerY`, `bottom`. (The **page** is passed as a target Rect
  `{0,0,1,1}`, so its edges/center fall out of the same code — no special case.)
- For each axis, over all (source line × target line) pairs within the axis
  threshold (`thrX`/`thrY`), pick the pair with the **smallest absolute
  distance**; `dx` (or `dy`) is `targetLine − sourceLine`; emit one
  `GuideLine { axis, at: targetLine }`. No pair within threshold → `dx`/`dy` = 0,
  no guide for that axis. X and Y resolve independently (you can be snapped in X
  to one target and Y to another).

Pure, no mutation, deterministic → unit-tested. This mirrors the P3 helper pattern
(pure geometry in `lib/annotations.ts`, thin editor wiring).

### Target collection (editor)

Alignment targets are gathered **once at drag-start** (they are static during a
drag) from two sources, all expressed in normalized page coordinates:

1. **Data-model surfaces:** every other rectangular surface (`box`, `diamond`,
   `text`, `bracket`) in `annotations`, excluding the dragged one. (`line` and
   `connector` are excluded — they are directional, not box-aligned.) `{x,y,w,h}`
   read straight from the model.
2. **Measured DOM rects** (normalized against the page rect the overlay already
   measures — the same `getBoundingClientRect` approach `PreviewGridResize` uses):
   - `.grid-cell` elements → **cell borders**.
   - `.img-slot` elements → **primary objects** (the screenshots; covers grid
     primaries and legacy row images).
3. **The page** as a target Rect `{0,0,1,1}`.

Normalizing a measured client rect `r` against the page rect
`{left, top, width, height}`: `x = (r.left − left)/width`, `y = (r.top − top)/height`,
`w = r.width/width`, `h = r.height/height`.

Callout/text content objects are not separately targeted in v1 — their containing
cell is already a target, which covers the common "align to that cell" need.

### Editor wiring (`PreviewAnnotations.tsx`)

- **Threshold is screen-consistent:** `thrX = SNAP_PX / W`, `thrY = SNAP_PX / H`
  (`W`/`H` = rendered page px; `SNAP_PX = 6`), so the snap feels the same (~6px) at
  any zoom, matching how the overlay already converts px↔normalized.
- On surface-move/resize pointer-down, measure the target rects once (store in the
  `drag` ref).
- In `apply`, for a surface `move`: after the free `{x,y}` is computed, call
  `snapAlign({x, y, w: a.w, h: a.h}, targets, thrX, thrY, "move")`; apply
  `x + dx`, `y + dy`; set active guides. For `resize` (box/bracket/diamond/text
  bottom-right handle): call `snapAlign({x: a.x, y: a.y, w: freeW, h: freeH}, …,
  "resize")`; apply `w + dx`, `h + dy`; set guides. (The existing `Math.max` floors
  on w/h still clamp the result.)
- **Active guides** live in editor state, updated each drag frame (rAF-throttled,
  as `apply` already is) and **cleared on pointer-up**. Rendered as thin ~1px
  accent `<line>`s spanning the page (`axis:"x"` → vertical at `at·W`; `axis:"y"`
  → horizontal at `at·H`), class `.preview-anno-guide`. Editor-only; not in
  `AnnotationLayer`, so nothing prints.
- **Alt bypass:** if `e.altKey`, skip `snapAlign` for surfaces (free move/resize,
  no guides). Read `altKey` in `onMove` alongside the existing `shiftKey`.

### Connectors (`PreviewAnnotations.tsx`)

Connector-endpoint drag is **unchanged** except that **Alt now also bypasses its
snap**: when `altKey` is held, skip the `snapPoint` anchor snap and the
`snapAxisVector` axis snap and place the raw free point `{x: p.x, y: p.y}`. Without
Alt, behavior is exactly as today (anchor-snap when close, else the soft
angle-based axis-snap, else free) — so you can always place a connector on any
surface, and Alt guarantees fully-free placement. Alignment snapping never applies
to connector endpoints.

### Line surfaces

`line` move/resize is unchanged (it keeps its `snapAxisVector` rotation snap and is
neither a source nor a target of alignment snapping) — lines are directional, so
box-edge alignment doesn't apply.

## Testing

### Unit (`lib/annotations.test.ts`) — pure `snapAlign`

1. **Edge-to-edge (move)** — a moving box whose left edge is within threshold of a
   target's left edge returns `dx` aligning them; guide `{axis:"x", at: targetLeft}`.
2. **Center-to-center (move)** — moving centerX within threshold of a target
   centerX snaps; guide at the shared center.
3. **Page center (move)** — with the page `{0,0,1,1}` as a target, a box near
   centerX 0.5 snaps to it.
4. **Resize snaps the dragged edge** — `mode:"resize"` only snaps the right/bottom
   edges (left/top fixed); a resize near a target right edge returns `dx` on `w`.
5. **Nearest wins** — with two in-range targets, the closer line is chosen.
6. **Beyond threshold** — no target within `thr` → `dx=dy=0`, `guides:[]`.
7. **Independent axes** — a case snapping X to one target and Y to another returns
   both deltas and both guides.
8. **Self excluded** — the caller excludes the dragged surface; verify the helper
   returns no snap when `targets` is empty.

### Visual (editor) — manual / Playwright

Drag a surface near (a) another surface, (b) a grid cell border, (c) a primary
image → confirm it snaps and the guide line appears; hold Alt → no snap. Resize a
box so its right edge nears a cell edge → snaps. Confirm `/print` shows no guides
and connector endpoints still place freely (incl. Alt).

## Out of scope

- **Grid snapping** (fixed-step grid) — a separate future backlog item.
- **Distribution / equal-spacing** guides.
- **Connector binding** to cells/primary objects — connectors stay free by
  decision; only anchor snapping to drawn surfaces (unchanged).
- **Object-spanning guide extent** (Figma draws guides only across the involved
  objects) — v1 draws full-page guides; spanning is a noted refinement.
- Snapping to detected UI elements inside a screenshot.
- Callout/text content objects as distinct targets (their cell covers them).

## Docs

- **ADR-004** amended: a short interaction record — alignment snapping for surface
  move/resize against surfaces + measured grid cells/primary objects + page, pure
  `snapAlign` helper + editor-collected targets, smart guides (editor-only, never
  printed), Alt as the universal bypass, connectors deliberately free. **No schema
  change.**
- **ROADMAP.md**: mark the "Annotation snapping — more options" backlog item done
  (alignment + guides shipped; fixed-grid snapping remains a separate item).
