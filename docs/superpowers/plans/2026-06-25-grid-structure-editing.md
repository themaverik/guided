# Grid Structure Editing + Visible Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a grid-mode step actually operable — show the grid (cell guides + resting divider lines in the editor), and let the author add/remove rows and columns both from a left-panel Grid section and from on-canvas +/× affordances. Re-balancing keeps Σ heightFr = 1 per step and Σ widthFr = 1 per row.

**Architecture:** Four pure `step.grid` mutations (`addGridRow`, `removeGridRow`, `addGridColumn`, `removeGridColumn`) that renormalize fractions via the Plan-1 `normalizeFractions`, exposed as thin Zustand actions. Editor-only guides come from CSS scoped under `.preview-scaler` (the renderer/print path never carries them) plus a thin resting divider line in the existing `PreviewGridResize` overlay. A new `GridStructure` left-panel section (shown only in grid mode, replacing the legacy Rows list there) and on-canvas +/× buttons in `PreviewGridResize` both call the same store actions.

**Tech Stack:** TypeScript, vitest, React 19 (client editor), Zustand, plain CSS/SVG.

## Global Constraints

- **Editor-only:** guides + all add/remove affordances live in `components/editor/**` and CSS scoped to `.preview-scaler`. NOTHING in `components/renderer/**` or the print/PDF route changes — guides and buttons must never appear in `/print` or the exported PDF.
- **Normalized fractions:** after any add/remove, Σ`heightFr` over a step = 1 and Σ`widthFr` over a row = 1, via `normalizeFractions` (Plan 1). Adding a track gives it the average share and renormalizes (preserving the relative balance of existing tracks); removing renormalizes the remainder.
- **Minimums:** a step keeps **≥ 1 row**; a row keeps **≥ 1 cell**. Remove is a no-op (returns the input book) at the minimum.
- **Immutability:** mutations `clone` (structuredClone) and never touch the input; store actions are thin wrappers.
- **Reuses existing pieces:** `normalizeFractions` (grid-math), the `PreviewGridResize` overlay + its measured geometry, the `stepLayoutMode` gate.
- `Book` JSON is source of truth; HTML/PDF derived. Module alias `@/*` → repo root.
- Conventional Commits; **NO AI attribution / no Co-Authored-By trailer**.
- Before each commit: `pnpm test --run` (green) AND `pnpm typecheck` (exit 0); for component/CSS tasks also `pnpm build` (succeeds).

---

## File structure

- Modify `lib/book-mutations.ts` + `lib/book-mutations.test.ts` — 4 grid-structure mutations.
- Modify `lib/store.tsx` + `lib/store.test.ts` — 4 store actions.
- Modify `components/editor/editor.css` — grid guides (scoped) + resting divider style.
- Modify `components/editor/PreviewGridResize.tsx` — thin resting divider line + on-canvas +/× affordances.
- Create `components/editor/GridStructure.tsx` + modify `components/editor/StepEditor.tsx` — left-panel Grid section (grid mode only).

---

### Task 1: Grid-structure mutations

**Files:**
- Modify: `lib/book-mutations.ts`
- Modify: `lib/book-mutations.test.ts`

**Interfaces:**
- Consumes: `normalizeFractions` (`@/lib/grid-math`).
- Produces:
  - `addGridRow(book, ci, si): Book`
  - `removeGridRow(book, ci, si, ri): Book`
  - `addGridColumn(book, ci, si, ri): Book`
  - `removeGridColumn(book, ci, si, ri, cellIndex): Book`

- [ ] **Step 1: Write the failing tests**

