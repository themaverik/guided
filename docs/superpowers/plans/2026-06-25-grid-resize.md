# On-Canvas Grid Divider Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author drag row dividers (vertical resize) and column dividers (horizontal resize) directly on a grid-mode step in the live preview — neighbours absorb the change (conserved-total, proportional, floored), with a live mm readout — writing the new fractions to the `Book`.

**Architecture:** A new editor-only overlay `PreviewGridResize` (sibling of `PreviewAnnotations`, mounted in `PreviewPane` only for a selected **grid-mode** step) measures the rendered `.grid-step`/`.grid-row`/`.grid-cell` boxes and draws draggable divider handles. Dragging converts the pointer delta into an `fr` delta and calls a store action that applies the Plan-1 `grid-math.resizeAdjacent` (conserved-total, min-floor derived from a mm floor via `bodyRegion`). Live, rAF-throttled writes — exactly the `PreviewAnnotations` pattern. The renderer (`GridStep`/`A4Book`) and print/export are untouched, so editor handles never appear in output.

**Tech Stack:** TypeScript, vitest, React 19 (client overlay), Zustand, plain CSS/SVG.

## Global Constraints

- **Editor-only:** all resize affordances live in `components/editor/PreviewGridResize.tsx` + `PreviewPane.tsx`. NOTHING in `components/renderer/**` (the print path) changes. Handles must never appear in `/print` or the PDF.
- **Conserved-total:** resizing uses `grid-math.resizeAdjacent(sizes, dividerIndex, delta, minSize)` — Σ of the affected pair is conserved; all other tracks untouched; both sides floored at `minSize`. Do not write a new redistribution algorithm.
- **mm floor:** the min track size is `MIN_CELL_MM` (a mm constant) converted to an `fr` floor via `bodyRegion(pageConfig)` (height for rows, width for columns). Geometry stays in mm; fractions stay unit-fractions.
- **Read existing book mutations:** new grid mutations follow the `structuredClone`-based clone-then-mutate pattern in `lib/book-mutations.ts` (`const clone = (v) => structuredClone(v)`); return a new `Book`, never mutate the input.
- **Live + throttled:** pointer drags write to the store via the action on each move, throttled to one `requestAnimationFrame` (mirror `PreviewAnnotations`). Pointer-capture on the interactive element.
- **No pointer conflict with annotations:** for a grid-mode step both `PreviewAnnotations` and `PreviewGridResize` overlay the same page. The resize SVG must be `pointer-events: none` except on its divider hit-areas/handles, and be mounted AFTER `PreviewAnnotations` so the handles sit on top without stealing annotation interactions.
- `Book` JSON is source of truth; HTML/PDF derived. Immutability throughout.
- Module alias `@/*` → repo root. Conventional Commits; **NO AI attribution / no Co-Authored-By trailer**.
- Before each commit: `pnpm test --run` (green) AND `pnpm typecheck` (exit 0); for component/CSS tasks also `pnpm build` (succeeds).

---

## File structure

- Modify `lib/grid-math.ts` — export `MIN_CELL_MM`.
- Modify `lib/book-mutations.ts` + `lib/book-mutations.test.ts` — `resizeGridRow` / `resizeGridColumn`.
- Modify `lib/store.tsx` + `lib/store.test.ts` — `resizeGridRow` / `resizeGridColumn` actions.
- Create `components/editor/PreviewGridResize.tsx` — the divider-handle overlay.
- Modify `components/editor/editor.css` — divider/handle/readout styles.
- Modify `components/editor/PreviewPane.tsx` — mount the overlay for grid-mode steps.

---

### Task 1: `resizeGridRow` / `resizeGridColumn` mutations

**Files:**
- Modify: `lib/grid-math.ts`
- Modify: `lib/book-mutations.ts`
- Modify: `lib/book-mutations.test.ts`

**Interfaces:**
- Consumes: `resizeAdjacent`, `bodyRegion`, `MIN_CELL_MM` (`@/lib/grid-math`); `DEFAULT_PAGE_CONFIG` (`@/lib/book-schema`).
- Produces:
  - `resizeGridRow(book: Book, ci: number, si: number, dividerIndex: number, deltaFr: number): Book`
  - `resizeGridColumn(book: Book, ci: number, si: number, ri: number, dividerIndex: number, deltaFr: number): Book`

