# Floating annotation palette — SP1: palette + on-canvas creation (design)

**Date:** 2026-07-02
**Branch:** `feat/floating-annotation-palette` (base `fed6f3d`)
**Status:** Approved — proceeding to implementation plan.

## Context

Today all annotation authoring lives in the left-panel `AnnotationEditor.tsx`: six
`+ Shape` buttons create shapes at a fixed default position, and collapsible
per-shape cards hold every property. The on-canvas `PreviewAnnotations.tsx` overlay
handles select / drag / resize / snap but has **no draw-on-canvas creation**, and
the store has no notion of an active tool.

`DESIGN.md` §7 and `PRD.md` P0 ("Editor model — hybrid inspector") call for a
different model: a **floating tool + swatch palette over the page canvas**, shapes
**drawn directly on the page**, a **compact selection popover** for quick edits, and
the **full numeric properties remaining in the left panel**.

That whole vision is too large for one spec. It decomposes into three sub-projects,
each its own spec → plan → build:

- **SP1 (this spec)** — floating tool palette + on-canvas shape creation.
- **SP2** — selection popover (quick color/width/endpoint edits on the shape).
- **SP3** — left-panel cleanup (trim `AnnotationEditor` to a lean shape list once
  creation and quick-edit have moved off it).

The **OKLCH paired-token swatch palette** (PRD color system, Phase D) is a separate
track; SP1 ships a single plain-hex "current color" control as the swap-in point for
it. Per the sign-off, the full OKLCH palette is the **immediate next item after SP1**.

This is editor-only: **no `Book` schema change, no renderer/print change, no
migration.** Active-tool and draw-color are transient editor state.

## Decisions of record (from brainstorm sign-off)

1. **First slice = SP1** (palette + on-canvas creation).
2. **Create gesture = drag-to-size** (FigJam): press-drag on the page defines the
   shape; release creates it.
3. **Placement = bottom-center** floating bar over the canvas (classic FigJam;
   thumb-friendly on tablet).
4. **Color = tools + one current-color control** using today's plain-hex model; the
   full OKLCH swatch palette is deferred to the next item.
5. **One-shot tools:** after drawing, revert to Select and select the new shape.
6. **Remove the left-panel `+ Shape` add-buttons** (creation moves to the canvas).
7. **Keep the per-shape property cards** in the left panel for now, until the
   on-canvas flow is proven (trimming them is SP3).

## State (Zustand store)

Two transient fields join the existing transient editor state
(`selectedAnnotation`, `hideGridChrome`, `overflows`) in `lib/store.tsx` — **not**
persisted to the `Book`:

- `activeTool: AnnotationTool` where
  `AnnotationTool = "select" | "box" | "line" | "bracket" | "diamond" | "text" | "connector"`.
  Default `"select"`.
- `drawColor: string` — hex stroke applied to newly-drawn shapes and to the selected
  shape when the chip changes. Default = the existing `ANNO_STROKE`.

Actions: `setActiveTool(tool)`, `setDrawColor(color)`. Selecting a different
step/row/cell resets `activeTool` to `"select"` (mirrors how selection changes clear
`selectedAnnotation`).

## The palette — `components/editor/AnnotationPalette.tsx` (new)

A floating bar mounted in `PreviewPane`, fixed to the **bottom-center of the preview
viewport** (`.preview-scroll`), so it does **not** scale or scroll with the page.

Contents, left→right:

- **Tool buttons:** Select · Box · Line · Bracket · Diamond · Text · Connector. Each
  sets `activeTool`; the active one is highlighted. Icons are inline SVG.
- A divider, then the **current-color control:** a color chip showing `drawColor`, a
  small row of ~5 quick presets, and a native `<input type="color">` picker. Setting
  it writes `drawColor`; if a shape is selected, it also recolors that shape's
  `stroke` (via `updateAnnotation`).

Behavior:

- **One-shot tools:** after a shape is created the palette resets `activeTool` to
  `"select"`; the new shape becomes the `selectedAnnotation`. (Tool-lock to draw many
  is out of scope — a later add.)
- `Esc` cancels an in-progress draw and returns to Select.
- Touch targets ≥ 40px (DESIGN §8/§9); active-tool state announced via `aria-pressed`.
- The palette is shown only when an **annotatable step page** is selected (the same
  pages that mount `PreviewAnnotations`); hidden on cover/back pages.
- A **crosshair** cursor appears over the canvas while a shape tool is active.

## On-canvas drawing — `useAnnotationDraw` hook + `PreviewAnnotations.tsx`

