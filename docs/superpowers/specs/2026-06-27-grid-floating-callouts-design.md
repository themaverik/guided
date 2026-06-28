# Plan 9 — On-Canvas Drag + Absolute Callout Positioning (Design)

> v-next redesign, Plan 9. BASE = `ebc9a5e` on `feature/improvement-rev3`.
> Extends the grid cell-stack model (ADR-006, Plans 6–8). Brainstormed and
> approved 2026-06-27.

## Goal

Let an author drag a callout off a grid cell's vertical flow stack so it
**floats at an absolute position within its cell** — over the screenshot, or in
the empty space beside a letterboxed image. The callout's *position* is document
data and renders identically in preview **and** print; only the drag/resize
*handles* are editor-only.

## Scope

- **Callouts only.** Images remain the cell-filling background (Plan 6 model);
  text objects are Plan 10. No image floating, no cross-cell drag, no flow
  reordering on canvas (that stays in the panel, Plan 7).
- Floating is **per-callout opt-in**: flowed by default, drag detaches.
- Out of scope: file-drop image import, annotation/grid-guide on-off toggle,
  OKLCH color (all sequenced after Plan 10).

## Decisions (locked with the user)

1. **Positioning model — per-callout opt-in.** A callout flows by default
   (unchanged). Dragging it on canvas detaches it to an absolute x/y, floating
   over the cell. Flowed and floating callouts coexist in one cell. A panel
   button docks it back to the flow.
2. **Sizing — move + width resize.** Author drags to position (x/y) and drags a
   side handle to set width (w). Height is content-driven (auto; wraps like
   callouts do today). Stored: x, y, w. Not stored as meaningful for floating
   callouts: h (height follows content).
3. **fitGrid interaction — exempt; clip on overflow.** Floating callouts render
   in a separate absolute overlay layer, outside the `fitGrid`-scaled flow
   wrapper, so they keep the exact size/position the author set (like
   annotations). If text exceeds the cell edge it clips. `fitGrid` keeps
   managing only the flow stack.
4. **Detach / dock — drag to detach, button to dock.** The first canvas drag of
   a flowed callout detaches it (captures current position + rendered width). A
   "Dock to flow" button in the left `CellEditor` re-flows it.

## Schema (ADR-006 amendment)

One optional field added to `StackedObject` in `lib/book-schema.ts`:

```ts
/** Callout only: true = floats at absolute x/y/w within the cell (out of the
 *  flow stack). Absent/false = flowed (x/y/w ignored). Height is content-driven. */
positioned?: boolean;
```

Semantics:

- `positioned !== true` → **flow**: object renders in the cell's flow stack
  exactly as today; x/y/w are ignored.
- `positioned === true` → **floating**: renders absolutely at cell-relative
  `x`, `y` (top-left, 0–1) with cell-relative width `w` (0–1). Height is auto
  (content-driven).

**Back-compat / migration:** every existing grid callout lacks the flag, so it
renders flowed and **pixel-identical**. No migration step. Stale x/y/w values on
migrated objects are never read while flowed, and are overwritten on first drag,
so they cannot cause a jump.

ADR-006 is amended to document the `positioned` flag and the floating overlay
layer as the absolute-positioning mechanism for cell callouts.

## Rendering — `components/renderer/GridStep.tsx` (preview + print)

Two pure partition helpers in `lib/grid-render.ts`:

```ts
/** Objects that render in the cell flow stack (everything not a floating callout). */
export function flowObjects(cell: GridCell): StackedObject[];
/** Callouts that float at absolute x/y/w (positioned === true && kind === "callout"). */
export function floatingCallouts(cell: GridCell): StackedObject[];
```

Each cell renders two sibling layers under `.grid-cell`:

- **Flow layer** `.grid-cell-content` (unchanged): `flowObjects(cell)`, the only
  layer `fitGrid` scales. Image via `ImageSlot`, docked callouts via `Callout`.
- **Floating layer** `.grid-cell-floats` (new): rendered only when
  `floatingCallouts(cell)` is non-empty. Absolutely positioned (`inset: 0`),
  a sibling of `.grid-cell-content`, z-ordered above flow. Each floating callout
  wraps `<Callout>` in an absolutely-positioned box at
  `left: x*100%; top: y*100%; width: w*100%`.

`.grid-cell { overflow: hidden }` (already present) clips any floating callout
that exceeds the cell edge. The floating layer is non-interactive in the
renderer (display only); all interaction is in the editor overlay, which does
not exist in the print DOM.

### CSS — `components/renderer/renderer.css`

`.grid-cell` gains `position: relative` so the absolute floating layer anchors to
the cell (it currently has no `position`; `overflow:hidden` is already there).

```css
.grid-cell {
  position: relative; /* anchor for .grid-cell-floats (added) */
  /* existing: flex 1 1 0; min-width:0; display:flex; overflow:hidden; */
}
.grid-cell-floats {
  position: absolute;
  inset: 0;
  pointer-events: none; /* renderer layer is display-only */
}
.grid-cell-float {
  position: absolute;
  /* left/top/width set inline from x/y/w; height auto from content */
}
```

Note: `position: relative` does not affect the existing flex layout of
`.grid-cell-content` (still the only in-flow child), so flowed/legacy grid cells
stay pixel-identical.

## Editor interaction — new `components/editor/PreviewCellFloat.tsx` (editor-only)