Add to `lib/book-mutations.test.ts` (reuse the `gridBook()` factory if present from Plan 4's tests; otherwise define a 1-row/1-cell grid book inline):

```ts
import {
  addGridRow, removeGridRow, addGridColumn, removeGridColumn,
} from "@/lib/book-mutations";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

function oneByOne(): Book {
  return {
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
    }] }],
  };
}

describe("grid structure mutations", () => {
  it("addGridRow appends a row and renormalizes heights to sum 1", () => {
    const out = addGridRow(oneByOne(), 0, 0);
    const h = out.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h).toHaveLength(2);
    expect(h[0]).toBeCloseTo(0.5, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
    expect(out.chapters[0].steps[0].grid![1].cells).toHaveLength(1);
  });

  it("removeGridRow drops a row and renormalizes; keeps at least one", () => {
    const two = addGridRow(oneByOne(), 0, 0);
    const out = removeGridRow(two, 0, 0, 1);
    expect(out.chapters[0].steps[0].grid).toHaveLength(1);
    expect(out.chapters[0].steps[0].grid![0].heightFr).toBeCloseTo(1, 6);
    // removing the last remaining row is a no-op
    const same = removeGridRow(out, 0, 0, 0);
    expect(same.chapters[0].steps[0].grid).toHaveLength(1);
  });

  it("addGridColumn appends a cell to the row and renormalizes widths", () => {
    const out = addGridColumn(oneByOne(), 0, 0, 0);
    const w = out.chapters[0].steps[0].grid![0].cells.map((c) => c.widthFr);
    expect(w).toHaveLength(2);
    expect(w[0]).toBeCloseTo(0.5, 6);
    expect(w[0] + w[1]).toBeCloseTo(1, 6);
  });

  it("removeGridColumn drops a cell and renormalizes; keeps at least one", () => {
    const two = addGridColumn(oneByOne(), 0, 0, 0);
    const out = removeGridColumn(two, 0, 0, 0, 1);
    expect(out.chapters[0].steps[0].grid![0].cells).toHaveLength(1);
    expect(out.chapters[0].steps[0].grid![0].cells[0].widthFr).toBeCloseTo(1, 6);
    const same = removeGridColumn(out, 0, 0, 0, 0);
    expect(same.chapters[0].steps[0].grid![0].cells).toHaveLength(1);
  });

  it("does not mutate the input book", () => {
    const book = oneByOne();
    addGridRow(book, 0, 0);
    expect(book.chapters[0].steps[0].grid).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — the four functions are not exported.

- [ ] **Step 3: Implement the mutations**

In `lib/book-mutations.ts`, merge the import:

```ts
import { resizeAdjacent, bodyRegion, MIN_CELL_MM, normalizeFractions } from "./grid-math";
```

(`resizeAdjacent`/`bodyRegion`/`MIN_CELL_MM` are already imported from Plan 4 — just add `normalizeFractions` to that line.) Then add:

```ts
/** Append a row (one empty cell) and renormalize row heights to Σ = 1. */
export function addGridRow(book: Book, ci: number, si: number): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid) return book;
  const oldN = step.grid.length;
  const heights = normalizeFractions([...step.grid.map((r) => r.heightFr), 1 / oldN]);
  step.grid = [...step.grid, { heightFr: 0, cells: [{ widthFr: 1, objects: [] }] }]
    .map((r, i) => ({ ...r, heightFr: heights[i] }));
  return next;
}

/** Remove row `ri` and renormalize; keeps at least one row. */
export function removeGridRow(book: Book, ci: number, si: number, ri: number): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid || step.grid.length <= 1) return book;
  const kept = step.grid.filter((_, i) => i !== ri);
  const heights = normalizeFractions(kept.map((r) => r.heightFr));
  step.grid = kept.map((r, i) => ({ ...r, heightFr: heights[i] }));
  return next;
}

/** Append a cell to row `ri` and renormalize cell widths to Σ = 1. */
export function addGridColumn(book: Book, ci: number, si: number, ri: number): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row) return book;
  const oldN = row.cells.length;
  const widths = normalizeFractions([...row.cells.map((c) => c.widthFr), 1 / oldN]);
  row.cells = [...row.cells, { widthFr: 0, objects: [] }].map((c, i) => ({ ...c, widthFr: widths[i] }));
  return next;
}

