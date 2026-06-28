# Grid Overflow Auto-Shrink (fitGrid) — Design Spec (Plan 8)

- Status: Approved (brainstorm complete; feeds writing-plans)
- Date: 2026-06-27
- Branch: `feature/improvement-rev3` (BASE = Plan 7 HEAD `81c4720`)
- Relates to: ADR-006 (flexible grid / cell stacks — **amended by this plan**), PRD Decision 1 / Appendix A, Plan 6 spec (clip baseline), Plan 7 spec (cell authoring).
- No `Book` schema change. The ADR-006 amendment records a grid-model **behavior** decision (overflow mechanism), per the project rule.

## Context and Problem

Plan 6 gave grid cells a hard `overflow: hidden` clip baseline; Plan 7 let authors add callouts to cells. So a callout (or, later, text paragraph) taller than its cell is now **silently clipped** at the cell edge. This plan adds the print-safe backstop: when a cell's content can't fit, **shrink the content to fit** instead of clipping — so content is never lost.

This was deferred from the Plan 7 split because the mechanism is non-trivial: the PRD's "scale the whole page down" works for the legacy flow but **not for a proportional grid** — scaling the page shrinks a cell *and* its text together, leaving the intra-cell overflow ratio unchanged. The fix scales cell **content**, not the page box.

## Decisions

- **Strategy: auto-shrink.** When a cell's content exceeds the cell, scale the content down (never clip silently). Content is always fully rendered; print-safe by construction.
- **Granularity: grid-uniform.** All **callout-bearing** cells on a step shrink by the **same** factor — the worst overflowing cell's — so callout text stays a consistent size across the page (honors the PRD's cross-cell-uniformity intent). Cells that already fit get vertical slack.
- **Images are exempt.** An image fills its cell (`object-fit`), never overflows, and is never scaled by fitGrid (no gap introduced). Only cells containing a callout are scaled.
- **Callouts/text are fluid; shrink is last resort.** A callout card is **full cell width**, so its text **wraps and grows downward** (never spills sideways) — pure CSS flow. `fitGrid` measures that *already-wrapped* height; it shrinks **only when the reflowed content still exceeds the cell**. Order: reflow → fit-check → shrink.
- **Floor: `MIN_SCALE = 0.5`.** Content never shrinks below half scale; past that it clips and the step is reported to the existing non-blocking overflow warning.
- **No row/column resizing.** Grid geometry (track fractions) is author-controlled (Plan 4); fitGrid only scales cell **content**, never grows/shrinks a row or column track.

## ADR-006 Amendment (Plan Task 1, before code)

Record that grid overflow is handled by a **uniform cell-content transform-scale across callout-bearing cells** (the worst-ratio factor, floored at `MIN_SCALE`), applied **DOM-only** in `fitGrid` (run by `useAutoFit` in `BookCanvas`, so it executes in **both** the editor preview and `/print`), with the existing overflow warning when floored. Image-only cells are exempt. This **refines PRD Decision 1 / ADR-006 §8** — the page-scoped scale they specified does not fix intra-cell overflow in a proportional grid, and the previously-rejected "per-cell local shrink" is superseded by this *uniform-across-cells content* scale (which preserves cross-cell consistency, the reason page-scope was originally chosen).

## fitGrid Algorithm (`lib/use-auto-fit.ts`)

`fitGrid(container): string[]` (returns the labels of grid steps that still overflow after flooring). Invoked from `useAutoFit`'s pass alongside `fitSteps`; results merged into the same `onReport` array. A step has either a `.step-body` (legacy → `fitSteps`) or a `.grid-step` (grid → `fitGrid`), never both, so the two never collide.

For each `.page.step` containing a `.grid-step`:
1. **Reset:** clear `transform` on every `.grid-cell-content` whose cell contains a `.callout` (so measurement is at natural scale).
2. **Measure:** for each such callout cell, `ratio = content.scrollHeight / content.clientHeight`.
3. **Factor:** `worst = max(1, …ratios)`; `f = worst <= 1 ? 1 : max(MIN_SCALE, 1 / worst)` (the pure helper).
4. **Apply:** set `transform: scale(f)` (origin top-left, from CSS) on **every** callout cell's `.grid-cell-content` — uniform. (`f === 1` clears it.)
5. **Report:** if `f === MIN_SCALE` and `worst > 1 / MIN_SCALE` (still overflows at the floor), push the step's `data-screen-label`.

