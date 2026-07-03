# Annotation inspector redistribution (design)

**Date:** 2026-07-03
**Branch:** `feat/annotation-inspector-redistribution` (base `28ab4ea`)
**Status:** Draft — awaiting user review of this spec (and depends on the SP2 popover, now
being reworked here).

## Context

After SP1/SP1.1 (bottom palette: tools + swatches + widths) and SP2 (selection popover:
color/width/delete + a connector row), annotation editing is spread across three surfaces
including the **left sidebar** `AnnotationEditor` (per-shape property cards). The user's
decision after testing: **annotations should live in exactly two floating surfaces, never
the left sidebar** — a *context-aware, comprehensive* bottom palette and a *minimal*
popover — with the **canvas** doing direct manipulation. This supersedes the earlier SP3
"trim the panel" draft (`docs/.../2026-07-03-annotation-panel-cleanup-design.md`).

## The model (locked with the user)

- **Bottom `AnnotationPalette` — context-aware & comprehensive.** Always shows tools +
  swatch/width draw-defaults. When a shape is selected it grows a **context section**
  carrying that shape's detail controls.
- **Popover — minimal.** Color swatches + width presets + delete `×`, for any selected
  shape. **The SP2 connector row is removed** (relocated to the bottom palette).
- **Canvas — direct manipulation.** Move / resize / endpoint placement + snap-binding /
  segment + waypoint drag — unchanged (`PreviewAnnotations`).
- **Left sidebar — document structure only.** The `AnnotationEditor` component and its
  "Annotations (N)" section are **removed** from `StepEditor`.

### What moves where (from the current `AnnotationEditor`)

| Control | Destination |
|---|---|
| stroke color (freeform) | **bottom-panel context section** (keeps freeform, per earlier decision) |
| width (freeform 1–12) | **bottom-panel context section** (keeps freeform) |
| connector routing | bottom-panel context (connector) |
| endpoint style (from/to) | bottom-panel context (connector) |
| endpoint size (from/to) | bottom-panel context (connector) — the user's new control |
| endpoint direction (to) | bottom-panel context (connector) |
| endpoint binding: ref + anchor (from/to) | bottom-panel context (connector) |
| waypoint add/remove stepper | bottom-panel context (connector) |
| text font / size / align | bottom-panel context (text) |
| text color (freeform) | bottom-panel context (text) |
| bracket orientation / flip | bottom-panel context (bracket) |
| delete `×` | popover (kept) + Delete key |
| **coords x/y/w/h (numeric)** | **dropped** — canvas move/resize covers it |
| **endpoint free-point x/y (numeric)** | **dropped** — canvas endpoint drag covers it |
| **the shape list (click-to-select)** | **dropped** — canvas click selects (revisit a cycler later) |

No `Book`/schema change — every relocated control writes the same fields via the same
`updateAnnotation`. Editor-only; renderer/print untouched (Feature A handles marker sizing
separately).

## Component design

The bottom palette's context controls are *the same controls* `AnnotationEditor` renders
today (minus the dropped numeric ones). To avoid a rewrite, **extract them into a shared,
self-contained component** and mount it in the palette:

- **New `components/editor/AnnotationContext.tsx`** — given `{ ci, si, shape }` (the
  selected `Annotation`), renders the per-kind detail controls:
  - **all shapes:** freeform stroke-color input + freeform width input.
  - **connector:** routing (`ROUTINGS`), waypoint stepper, and a `from`/`to` **endpoint
    editor** each with style (`ENDPOINT_STYLES`) + size (`SIZES`) + direction
    (`DIRECTION_OPTIONS`, square-only) + binding (ref → surfaces, anchor `ANCHORS`). This
    is a lift of `AnnotationEditor`'s `EndpointFields` + connector block, **minus** the
    free-point x/y `Num` inputs.
  - **text:** font family / size / align (`FONTS`/`ALIGNS`) + freeform text color.
  - **bracket:** orientation + flip.
  - **box / diamond / line:** nothing beyond the shared color + width.
  - The `SIZES`/`ANCHORS`/`FONTS`/`ALIGNS` lists move into `lib/annotation-options.ts`
    (joining `ENDPOINT_STYLES`/`ROUTINGS`/`DIRECTION_OPTIONS`) so the module is the single
    source for every annotation option set.