Drawing is a new pointer branch in the selected step's `PreviewAnnotations` overlay,
extracted into a `useAnnotationDraw` hook so the 746-line component stays cohesive.
It reuses the overlay's existing screen→normalized coordinate mapping and snapping.

- **When `activeTool !== "select"`**, a pointer-down on the page canvas starts a draw:
  - **Rubber-band shapes** (Box, Diamond, Text, Bracket): the drag rect (press→move)
    becomes the shape bounds; a live preview renders during the drag.
  - **Two-point shapes** (Line, Connector): press = start endpoint, release = end
    endpoint (free points; connector `to` defaults to an arrow, matching
    `newConnector()`).
- On pointer-up, a pure helper `boundsFromDrag(start, end, kind)` normalizes the drag
  into shape fields; the shape is created via `newSurface(kind)` / `newConnector()`
  then patched with the drawn geometry and `drawColor`, and committed with
  `addAnnotation(ci, si, …)`. Then `activeTool → "select"` and the new shape is
  selected.
- **Min-size floor + click-without-drag:** a drag below a small pixel floor (or a bare
  click) drops the shape at a sensible **default size** anchored at the pointer —
  graceful, never an error.
- **Snapping** (existing surface/grid/page alignment) applies during the draw, same
  helpers the drag path already uses.
- **Grid-mode pointer events:** while a shape tool is active, the annotation SVG
  captures pointer events across the whole page — temporarily overriding the
  empty-area `pointer-events:none` that normally lets clicks fall through to the grid
  overlays. It reverts to fall-through when `activeTool === "select"`. (This is the
  one interaction subtlety; it keeps drawing usable on grid-layout steps.)

## Left panel — `components/editor/AnnotationEditor.tsx`

- **Remove** the six `+ Shape` add-buttons (lines ~215–234) and update the hint text
  to point at the new palette ("Pick a tool below and draw on the page…").
- **Keep** the per-shape property cards and the shape list unchanged (SP3 trims them).

## Architecture summary

- **`lib/annotations.ts`:** add pure `boundsFromDrag(start, end, kind)` (and any small
  helper for the default-size/min-floor logic). Unit-tested.
- **`lib/store.tsx`:** `activeTool` + `drawColor` state, `setActiveTool` /
  `setDrawColor`; reset tool on selection change.
- **`components/editor/AnnotationPalette.tsx`** (new): the floating bar.
- **`components/editor/PreviewPane.tsx`:** mount `<AnnotationPalette>` over the
  preview viewport; pass the crosshair cursor state to the scaler.
- **`components/editor/PreviewAnnotations.tsx`** + **`useAnnotationDraw`**: the draw
  branch; grid-mode pointer-events toggle keyed on `activeTool`.
- **`components/editor/AnnotationEditor.tsx`:** drop the add-buttons; keep cards.
- **`components/editor/editor.css`:** `.annotation-palette` bar + tool/color styles;
  crosshair cursor rule.

All new geometry is pure; the renderer and `/print` path are not touched.

## Testing

- **Unit (`lib/annotations.test.ts`):** `boundsFromDrag` — a normal drag yields the
  correct normalized `{x,y,w,h}` regardless of drag direction (dragging up-left vs
  down-right); a sub-floor drag / bare click yields the default-sized shape at the
  pointer; two-point kinds map start/end to `from`/`to`. The full suite stays green.
- **Visual (in-browser):** pick each tool, draw on both a legacy step and a grid step;
  confirm one-shot revert-to-Select + auto-select; the color chip colors the next
  shape and recolors the selected one; `Esc` cancels; the bar stays put while
  scrolling/scaling; `/print` shows shapes but no palette/handles.

## Out of scope (SP1)

- The selection popover (SP2) and left-panel card trimming (SP3).
- The full OKLCH paired-token swatch palette (next item).
- Tool-lock (draw many without reverting), keyboard tool shortcuts beyond `Esc`.
- Any `Book` schema change, renderer change, or print change.
- New shape kinds (Circle, free-vertex Polygon) — those belong to the annotation
  standardization track.

## Docs

- **ADR-004** amended: on-canvas annotation creation via a floating tool palette;
  transient `activeTool`/`drawColor` store state; `boundsFromDrag` pure helper;
  editor-only (no print, no schema change); grid-mode pointer-events toggle.
- **ROADMAP.md:** mark the floating-palette backlog item in progress (SP1); note the
  SP2/SP3 decomposition and that the full OKLCH swatch palette is the next item.