/** Remove cell `cellIndex` from row `ri` and renormalize; keeps at least one cell. */
export function removeGridColumn(
  book: Book, ci: number, si: number, ri: number, cellIndex: number,
): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row || row.cells.length <= 1) return book;
  const kept = row.cells.filter((_, i) => i !== cellIndex);
  const widths = normalizeFractions(kept.map((c) => c.widthFr));
  row.cells = kept.map((c, i) => ({ ...c, widthFr: widths[i] }));
  return next;
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-mutations.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: grid add/remove row & column mutations (normalized fractions)"
```

---

### Task 2: Store actions for grid structure

**Files:**
- Modify: `lib/store.tsx`
- Modify: `lib/store.test.ts`

**Interfaces:**
- Produces on the store: `addGridRow(ci, si)`, `removeGridRow(ci, si, ri)`, `addGridColumn(ci, si, ri)`, `removeGridColumn(ci, si, ri, cellIndex)` — all `=> void`.

- [ ] **Step 1: Write the failing test**

Add to `lib/store.test.ts` (reuse existing imports + a grid-book factory):

```ts
describe("grid structure actions", () => {
  const oneByOne = (): Book => ({
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
    }] }],
  });

  it("addGridRow then addGridColumn update the store grid", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridRow(0, 0);
    expect(store.getState().book.chapters[0].steps[0].grid).toHaveLength(2);
    store.getState().addGridColumn(0, 0, 0);
    expect(store.getState().book.chapters[0].steps[0].grid![0].cells).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — `addGridRow` is not a function.

- [ ] **Step 3: Add the actions**

In `lib/store.tsx`, declare on the `EditorState` interface (near the `resizeGridRow`/`resizeGridColumn` declarations from Plan 4):

```ts
  addGridRow: (ci: number, si: number) => void;
  removeGridRow: (ci: number, si: number, ri: number) => void;
  addGridColumn: (ci: number, si: number, ri: number) => void;
  removeGridColumn: (ci: number, si: number, ri: number, cellIndex: number) => void;
```

and implement (near the resize actions):

```ts
    addGridRow: (ci, si) => set((s) => ({ book: M.addGridRow(s.book, ci, si) })),
    removeGridRow: (ci, si, ri) =>
      set((s) => ({ book: M.removeGridRow(s.book, ci, si, ri) })),
    addGridColumn: (ci, si, ri) =>
      set((s) => ({ book: M.addGridColumn(s.book, ci, si, ri) })),
    removeGridColumn: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.removeGridColumn(s.book, ci, si, ri, cellIndex) })),
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/store.test.ts
git commit -m "feat: store actions for grid add/remove row & column"
```

---

### Task 3: Visible grid guides (cell outlines + resting dividers)

**Files:**
- Modify: `components/editor/editor.css`
- Modify: `components/editor/PreviewGridResize.tsx`

Build-verified. Editor-only — guides come from CSS scoped under `.preview-scaler`, which the print route never renders.

- [ ] **Step 1: Cell-outline guides (CSS)**

Append to `components/editor/editor.css`:

```css
/* Editor-only grid guides: faint cell outlines, shown only in the preview
   (the print/PDF render has no .preview-scaler ancestor, so they never print). */
.preview-scaler .grid-cell {
  outline: 1px dashed var(--color-rule-strong);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Resting divider line (overlay)**

In `components/editor/PreviewGridResize.tsx`, the dividers are currently a single transparent hit-line that only shows on hover. Give each divider a visible thin guide line UNDER the wide transparent hit-line, so dividers are discoverable at rest. For each row divider and column divider, render TWO `<line>`s with the same coordinates: first a `className="grid-guide-line"` (thin, faint, `pointer-events: none`), then the existing `className="grid-divider grid-divider-row/col"` hit-line on top.

Concretely, replace the single row-divider `<line>` with:

```tsx
        return (
          <g key={`row-${i}`}>
            <line x1={0} y1={y} x2={box.w} y2={y} className="grid-guide-line" />
            <line
              x1={0} y1={y} x2={box.w} y2={y}
              className="grid-divider grid-divider-row"
              onPointerDown={startRow(i)}
            />
          </g>
        );
```

and the column-divider `<line>` with:

```tsx
          return (
            <g key={`col-${ri}-${j}`}>
              <line x1={x} y1={yTop} x2={x} y2={yTop + rows[ri].h} className="grid-guide-line" />
              <line
                x1={x} y1={yTop} x2={x} y2={yTop + rows[ri].h}
                className="grid-divider grid-divider-col"
                onPointerDown={startCol(ri, j)}
              />
            </g>
          );
```

Add to `editor.css`:

```css
.grid-guide-line {
  stroke: #3b82f6;
  stroke-opacity: 0.35;
  stroke-width: 1;
  pointer-events: none;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test --run`
Expected: all succeed/green. (The overlay is already mounted from Plan 4, so a grid-mode step now shows dashed cell outlines + faint blue divider lines; legacy steps and `/print` show neither.)

- [ ] **Step 4: Commit**

```bash
git add components/editor/editor.css components/editor/PreviewGridResize.tsx
git commit -m "feat: visible grid guides — cell outlines + resting divider lines (editor-only)"
```

---

### Task 4: Left-panel Grid structure section

**Files:**
- Create: `components/editor/GridStructure.tsx`
- Modify: `components/editor/StepEditor.tsx`

Build-verified. The section shows only for a grid-mode step and replaces the legacy Rows list there (which controls `images[]`, not the grid).

- [ ] **Step 1: Create the panel**

```tsx
// components/editor/GridStructure.tsx
"use client";

/* Left-panel grid editor: per-step row count + per-row column counts, with
 * +/- steppers. Calls the grid structure store actions. Shown only in grid mode. */
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

export default function GridStructure({ ci, si, grid }: { ci: number; si: number; grid: GridRow[] }) {
  const addRow = useEditor((s) => s.addGridRow);
  const removeRow = useEditor((s) => s.removeGridRow);
  const addCol = useEditor((s) => s.addGridColumn);
  const removeCol = useEditor((s) => s.removeGridColumn);

  return (
    <section className="editor-section">
      <h3 className="editor-subtitle">Grid</h3>

      <div className="grid-struct-row-head">
        <span>Rows: {grid.length}</span>
        <div className="mini-btns">
          <button
            className="mini-btn danger"
            onClick={() => removeRow(ci, si, grid.length - 1)}
            disabled={grid.length <= 1}
            aria-label="Remove last row"
          >
            −
          </button>
          <button className="mini-btn" onClick={() => addRow(ci, si)} aria-label="Add row">
            +
          </button>
        </div>
      </div>

      {grid.map((row, ri) => (
        <div className="grid-struct-cell-row" key={ri}>
          <span>Row {ri + 1} columns: {row.cells.length}</span>
          <div className="mini-btns">
            <button
              className="mini-btn danger"
              onClick={() => removeCol(ci, si, ri, row.cells.length - 1)}
              disabled={row.cells.length <= 1}
              aria-label={`Remove column from row ${ri + 1}`}
            >
              −
            </button>
            <button
              className="mini-btn"
              onClick={() => addCol(ci, si, ri)}
              aria-label={`Add column to row ${ri + 1}`}
            >
              +
            </button>
          </div>
        </div>
      ))}

      <p className="editor-help">Drag the dividers on the page to resize rows and columns.</p>
    </section>
  );
}
```

Add light layout CSS to `components/editor/editor.css`:

```css
.grid-struct-row-head,
.grid-struct-cell-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--color-ink-text);
  padding: 4px 0;
}
```

- [ ] **Step 2: Wire into `StepEditor` (grid mode only)**

In `components/editor/StepEditor.tsx`, import `stepLayoutMode` and `GridStructure`:

```ts
import { stepLayoutMode } from "@/lib/book-schema";
import GridStructure from "./GridStructure";
```

Compute the mode after `const step = ...`:

```ts
  const mode = stepLayoutMode(step);