Mirrors the proven `PreviewAnnotations` pattern: pointer-capture on the overlay,
rAF-throttled updates, normalized 0–1 coordinates, writes through the store.
Mounted in `PreviewPane` for grid-mode steps only (alongside the other grid
overlays). Never touches the renderer/print path.

Behavior:

- **Measure:** like `PreviewGridSelect`, measure each cell's callout boxes
  (cell-relative, unscaled) so both flowed and floating callouts are drag
  targets.
- **Drag to detach / move:** pointer-down on a callout starts a candidate drag;
  a ~3px screen-space threshold separates a click (select) from a drag. On a
  flowed callout's first drag, the move calls the mutation with
  `positioned: true`, x/y from the pointer (clamped to [0,1]), and **w captured
  from the callout's current rendered width** (so it doesn't jump). A floating
  callout's drag just patches x/y (clamped to [0,1]).
- **Width resize:** the selected floating callout shows one side handle; dragging
  it patches `w` (clamped, e.g. [0.1, 1]). Height stays auto.
- **Select:** a click (no drag) selects the callout (`Selection.objectId`) so the
  panel can edit/highlight it and the resize handle appears.

## Dock back & panel — `components/editor/CellEditor.tsx`

- Each floating callout in the panel list gets a **"Dock to flow"** button →
  mutation clears `positioned` (re-flows into the stack).
- Text/type/title of a floating callout are edited in the **left panel**
  (reuses Plan 7's callout editor) — there is no inline on-canvas text editor.
- Selecting a floating callout on canvas highlights/scrolls to its panel editor.

## fitGrid scope fix — `lib/use-auto-fit.ts`

Plan 8's `fitGrid` filters cells "containing a `.callout`". Floating callouts are
still `.callout` elements inside `.grid-cell`, so the filter must be scoped to
**`.grid-cell-content .callout`** — otherwise a cell whose only callout is floated
would be wrongly treated as overflow-prone and shrunk. This is the one `fitGrid`
change; the floating layer is otherwise untouched by it (separate from the scaled
`.grid-cell-content`).

## Mutations & store

`lib/book-mutations.ts`:

```ts
/** Patch a cell callout's placement (float/move/resize/dock). Immutable;
 *  kind-guarded to callouts; bad index returns the same book ref. */
export function updateCellObjectPlacement(
  book: Book, ci: number, si: number, ri: number, cellIndex: number,
  objectId: string,
  patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>,
): Book;
```

- Float = patch `{ positioned: true, x, y, w }`.
- Move = patch `{ x, y }`. Resize = patch `{ w }`. Dock = patch `{ positioned: false }`.
- Guards: object must exist and be `kind === "callout"`; otherwise return the
  same `book` reference (no clone).

`lib/store.tsx`:

- `Selection.objectId?: string | null` (optional; existing selection literals
  unaffected).
- `selectCellObject(ci, si, ri, cellIndex, objectId)` — selects the object;
  clears `selectedAnnotation`.
- Action wrapper(s) over `updateCellObjectPlacement`.

## Coordinate conventions

- x, y: cell-relative top-left of the callout box, normalized 0–1, clamped [0,1].
- w: cell-relative width, normalized 0–1, clamped to a sane range (e.g. [0.1, 1]).
- Height: never stored for floating callouts; content-driven (auto).
- The cell is the coordinate space (consistent with `PreviewGridSelect` /
  `PreviewGridResize` cell measurement).

## Testing

- `lib/book-mutations.test.ts`: `updateCellObjectPlacement` — float sets
  positioned + x/y/w; move patches x/y; resize patches w; dock clears positioned;
  clamping; kind-guard (non-callout returns same ref); bad index returns same
  ref; immutability (input book unchanged).
- `lib/grid-render.test.ts`: `flowObjects` / `floatingCallouts` partition —
  flowed-only cell, floating-only cell, mixed cell, empty cell; a positioned
  image (if ever set) is NOT treated as a floating callout (kind guard).
- `fitGrid` filter scope: verified by the scoped selector and build; the
  drag/resize overlay is build- + manually verified (no DOM test harness, per
  project convention).

## File map

| File | Change |
| --- | --- |
| `lib/book-schema.ts` | add `StackedObject.positioned?` + doc |
| `lib/grid-render.ts` | add `flowObjects` / `floatingCallouts` helpers |
| `lib/book-mutations.ts` | add `updateCellObjectPlacement` |
| `lib/store.tsx` | `Selection.objectId?`, `selectCellObject`, action wrapper(s) |
| `components/renderer/GridStep.tsx` | render flow + floating layers |
| `components/renderer/renderer.css` | `.grid-cell-floats` / `.grid-cell-float` |
| `lib/use-auto-fit.ts` | scope `fitGrid` callout filter to `.grid-cell-content .callout` |
| `components/editor/PreviewCellFloat.tsx` | **new** editor-only drag/resize overlay |
| `components/editor/PreviewPane.tsx` | mount overlay (grid mode only) |
| `components/editor/CellEditor.tsx` | "Dock to flow" button + select integration |
| `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` | amend |

Roughly 5–6 SDD tasks.

## Non-goals / explicit exclusions

- No image floating; images stay cell-filling background.
- No inline on-canvas text editing; callout text is edited in the left panel.
- No cross-cell drag; no flow reordering on canvas.
- No new height field for floating callouts; height is content-driven.
- No change to the legacy (non-grid) render path.