- [ ] **Step 1: Export the mm floor constant**

In `lib/grid-math.ts`, add near the top (after the `PAGE_MM` map):

```ts
/** Minimum on-page size (mm) for a grid row or column; the resize floor. */
export const MIN_CELL_MM = 15;
```

- [ ] **Step 2: Write the failing tests**

Add to `lib/book-mutations.test.ts` (extend existing imports if `resizeGridRow`/`resizeGridColumn`/`Book`/`DEFAULT_PAGE_CONFIG` aren't already imported):

```ts
import { resizeGridRow, resizeGridColumn } from "@/lib/book-mutations";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

function gridBook(): Book {
  return {
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [
        { heightFr: 0.5, cells: [
          { widthFr: 0.5, objects: [] },
          { widthFr: 0.5, objects: [] },
        ] },
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
      ],
    }] }],
  };
}

describe("resizeGridRow", () => {
  it("moves height across the divider, conserving the total", () => {
    const out = resizeGridRow(gridBook(), 0, 0, 0, 0.1);
    const h = out.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h[0]).toBeCloseTo(0.6, 6);
    expect(h[1]).toBeCloseTo(0.4, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
  });
  it("does not mutate the input book", () => {
    const book = gridBook();
    resizeGridRow(book, 0, 0, 0, 0.1);
    expect(book.chapters[0].steps[0].grid![0].heightFr).toBe(0.5);
  });
});

describe("resizeGridColumn", () => {
  it("moves width across the divider within the row, conserving the total", () => {
    const out = resizeGridColumn(gridBook(), 0, 0, 0, 0, -0.1);
    const w = out.chapters[0].steps[0].grid![0].cells.map((c) => c.widthFr);
    expect(w[0]).toBeCloseTo(0.4, 6);
    expect(w[1]).toBeCloseTo(0.6, 6);
    expect(w[0] + w[1]).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — `resizeGridRow`/`resizeGridColumn` not exported.

- [ ] **Step 4: Implement the mutations**

In `lib/book-mutations.ts`, add the imports (merge with existing import lines where present):

```ts
import { resizeAdjacent, bodyRegion, MIN_CELL_MM } from "./grid-math";
import { DEFAULT_PAGE_CONFIG } from "./book-schema";
```

and the two functions (use the existing `clone` helper):

```ts
/** Resize the divider between rows `dividerIndex` and `dividerIndex+1` of a
 *  step's grid by `deltaFr`. Conserved-total, floored at MIN_CELL_MM. */
export function resizeGridRow(
  book: Book,
  ci: number,
  si: number,
  dividerIndex: number,
  deltaFr: number,
): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid) return book;
  const minFr = MIN_CELL_MM / bodyRegion(next.pageConfig ?? DEFAULT_PAGE_CONFIG).h;
  const sizes = step.grid.map((r) => r.heightFr);
  const out = resizeAdjacent(sizes, dividerIndex, deltaFr, minFr);
  step.grid = step.grid.map((r, i) => ({ ...r, heightFr: out[i] }));
  return next;
}

/** Resize the divider between cells `dividerIndex` and `dividerIndex+1` within
 *  row `ri` of a step's grid by `deltaFr`. Conserved-total, floored. */