```

Then render the structure section in grid mode INSTEAD of the legacy "Rows" block. Replace the existing legacy Rows block:

```tsx
      <h3 className="editor-subtitle">Rows</h3>
      <div className="rows-outline">
        {rows.map((row, ri) => (
          <RowCard … />
        ))}
      </div>
      <button className="add-btn" onClick={() => addRow(ci, si)}>
        + Add row
      </button>
```

with a conditional:

```tsx
      {mode === "grid" && step.grid ? (
        <GridStructure ci={ci} si={si} grid={step.grid} />
      ) : (
        <>
          <h3 className="editor-subtitle">Rows</h3>
          <div className="rows-outline">
            {rows.map((row, ri) => (
              <RowCard
                key={ri}
                ci={ci}
                si={si}
                ri={ri}
                row={row}
                isMulti={isMulti || rows.length > 1}
                rowCount={rows.length}
                selected={(selectedRow ?? 0) === ri}
              />
            ))}
          </div>
          <button className="add-btn" onClick={() => addRow(ci, si)}>
            + Add row
          </button>
        </>
      )}
```

(Keep the Layout toggle and the Annotations section exactly as they are. The legacy `rows`/`isMulti`/`selectedRow`/`addRow` bindings stay — they're still used by the legacy branch.)

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test --run`
Expected: all green. Manual (PR note): on a grid-mode step the left panel shows a Grid section with a Rows stepper and a per-row Columns stepper; +/- updates the live preview; switching to Legacy restores the old Rows list.