- **`AnnotationPalette.tsx`** renders `<AnnotationContext>` in a **second row** (context
  row) below the tool/swatch/width row, only when `selected != null`. The palette already
  resolves `selected`; pass it down. The panel grows upward from bottom-center; the context
  row wraps (flex-wrap) so a connector's fuller control set stays readable.
- **`AnnotationSelectionPopover.tsx`** — delete the connector row block (the `c ? (...)`
  section) and its now-unused imports (`ENDPOINT_STYLES`/`ROUTINGS`/`DIRECTION_OPTIONS`,
  `Connector`/`Endpoint`/`EndpointStyle` types, `setEndpoint`). Popover keeps swatches +
  widths + `×` only.
- **`StepEditor.tsx`** — remove the "Annotations (N)" `<h3>` + `<AnnotationEditor>` mount.
- **`AnnotationEditor.tsx`** — **deleted** (its logic now lives in `AnnotationContext`).

## Layout & CSS

- The palette container becomes a vertical stack: row 1 = tools · divider · swatches ·
  divider · widths (unchanged); row 2 = the context section (shown only with a selection).
- New `.anno-context` / `.anno-context-row` rules; reuse the existing control styles
  (`.anno-endpoint`, `.anno-num`, `.ctrl-row`, `.stepper`, selects) moved/kept in
  `editor.css`. Keep the palette centered; cap width and wrap so a wide connector context
  doesn't overflow the viewport.
- The context row must not block canvas interaction when empty (no selection → not
  rendered).

## Testing

- The relocated option lists (`SIZES`/`ANCHORS`/`FONTS`/`ALIGNS`) get value/label assertions
  in `lib/annotation-options.test.ts` (matching the existing `ENDPOINT_STYLES` etc. tests).
- No other new unit tests (UI relocation). Verify `pnpm typecheck` (0 — catches dropped
  imports / removed `AnnotationEditor` references), `pnpm lint` (clean, no unused), full
  suite green, `pnpm build` OK.
- Manual (user): select each shape kind → the bottom panel shows its full controls (freeform
  color+width always; connector style/size/routing/direction/binding/waypoints; text
  font/size/align/color; bracket orient/flip); the popover shows only color/width/delete;
  the left sidebar has no annotation section; position/size still edit by dragging on
  canvas; `/print` unchanged.

## Decomposition (the plan will detail)

1. Move `SIZES`/`ANCHORS`/`FONTS`/`ALIGNS` into `lib/annotation-options.ts` (+ tests).
2. `AnnotationContext.tsx` — the per-kind detail controls (lift from `AnnotationEditor`,
   minus numeric coords / free-point).
3. Wire `<AnnotationContext>` into `AnnotationPalette` (context row) + CSS.
4. Trim the popover (remove connector row + unused imports).
5. Remove the `AnnotationEditor` mount from `StepEditor`; delete `AnnotationEditor.tsx`.
6. Docs (ROADMAP, ADR-004 amendment).

## Risks / dependencies

- **Depends on the SP2 popover being sound** (you've smoke-tested it) — this reworks it.
- **Capability check:** confirm every non-dropped `AnnotationEditor` control has a home in
  `AnnotationContext`, so nothing an author relies on disappears silently. The dropped items
  (numeric coords, free-point xy, shape list) are all canvas-reachable or deliberately cut.
- **Layout risk:** a connector's context set is large; the wrapping bottom panel must stay
  usable and not cover the canvas. Flagged for the manual pass; ratios/placement tunable.

## Out of scope

Feature A (marker sizing); the OKLCH color-system remainder (fill tint / callout unification
/ `@theme`); a shape-selector/cycler for overlapping shapes (revisit if needed); grid/
snapping backlog.

## Success criteria

- No annotation editing UI remains in the left sidebar; `AnnotationEditor.tsx` is deleted.
- The bottom palette shows a complete, context-appropriate control set for the selected
  shape (freeform color + width always; the full connector/text/bracket details); the
  popover is color + width + delete only.
- Every relocated control writes the same data as before; nothing lost except the
  deliberately-dropped numeric coords / free-point / list. No schema change; renderer/print
  unchanged; typecheck/lint/suite/build green.