export function resizeGridColumn(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  dividerIndex: number,
  deltaFr: number,
): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row) return book;
  const minFr = MIN_CELL_MM / bodyRegion(next.pageConfig ?? DEFAULT_PAGE_CONFIG).w;
  const sizes = row.cells.map((c) => c.widthFr);
  const out = resizeAdjacent(sizes, dividerIndex, deltaFr, minFr);
  row.cells = row.cells.map((c, i) => ({ ...c, widthFr: out[i] }));
  return next;
}
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-mutations.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/grid-math.ts lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: grid row/column resize mutations (conserved-total, mm floor)"
```

---

### Task 2: Store actions for grid resize

**Files:**
- Modify: `lib/store.tsx`
- Modify: `lib/store.test.ts`

**Interfaces:**
- Consumes: `M.resizeGridRow`, `M.resizeGridColumn`.
- Produces on the store:
  - `resizeGridRow(ci: number, si: number, dividerIndex: number, deltaFr: number): void`
  - `resizeGridColumn(ci: number, si: number, ri: number, dividerIndex: number, deltaFr: number): void`

- [ ] **Step 1: Write the failing test**

Add to `lib/store.test.ts` (reuse existing `createEditorStore`/`DEFAULT_PAGE_CONFIG`/`Book` imports):

```ts
describe("grid resize actions", () => {
  const gridBook = (): Book => ({
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
      ],
    }] }],
  });

  it("resizeGridRow updates row fractions on the store", () => {
    const store = createEditorStore(gridBook(), "slug");
    store.getState().resizeGridRow(0, 0, 0, 0.1);
    const h = store.getState().book.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h[0]).toBeCloseTo(0.6, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — `resizeGridRow` is not a function.

- [ ] **Step 3: Add the actions**

In `lib/store.tsx`, declare on the `EditorState` interface (near `updateRow`):

```ts
  resizeGridRow: (
    ci: number,
    si: number,
    dividerIndex: number,
    deltaFr: number,
  ) => void;
  resizeGridColumn: (
    ci: number,
    si: number,
    ri: number,
    dividerIndex: number,
    deltaFr: number,
  ) => void;
```

and implement (near the `// ── rows ──` actions):

```ts
    resizeGridRow: (ci, si, dividerIndex, deltaFr) =>
      set((s) => ({ book: M.resizeGridRow(s.book, ci, si, dividerIndex, deltaFr) })),
    resizeGridColumn: (ci, si, ri, dividerIndex, deltaFr) =>
      set((s) => ({ book: M.resizeGridColumn(s.book, ci, si, ri, dividerIndex, deltaFr) })),
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/store.test.ts
git commit -m "feat: store actions for grid row/column resize"
```

---

### Task 3: `PreviewGridResize` overlay + styles

**Files:**
- Create: `components/editor/PreviewGridResize.tsx`
- Modify: `components/editor/editor.css`

Verified by `pnpm build` + `pnpm typecheck`. This is a `"use client"` component modelled on `PreviewAnnotations`.

**Interfaces:**
- Consumes: `bodyRegion` (`@/lib/grid-math`); `resizeGridRow`/`resizeGridColumn` (store); `GridRow` (`@/lib/book-schema`).
- Props: `{ scalerRef: React.RefObject<HTMLDivElement | null>; pageIndex: number; ci: number; si: number; grid: GridRow[]; pageConfig: PageConfig; fitKey: string; scale: number }`.

- [ ] **Step 1: Create the component**

Mirror `PreviewAnnotations`'s measurement + drag approach. Measure the rendered `.grid-step` and its `.grid-row`/`.grid-cell` boxes (unscaled, relative to the scaler), draw divider hit-lines + handles, and on drag convert the pointer delta to an `fr` delta and call the store action (rAF-throttled). The SVG itself is `pointer-events: none`; only the hit-lines/handles are interactive (so annotation handles below remain usable).

```tsx
// components/editor/PreviewGridResize.tsx
"use client";

/*
 * Editor-only overlay that draws draggable row/column divider handles over a
 * grid-mode step in the live preview. Modelled on PreviewAnnotations: it
 * measures the rendered .grid-step boxes, captures pointer drags, and writes
 * fr deltas to the store (rAF-throttled). The SVG is pointer-events:none except
 * on the divider hit-areas, so it never steals annotation interactions. Nothing
 * here touches the renderer/print path.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { GridRow, PageConfig } from "@/lib/book-schema";
import { bodyRegion } from "@/lib/grid-math";
import { useEditor } from "@/lib/store";

interface Box { l: number; t: number; w: number; h: number }
interface Geom { box: Box; rows: Box[]; cells: Box[][] }

type Drag =
  | { kind: "row"; index: number; startClient: number; spanFr: number; spanPx: number }
  | { kind: "col"; ri: number; index: number; startClient: number; spanFr: number; spanPx: number };

export default function PreviewGridResize({
  scalerRef, pageIndex, ci, si, grid, pageConfig, fitKey, scale,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  grid: GridRow[];
  pageConfig: PageConfig;
  fitKey: string;
  scale: number;
}) {
  const resizeRow = useEditor((s) => s.resizeGridRow);
  const resizeCol = useEditor((s) => s.resizeGridColumn);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const raf = useRef<number | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);

  // Measure the .grid-step + row/cell boxes in unscaled coords relative to the scaler.
  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setGeom(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return {
        l: (r.left - base.left) / scale,
        t: (r.top - base.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      };
    };
    const rowEls = [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")];
    setGeom({
      box: toBox(gridEl),
      rows: rowEls.map(toBox),
      cells: rowEls.map((re) => [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].map(toBox)),
    });
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!geom) return null;
  const { box, rows, cells } = geom;
  const body = bodyRegion(pageConfig);

  const startRow = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const spanPx = rows[index].h + rows[index + 1].h;
    const spanFr = grid[index].heightFr + grid[index + 1].heightFr;
    drag.current = { kind: "row", index, startClient: e.clientY, spanFr, spanPx };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const startCol = (ri: number, index: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const spanPx = cells[ri][index].w + cells[ri][index + 1].w;
    const spanFr = grid[ri].cells[index].widthFr + grid[ri].cells[index + 1].widthFr;
    drag.current = { kind: "col", ri, index, startClient: e.clientX, spanFr, spanPx };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const apply = (clientPos: number) => {
    const d = drag.current;
    if (!d) return;
    // unscaled px moved → fraction of the pair → fr delta
    const movedPx = (clientPos - d.startClient) / scale;
    const deltaFr = (movedPx / d.spanPx) * d.spanFr;
    if (d.kind === "row") resizeRow(ci, si, d.index, deltaFr);
    else resizeCol(ci, si, d.ri, d.index, deltaFr);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const pos = d.kind === "row" ? e.clientY : e.clientX;
    // Live mm readout: the two resulting track sizes, from the current delta.
    const baseRect = svgRef.current?.getBoundingClientRect();
    if (baseRect) {
      const mmTotal = d.kind === "row" ? body.h : body.w;
      const movedPx = (pos - d.startClient) / scale;
      const deltaFr = (movedPx / d.spanPx) * d.spanFr;
      const curFr = d.kind === "row" ? grid[d.index].heightFr : grid[d.ri].cells[d.index].widthFr;
      const aFr = Math.max(0, Math.min(d.spanFr, curFr + deltaFr));
      const bFr = d.spanFr - aFr;
      setReadout({
        x: (e.clientX - baseRect.left) / scale + 8,
        y: (e.clientY - baseRect.top) / scale - 8,
        text: `${(aFr * mmTotal).toFixed(0)} / ${(bFr * mmTotal).toFixed(0)} mm`,
      });
    }
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(pos));
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
    setReadout(null);
  };

  return (
    <svg
      ref={svgRef}
      className="preview-grid-resize"
      style={{ position: "absolute", left: box.l, top: box.t }}
      width={box.w}
      height={box.h}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* Row dividers: between row i and i+1, at the gap midpoint. */}
      {rows.slice(0, -1).map((r, i) => {
        const y = r.t - box.t + r.h + (rows[i + 1].t - (r.t + r.h)) / 2;
        return (
          <line
            key={`row-${i}`}
            x1={0} y1={y} x2={box.w} y2={y}
            className="grid-divider grid-divider-row"
            onPointerDown={startRow(i)}
          />
        );
      })}
      {/* Column dividers: within each row, between cell j and j+1. */}
      {cells.map((rowCells, ri) =>
        rowCells.slice(0, -1).map((c, j) => {
          const x = c.l - box.l + c.w + (rowCells[j + 1].l - (c.l + c.w)) / 2;
          const yTop = rows[ri].t - box.t;
          return (
            <line
              key={`col-${ri}-${j}`}
              x1={x} y1={yTop} x2={x} y2={yTop + rows[ri].h}
              className="grid-divider grid-divider-col"
              onPointerDown={startCol(ri, j)}
            />
          );
        }),
      )}
      {readout ? (
        <text x={readout.x} y={readout.y} className="grid-readout">{readout.text}</text>
      ) : null}
    </svg>
  );
}
```

- [ ] **Step 2: Add the CSS**

Append to `components/editor/editor.css`:

```css
/* Grid divider-resize overlay (editor-only; never printed). */
.preview-grid-resize {
  pointer-events: none; /* only the dividers below are interactive */
  overflow: visible;
}
.grid-divider {
  stroke: transparent;
  stroke-width: 10;
  pointer-events: stroke;
}
.grid-divider-row { cursor: row-resize; }
.grid-divider-col { cursor: col-resize; }
.grid-divider:hover {
  stroke: #3b82f6; /* DESIGN selection blue */
  stroke-width: 2;
}
.grid-readout {
  fill: var(--color-ink);
  font-size: 11px;
  font-family: var(--font-body, sans-serif);
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 3;
  pointer-events: none;
}
```

- [ ] **Step 3: Verify the build**

Run: `pnpm build && pnpm typecheck`
Expected: both succeed (the component is not yet mounted — Task 4 — so this confirms it compiles and the CSS is valid). Confirm no unused-variable warning for `PreviewGridResize.tsx` (the dead `newFr` must be removed).

- [ ] **Step 4: Commit**

```bash
git add components/editor/PreviewGridResize.tsx components/editor/editor.css
git commit -m "feat: PreviewGridResize divider-handle overlay + styles"
```

---

### Task 4: Mount the overlay in `PreviewPane` for grid-mode steps

**Files:**
- Modify: `components/editor/PreviewPane.tsx`

Verified by `pnpm build` + `pnpm typecheck` + `pnpm test --run`.

**Interfaces:**
- Consumes: `stepLayoutMode` (`@/lib/book-schema`), `PreviewGridResize`.

- [ ] **Step 1: Add imports**

In `components/editor/PreviewPane.tsx`:

```ts
import { stepLayoutMode } from "@/lib/book-schema";
import PreviewGridResize from "./PreviewGridResize";
```

- [ ] **Step 2: Mount it after `PreviewAnnotations`**

Inside the `.preview-scaler`, immediately AFTER the existing `{selection.stepIndex != null ? (<PreviewAnnotations … />) : null}` block, add (compute the selected step once; only mount for a grid-mode step that has a grid):

```tsx
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 ? (
                <PreviewGridResize
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  pageConfig={book.pageConfig ?? DEFAULT_PAGE_CONFIG}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                />
              ) : null;
            })()}
```

Add `DEFAULT_PAGE_CONFIG` to the existing `@/lib/book-schema` import (or a new import line). `bookFitKey` is already imported.

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test --run`
Expected: all succeed/green. Manual check (note in PR): select a grid-mode step → row/column divider handles appear over the grid; dragging a divider resizes the two adjacent tracks live with a mm readout, neighbours conserve total, and it stops at the ~15 mm floor; annotation handles on the same page still work; a legacy step shows no divider handles; `/print` and the PDF show no handles.

- [ ] **Step 4: Commit**

```bash
git add "components/editor/PreviewPane.tsx"
git commit -m "feat: mount grid divider-resize overlay for grid-mode steps"
```

---

## Self-review (done)

- **Spec coverage:** mm-floored conserved-total mutations ✓ (T1), store actions ✓ (T2), divider-handle overlay + mm readout ✓ (T3), grid-mode-only mount ✓ (T4).
- **Editor-only / print-clean:** all new code is under `components/editor/**`; the renderer/print path is untouched; the overlay only mounts inside `PreviewPane`'s scaler. Stated in T3/T4.
- **No annotation conflict:** resize SVG is `pointer-events: none` except dividers, mounted after `PreviewAnnotations`. Stated in Global Constraints + T4.
- **Reuses Plan-1 math:** `resizeAdjacent` + `bodyRegion`; no new redistribution algorithm.
- **Placeholder scan:** none — every step has real, transcribable code/commands.
- **Type consistency:** `resizeGridRow`/`resizeGridColumn` signatures match across mutations (T1), store (T2), and the overlay's calls (T3); `MIN_CELL_MM`, `bodyRegion`, `stepLayoutMode` names agree with Plans 1/3.

## Carry-forward (not this plan)

- **Add/remove rows & cells** (grid structure editing) — the toggle only switches a step to a migrated skeleton today.
- **Grid-guides visibility toggle** + faint cell-border guides — Plan 6 (annotation/snapping), where guides drive alignment.
- **In-cell object drag**, cell object stacks (callouts), and `fitGrid` — Plan 5.
- **Keyboard/arrow-key divider nudge** and `prefers-reduced-motion` polish (DESIGN.md) — follow-up.
- **Floor-blocked visual state** (DESIGN.md) — the floor is enforced; a distinct "blocked" affordance is a polish follow-up.