**Pure, unit-tested helper:** `gridFitScale(ratios: number[], minScale: number): number` — `[]`/all-≤1 → `1`; `[1.5]` → `≈0.667`; `[3]` with `minScale 0.5` → `0.5` (floored); takes the max ratio. New constant `MIN_GRID_SCALE = 0.5` exported from `use-auto-fit.ts`. The DOM measure/apply/reset stays manual + build-verified — consistent with `fitSteps`, which has no unit test.

## Renderer Change (`components/renderer/GridStep.tsx`, `renderer.css`)

Wrap each cell's objects in a `.grid-cell-content` div so fitGrid has a scalable content node:

```tsx
<div className="grid-cell" style={{ flexGrow: cell.widthFr }}>
  <div className="grid-cell-content">
    {cell.objects.map(/* image → ImageSlot, callout → Callout */)}
  </div>
</div>
```

CSS: move the flex-column + `gap: 4mm` from `.grid-cell` onto `.grid-cell-content`, add `transform-origin: top left`; `.grid-cell` stays a flex container with `overflow: hidden`:

```css
.grid-cell { flex: 1 1 0; min-width: 0; display: flex; overflow: hidden; }
.grid-cell-content {
  flex: 1 1 auto; min-width: 0; width: 100%;
  display: flex; flex-direction: column; gap: 4mm;
  transform-origin: top left;
}
```

**Pixel-identical re-check (manual):** a single-image cell must still fill the cell — the `img-slot` is `height: 100%` inside the now-full-size wrapper. Verified manually, as in Plan 6. The editor overlays (`PreviewGridSelect`/`PreviewGridResize`) measure the **`.grid-cell` box**, which is unchanged by the content transform, so selection/resize still align.

## Folded-in fix: stale cell selection on row/column removal

The Plan 7 follow-up: `removeGridColumn`/`removeGridRow` **store actions** must reconcile `selection.cellIndex`/`rowIndex` so a removal doesn't leave the selection pointing at a shifted or missing cell. Behavior:
- **`removeGridColumn(ci, si, ri, cellIndex)`** — if the selection is on `(ci, si)` with `rowIndex === ri` and `cellIndex != null`: if the **selected** column was removed → clear `cellIndex` (deselect); if the selected column is **after** the removed one → decrement `cellIndex`; otherwise unchanged.
- **`removeGridRow(ci, si, ri)`** — if the selection is on `(ci, si)` with `rowIndex != null`: if the **selected** row was removed → clear `cellIndex` (hides the CellEditor); if the selected row is **after** the removed one → decrement `rowIndex`; otherwise unchanged.

These live in the store actions (selection is store state); the pure `book-mutations` removers are unchanged. Tested in `store.test.ts`.

## Testing

- **Unit (vitest, `lib/**`):** `gridFitScale` (empty / all-fit / single overflow / floored / picks worst). `removeGridColumn`/`removeGridRow` store actions reconcile selection (removed-cell → cleared; shifted → decremented; unrelated → unchanged); immutability.
- **Manual / build (fitGrid DOM + renderer):** add tall callouts to a small grid cell → content shrinks uniformly across callout cells, image cells unaffected; shrink floors at 0.5 and the overflow warning appears; single-image grid cell still pixel-identical; resize dividers + cell-select still align; `/print` + PDF apply the same shrink (no clipping, no editor affordance).
- Suite grows ~74 → ~80.

## Deferred (explicitly not in Plan 8)

- On-canvas drag + absolute callout positioning (Plan 9).
- Rich-text `kind:"text"` block objects + markdown extension (Plan 10) — they will reflow + shrink through the same `.grid-cell-content` path.
- Auto-columnizing stacked callouts to use horizontal room (interpretation (b) — not wanted; callouts are full-width fluid).
- File-drop image; OKLCH color system.