- [ ] **Step 4: Commit**

```bash
git add components/editor/GridStructure.tsx components/editor/StepEditor.tsx components/editor/editor.css
git commit -m "feat: left-panel grid structure section (rows/columns steppers)"
```

---

### Task 5: On-canvas add/remove affordances

**Files:**
- Modify: `components/editor/PreviewGridResize.tsx`
- Modify: `components/editor/editor.css`

Build-verified. Reuses the overlay's already-measured `geom` (box/rows/cells). Adds: a "+" at the grid's bottom edge (add row) and at each row's right edge (add column), and an "×" on each row and each cell (remove). All call the store actions; all are `pointer-events` interactive (the overlay root stays `pointer-events: none`).

- [ ] **Step 1: Pull the structure actions into the overlay**

In `components/editor/PreviewGridResize.tsx`, add to the existing `useEditor` selectors:

```ts
  const addRow = useEditor((s) => s.addGridRow);
  const removeRow = useEditor((s) => s.removeGridRow);
  const addCol = useEditor((s) => s.addGridColumn);
  const removeCol = useEditor((s) => s.removeGridColumn);
```

- [ ] **Step 2: Render the affordances**

Inside the returned `<svg>`, after the divider elements and before the `{readout ? … : null}`, add an affordance layer. Use small `<g>` button groups built from `geom`:

```tsx
      {/* Add-row (bottom edge) + add-column (each row's right edge). */}
      <CanvasBtn x={box.w / 2} y={box.h - 2} label="+" title="Add row" onTap={() => addRow(ci, si)} />
      {rows.map((r, ri) => (
        <CanvasBtn
          key={`addcol-${ri}`}
          x={box.w - 2}
          y={r.t - box.t + r.h / 2}
          label="+"
          title="Add column"
          onTap={() => addCol(ci, si, ri)}
        />
      ))}
      {/* Remove-row (left edge) + remove-cell (each cell top-right). */}
      {rows.length > 1
        ? rows.map((r, ri) => (
            <CanvasBtn
              key={`delrow-${ri}`}
              x={10}
              y={r.t - box.t + 10}
              label="×"
              title="Remove row"
              danger
              onTap={() => removeRow(ci, si, ri)}
            />
          ))
        : null}
      {cells.map((rowCells, ri) =>
        rowCells.length > 1
          ? rowCells.map((c, j) => (
              <CanvasBtn
                key={`delcell-${ri}-${j}`}
                x={c.l - box.l + c.w - 10}
                y={c.t - box.t + 10}
                label="×"
                title="Remove column"
                danger
                onTap={() => removeCol(ci, si, ri, j)}
              />
            ))
          : null,
      )}
```

Add the `CanvasBtn` helper at the bottom of the file (a circle + centered label; `onPointerDown` stops propagation so it never starts a divider drag):

```tsx
function CanvasBtn({
  x, y, label, title, danger, onTap,
}: {
  x: number; y: number; label: string; title: string; danger?: boolean; onTap: () => void;
}) {
  return (
    <g
      className={`grid-canvas-btn${danger ? " danger" : ""}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTap(); }}
    >
      <title>{title}</title>
      <circle cx={x} cy={y} r={9} />
      <text x={x} y={y + 3.5} textAnchor="middle">{label}</text>
    </g>
  );
}
```

- [ ] **Step 3: Style the buttons**

Append to `components/editor/editor.css`:

```css
.grid-canvas-btn { pointer-events: all; cursor: pointer; }
.grid-canvas-btn circle {
  fill: #fff;
  stroke: #3b82f6;
  stroke-width: 1.5;
}
.grid-canvas-btn text {
  fill: #3b82f6;
  font-size: 12px;
  font-family: var(--font-body, sans-serif);
  pointer-events: none;
  user-select: none;
}
.grid-canvas-btn.danger circle { stroke: #a11; }
.grid-canvas-btn.danger text { fill: #a11; }
.grid-canvas-btn:hover circle { fill: #eef4ff; }
```

- [ ] **Step 4: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test --run`
Expected: all green. Manual (PR note): a grid-mode step shows a "+" at the bottom (add row) and at each row's right edge (add column), and "×" buttons to remove rows/cells (hidden when only one remains); clicking updates the live grid; the buttons don't trigger a divider drag; nothing appears in `/print`.

- [ ] **Step 5: Commit**

```bash
git add components/editor/PreviewGridResize.tsx components/editor/editor.css
git commit -m "feat: on-canvas add/remove row & column affordances"
```

---

## Self-review (done)

- **Spec coverage:** add/remove mutations ✓ (T1), store actions ✓ (T2), visible guides ✓ (T3), left-panel controls ✓ (T4), on-canvas controls ✓ (T5) — "Both" surfaces + guides delivered.
- **Editor-only / print-clean:** guides scoped under `.preview-scaler`; all controls live in `components/editor/**`; the renderer/print path is untouched. Stated in T3/T4/T5.
- **Normalized fractions:** every add/remove runs `normalizeFractions`; Σ stays 1; minimum 1 row / 1 cell enforced (remove no-ops at the floor). Tested in T1.
- **No conflict:** the overlay root stays `pointer-events: none`; dividers, `CanvasBtn`s, and guide lines set their own pointer-events; `CanvasBtn` stops propagation so a click never starts a drag.
- **Placeholder scan:** none — all steps carry real code.
- **Type consistency:** the four mutation/action signatures agree across T1/T2 and the T4/T5 call sites; `GridRow`/`GridCell`, `normalizeFractions`, `stepLayoutMode` names match Plans 1/3/4.

## Carry-forward (not this plan)

- **Cell object stacks** (images + callouts as primary/secondary objects, in-cell drag, migrate legacy `callouts`), where `fitSteps`→`fitGrid` lands — next plan.
- **Drag-to-reorder** rows/cells; **set-count by typing** a number (this plan uses +/- steppers).
- **Grid-guides on/off toggle** + snapping — the annotation plan.
- **Undo/redo** for structure edits.
