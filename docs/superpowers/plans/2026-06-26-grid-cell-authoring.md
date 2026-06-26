# Grid Cell Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author click a grid cell and add/edit/remove its image and callouts from the left panel, with an image fit (crop) control.

**Architecture:** Adds cell selection to the store, seven immutable cell-object mutations on `step.grid[ri].cells[cellIndex].objects`, an editor-only `PreviewGridSelect` overlay for click-to-select, and a left-panel `CellEditor` (reusing `ImagePicker` + `RichTextArea`). Callouts stay flow-stacked (Plan 6 render); overflow keeps Plan 6's `overflow: hidden` clip baseline. No `Book` schema change.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind v4, Zustand vanilla store, vitest (node env, `lib/**/*.test.ts`, `@/*` alias).

**Design spec:** `docs/superpowers/specs/2026-06-25-grid-cell-authoring-design.md`.

## Global Constraints

- **Commits:** Conventional Commits; **NO AI attribution / no Co-Authored-By trailer.**
- **No `Book` schema change:** `StackedObject.callout`/`fit` already exist (Plan 6); cell selection is store state. No ADR needed.
- **`Selection.cellIndex` is OPTIONAL** (`cellIndex?: number | null`) — so the existing ~10 `selection: {…}` literals need no edits; any non-cell selection leaves it `undefined` (= no cell selected). `selectCell` sets it.
- **Immutability:** every mutation returns a new `Book` via the existing `clone` (`structuredClone`); never mutate input. A bad chapter/step/grid/row/cell/object index returns the input book unchanged.
- **Editor-only / print-clean:** `PreviewGridSelect` + `CellEditor` live in `components/editor/**`; `components/renderer/**` and `/print` are untouched; Plan 6's `.grid-cell { overflow: hidden }` clip baseline stays.
- **Reuse, don't fork:** reuse `ImagePicker` as-is; `CellEditor`'s callout list is NEW (operates on cell objects) — do NOT reuse the legacy row-bound `CalloutEditor`.
- **Rules of hooks:** in `CellEditor`, all hooks run before any early `return null`.
- **Scope (Plan 7 only):** NO `fitGrid` engine (Plan 8), NO on-canvas drag / absolute positioning (Plan 9), NO rich-text `kind:"text"` (Plan 10), NO file-drop image, NO cross-cell move.
- **Verification:** trust only real `pnpm test --run` + `pnpm typecheck` + `pnpm build`; the harness `<new-diagnostics>` LSP messages are stale RED-phase snapshots — ignore them.
- **Suite baseline:** 60 unit tests pass today; this plan adds ~10.

## File Structure

- `lib/book-mutations.ts` — add 7 cell mutations (`setCellImage`, `removeCellImage`, `setCellImageFit`, `addCellCallout`, `updateCellCallout`, `removeCellObject`, `moveCellObject`). **Task 1**
- `lib/book-mutations.test.ts` — cell-mutation tests. **Task 1**
- `lib/store.tsx` — `Selection.cellIndex?`, `selectCell`, 7 action wrappers. **Task 2**
- `lib/store.test.ts` — `selectCell` + one mutation action. **Task 2**
- `components/editor/PreviewGridSelect.tsx` — editor-only cell click + highlight overlay (create). **Task 3**
- `components/editor/PreviewPane.tsx` — mount the overlay (grid-mode). **Task 3**
- `components/editor/editor.css` — cell-select highlight + cell-editor styles. **Tasks 3 & 4**
- `components/editor/CellEditor.tsx` — selected-cell panel (create). **Task 4**
- `components/editor/StepEditor.tsx` — render `CellEditor` in the grid branch. **Task 4**

---

### Task 1: Cell-object mutations

**Files:**
- Modify: `lib/book-mutations.ts` (imports at lines 12–27; `swap` at 129; `blankCallout` at 79; add the 7 functions near the grid-structure section ~line 505)
- Test: `lib/book-mutations.test.ts`

**Interfaces:**
- Consumes: `GridCell`, `Callout`, `ImageFit`, `StackedObject` (book-schema); `annotationId` (annotations); `blankCallout`, `swap`, `clone` (book-mutations).
- Produces (all `(…args) => Book`): `setCellImage(book, ci, si, ri, cellIndex, filename)`, `removeCellImage(book, ci, si, ri, cellIndex)`, `setCellImageFit(book, ci, si, ri, cellIndex, fit)`, `addCellCallout(book, ci, si, ri, cellIndex)`, `updateCellCallout(book, ci, si, ri, cellIndex, objIndex, patch)`, `removeCellObject(book, ci, si, ri, cellIndex, objIndex)`, `moveCellObject(book, ci, si, ri, cellIndex, objIndex, dir)`. Consumed by the store (Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `lib/book-mutations.test.ts` (reuse its imports; add the new function names + `ImageFit` if needed):

```ts
import {
  setCellImage, removeCellImage, setCellImageFit,
  addCellCallout, updateCellCallout, removeCellObject, moveCellObject,
} from "@/lib/book-mutations";
import type { Book, StackedObject } from "@/lib/book-schema";

const gridBook = (objects: StackedObject[]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});
const cellObjs = (b: Book) => b.chapters[0].steps[0].grid![0].cells[0].objects;

describe("cell mutations", () => {
  it("setCellImage creates a primary image (first) on an empty cell", () => {
    const out = setCellImage(gridBook([]), 0, 0, 0, 0, "a.jpg");
    expect(cellObjs(out)[0]).toMatchObject({ role: "primary", kind: "image", ref: "a.jpg" });
  });
  it("setCellImage updates the existing primary ref", () => {
    const start = gridBook([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "old.jpg" }]);
    const out = setCellImage(start, 0, 0, 0, 0, "new.jpg");
    expect(cellObjs(out).filter((o) => o.kind === "image")).toHaveLength(1);
    expect(cellObjs(out)[0].ref).toBe("new.jpg");
  });
  it("removeCellImage drops the primary image", () => {
    const start = gridBook([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.jpg" }]);
    expect(cellObjs(removeCellImage(start, 0, 0, 0, 0))).toHaveLength(0);
  });
  it("setCellImageFit sets the image fit", () => {
    const start = gridBook([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.jpg" }]);
    expect(cellObjs(setCellImageFit(start, 0, 0, 0, 0, "fit-width"))[0].fit).toBe("fit-width");
  });
  it("addCellCallout appends a secondary callout object", () => {
    const out = addCellCallout(gridBook([]), 0, 0, 0, 0);
    expect(cellObjs(out)[0]).toMatchObject({ role: "secondary", kind: "callout" });
    expect(cellObjs(out)[0].callout).toBeDefined();
  });
  it("updateCellCallout patches the callout payload", () => {
    const start = addCellCallout(gridBook([]), 0, 0, 0, 0);
    const out = updateCellCallout(start, 0, 0, 0, 0, 0, { body: "hello", type: "warning" });
    expect(cellObjs(out)[0].callout).toMatchObject({ body: "hello", type: "warning" });
  });
  it("removeCellObject removes by index", () => {
    const start = addCellCallout(gridBook([]), 0, 0, 0, 0);
    expect(cellObjs(removeCellObject(start, 0, 0, 0, 0, 0))).toHaveLength(0);
  });
  it("moveCellObject reorders within the cell", () => {
    let b = addCellCallout(gridBook([]), 0, 0, 0, 0);
    b = addCellCallout(b, 0, 0, 0, 0);
    cellObjs(b)[0].callout!.body = "first";
    cellObjs(b)[1].callout!.body = "second";
    const out = moveCellObject(b, 0, 0, 0, 0, 0, 1);
    expect(cellObjs(out).map((o) => o.callout?.body)).toEqual(["second", "first"]);
  });
  it("does not mutate input and no-ops on a bad cell index", () => {
    const start = gridBook([]);
    const snap = structuredClone(start);
    const out = setCellImage(start, 0, 0, 0, 9, "x.jpg");
    expect(start).toEqual(snap);
    expect(out).toBe(start); // bad index → same reference
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — the cell mutations are not exported yet.

- [ ] **Step 3: Implement the mutations**

In `lib/book-mutations.ts`, extend the book-schema import to include `GridCell` and `ImageFit`:

```ts
import {
  type Annotation,
  type Book,
  type Callout,
  type CalloutType,
  type Chapter,
  type Connector,
  type GridCell,
  type ImageFit,
  type ImageRow,
  type RowLayout,
  type Step,
  type Surface,
  DEFAULT_PAGE_CONFIG,
} from "./book-schema";
```

Add near the grid-structure section (after `removeGridColumn`, ~line 505):

```ts
// ── Cell objects (Plan 7) ──────────────────────────────────

const cellOf = (book: Book, ci: number, si: number, ri: number, cellIndex: number): GridCell | undefined =>
  book.chapters[ci]?.steps[si]?.grid?.[ri]?.cells?.[cellIndex];

/** Set (or create) the cell's primary image; a new image goes first in the stack. */
export function setCellImage(book: Book, ci: number, si: number, ri: number, cellIndex: number, filename: string): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx >= 0) cell.objects[idx] = { ...cell.objects[idx], ref: filename };
  else cell.objects.unshift({ id: annotationId(), role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: filename });
  return next;
}

export function removeCellImage(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects = cell.objects.filter((o) => !(o.kind === "image" && o.role === "primary"));
  return next;
}

export function setCellImageFit(book: Book, ci: number, si: number, ri: number, cellIndex: number, fit: ImageFit): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx < 0) return book;
  cell.objects[idx] = { ...cell.objects[idx], fit };
  return next;
}

export function addCellCallout(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects.push({ id: annotationId(), role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: blankCallout() });
  return next;
}

export function updateCellCallout(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, patch: Partial<Callout>): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "callout") return book;
  obj.callout = { ...(obj.callout ?? blankCallout()), ...patch };
  return next;
}

export function removeCellObject(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell || objIndex < 0 || objIndex >= cell.objects.length) return book;
  cell.objects.splice(objIndex, 1);
  return next;
}

export function moveCellObject(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, dir: -1 | 1): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const j = objIndex + dir;
  if (j < 0 || j >= cell.objects.length) return book;
  swap(cell.objects, objIndex, j);
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run lib/book-mutations.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean. Existing book-mutations tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: add grid cell-object mutations (image/callout add/edit/remove/move)"
```

---

### Task 2: Store — cell selection + action wrappers

**Files:**
- Modify: `lib/store.tsx` (`Selection` at lines 34–40; selection actions ~167–196; interface ~52–145; impl in the `createStore` body)
- Test: `lib/store.test.ts`

**Interfaces:**
- Consumes: the 7 Task-1 mutations (imported as `M.*` — the file already does `import * as M`).
- Produces: `selectCell(ci, si, ri, cellIndex)` and store actions `setCellImage`/`removeCellImage`/`setCellImageFit`/`addCellCallout`/`updateCellCallout`/`removeCellObject`/`moveCellObject` (same arg lists as Task 1 minus `book`). `Selection.cellIndex?: number | null`. Consumed by `PreviewGridSelect` (Task 3) + `CellEditor` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `lib/store.test.ts` (reuse its store-creation helper; if it constructs a store via the exported factory, follow that pattern):

```ts
it("selectCell sets cellIndex and clears the annotation selection", () => {
  const store = makeStore(); // however store.test.ts builds one
  store.getState().selectCell(0, 0, 1, 2);
  expect(store.getState().selection.cellIndex).toBe(2);
  expect(store.getState().selection.rowIndex).toBe(1);
  expect(store.getState().selectedAnnotation).toBeNull();
});

it("selecting a step clears the cell selection", () => {
  const store = makeStore();
  store.getState().selectCell(0, 0, 1, 2);
  store.getState().selectStep(0, 0);
  expect(store.getState().selection.cellIndex ?? null).toBeNull();
});

it("addCellCallout action updates the book", () => {
  const store = makeStore();
  // Arrange: a grid step exists at [0][0]; if the test fixture's book has none,
  // toggle one: store.getState().setStepLayoutMode(0, 0, "grid")
  store.getState().setStepLayoutMode(0, 0, "grid");
  store.getState().addCellCallout(0, 0, 0, 0);
  const cell = store.getState().book.chapters[0].steps[0].grid![0].cells[0];
  expect(cell.objects.some((o) => o.kind === "callout")).toBe(true);
});
```

If `store.test.ts` uses a different store-construction or fixture, adapt these three assertions to it — keep the three behaviors (selectCell sets cellIndex; selectStep clears it; an action mutates the book).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — `selectCell` / cell actions are not defined.

- [ ] **Step 3: Implement**

In `lib/store.tsx`:

1. Add the optional field to `Selection` (after `slotIndex`):

```ts
  slotIndex: number | null;
  /** Selected grid cell column (within rowIndex), grid mode only. */
  cellIndex?: number | null;
```

2. Add to the `EditorState` interface, in the selection group (after `selectRow`):

```ts
  selectCell: (ci: number, si: number, ri: number, cellIndex: number) => void;
```

and in the rows/grid group, the seven cell actions:

```ts
  setCellImage: (ci: number, si: number, ri: number, cellIndex: number, filename: string) => void;
  removeCellImage: (ci: number, si: number, ri: number, cellIndex: number) => void;
  setCellImageFit: (ci: number, si: number, ri: number, cellIndex: number, fit: ImageFit) => void;
  addCellCallout: (ci: number, si: number, ri: number, cellIndex: number) => void;
  updateCellCallout: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, patch: Partial<Callout>) => void;
  removeCellObject: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number) => void;
  moveCellObject: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, dir: -1 | 1) => void;
```

Ensure `ImageFit` and `Callout` are imported from `@/lib/book-schema` at the top of `store.tsx` (add them if missing).

3. Add the implementations. `selectCell` next to `selectRow`:

```ts
    selectCell: (chapterIndex, stepIndex, rowIndex, cellIndex) =>
      set({
        selection: { chapterIndex, stepIndex, rowIndex, slotIndex: null, cellIndex },
        selectedAnnotation: null,
      }),
```

The seven cell actions next to the grid-structure actions (e.g. after `removeGridColumn`):

```ts
    setCellImage: (ci, si, ri, cellIndex, filename) =>
      set((s) => ({ book: M.setCellImage(s.book, ci, si, ri, cellIndex, filename) })),
    removeCellImage: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.removeCellImage(s.book, ci, si, ri, cellIndex) })),
    setCellImageFit: (ci, si, ri, cellIndex, fit) =>
      set((s) => ({ book: M.setCellImageFit(s.book, ci, si, ri, cellIndex, fit) })),
    addCellCallout: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.addCellCallout(s.book, ci, si, ri, cellIndex) })),
    updateCellCallout: (ci, si, ri, cellIndex, objIndex, patch) =>
      set((s) => ({ book: M.updateCellCallout(s.book, ci, si, ri, cellIndex, objIndex, patch) })),
    removeCellObject: (ci, si, ri, cellIndex, objIndex) =>
      set((s) => ({ book: M.removeCellObject(s.book, ci, si, ri, cellIndex, objIndex) })),
    moveCellObject: (ci, si, ri, cellIndex, objIndex, dir) =>
      set((s) => ({ book: M.moveCellObject(s.book, ci, si, ri, cellIndex, objIndex, dir) })),
```

(The existing `selection: {…}` literals do NOT need `cellIndex` — it is optional, so non-cell selections leave it `undefined`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean. Full suite still green: `pnpm test --run`.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/store.test.ts
git commit -m "feat: add cell selection and cell-object store actions"
```

---

### Task 3: Editor-only cell-select overlay

This task is verified by `pnpm typecheck` + `pnpm build` + manual check (an editor overlay; the codebase has no DOM test harness — consistent with `PreviewGridResize`).

**Files:**
- Create: `components/editor/PreviewGridSelect.tsx`
- Modify: `components/editor/PreviewPane.tsx` (mount, after `<A4Book>` and before `<PreviewAnnotations>`, lines ~155–193)
- Modify: `components/editor/editor.css` (cell-select highlight)

**Interfaces:**
- Consumes: `selectCell` (Task 2); `selection.cellIndex`/`rowIndex` (Task 2).
- Produces: `<PreviewGridSelect scalerRef pageIndex ci si grid fitKey scale selected />` where `selected: { ri: number; cellIndex: number } | null`.

- [ ] **Step 1: Create the overlay**

Create `components/editor/PreviewGridSelect.tsx`:

```tsx
"use client";

/*
 * Editor-only overlay: a transparent click target over each grid cell, plus a
 * highlight on the selected cell. Measures cell boxes like PreviewGridResize
 * (unscaled, relative to the scaler). Mounted BELOW PreviewAnnotations and
 * PreviewGridResize so their handles/dividers take precedence; cell-interior
 * clicks fall through to here. Never touches the renderer/print path.
 */
import { useLayoutEffect, useState } from "react";
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

interface Box { l: number; t: number; w: number; h: number }

export default function PreviewGridSelect({
  scalerRef, pageIndex, ci, si, grid, fitKey, scale, selected,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  grid: GridRow[];
  fitKey: string;
  scale: number;
  selected: { ri: number; cellIndex: number } | null;
}) {
  const selectCell = useEditor((s) => s.selectCell);
  const [cells, setCells] = useState<{ ri: number; cidx: number; box: Box }[] | null>(null);

  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setCells(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: (r.left - base.left) / scale, t: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const out: { ri: number; cidx: number; box: Box }[] = [];
    [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")].forEach((re, ri) => {
      [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].forEach((ce, cidx) => {
        out.push({ ri, cidx, box: toBox(ce) });
      });
    });
    setCells(out);
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!cells) return null;

  return (
    <div className="preview-grid-select" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {cells.map(({ ri, cidx, box }) => {
        const isSel = selected?.ri === ri && selected?.cellIndex === cidx;
        return (
          <button
            key={`${ri}-${cidx}`}
            type="button"
            className={`grid-cell-select${isSel ? " selected" : ""}`}
            style={{ position: "absolute", left: box.l, top: box.t, width: box.w, height: box.h, pointerEvents: "all" }}
            onClick={(e) => { e.stopPropagation(); selectCell(ci, si, ri, cidx); }}
            aria-label={`Select cell ${ri + 1}.${cidx + 1}`}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in PreviewPane**

In `components/editor/PreviewPane.tsx`, add the import:

```ts
import PreviewGridSelect from "./PreviewGridSelect";
```

Insert this block immediately AFTER `<A4Book … />` and BEFORE the `<PreviewAnnotations>` conditional (so it is the lowest overlay):

```tsx
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 ? (
                <PreviewGridSelect
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                  selected={
                    selection.cellIndex != null
                      ? { ri: selection.rowIndex ?? 0, cellIndex: selection.cellIndex }
                      : null
                  }
                />
              ) : null;
            })()}
```

- [ ] **Step 3: Add the highlight CSS**

Append to `components/editor/editor.css`:

```css
/* Grid cell-select overlay (Plan 7, editor-only) */
.preview-grid-select .grid-cell-select {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.preview-grid-select .grid-cell-select.selected {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
  background: rgba(37, 99, 235, 0.06);
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (a pre-existing `use-auto-fit` warning may appear; only NEW errors matter).

- [ ] **Step 5: Manual verification (record in the report)**

Run `pnpm dev`, open a project, toggle a step to Grid, then verify:
1. Clicking a cell highlights it (blue outline) and selects it.
2. Dragging a row/column divider still resizes (dividers win over the cell click).
3. The on-canvas +/× add/remove buttons still work.
4. `/print` of the grid step shows NO highlight/affordance (editor-only).

- [ ] **Step 6: Commit**

```bash
git add components/editor/PreviewGridSelect.tsx components/editor/PreviewPane.tsx components/editor/editor.css
git commit -m "feat: editor-only grid cell-select overlay with highlight"
```

---

### Task 4: Cell editor panel

Verified by `pnpm typecheck` + `pnpm build` + manual check.

**Files:**
- Create: `components/editor/CellEditor.tsx`
- Modify: `components/editor/StepEditor.tsx` (grid branch at lines 65–66; add a `selectedCell` read)
- Modify: `components/editor/editor.css` (cell-editor styles)

**Interfaces:**
- Consumes: cell actions + `selection.cellIndex`/`rowIndex` (Task 2); `ImagePicker`, `RichTextArea`; `assetUrl` (project-routes); `bodyRegion` (grid-math); `CALLOUT_TYPES` (book-mutations); `normalizeCalloutType`, `DEFAULT_PAGE_CONFIG` (book-schema).
- Produces: `<CellEditor ci si ri cellIndex />`.

- [ ] **Step 1: Create CellEditor**

Create `components/editor/CellEditor.tsx`. NOTE: all hooks run before the early return (rules of hooks).

```tsx
"use client";

/*
 * Left-panel editor for the selected grid cell: assign/replace/remove its image
 * (with a fit/crop control + a misfit prompt) and add/edit/remove/reorder its
 * callouts. Operates on the cell's StackedObjects via the store cell actions.
 * Callouts are flow-stacked (Plan 6 render); drag is Plan 9.
 */
import { useEffect, useState } from "react";
import type { Callout, ImageFit } from "@/lib/book-schema";
import { DEFAULT_PAGE_CONFIG, normalizeCalloutType } from "@/lib/book-schema";
import { CALLOUT_TYPES } from "@/lib/book-mutations";
import { bodyRegion } from "@/lib/grid-math";
import { assetUrl } from "@/lib/project-routes";
import { useEditor } from "@/lib/store";
import ImagePicker from "./ImagePicker";
import RichTextArea from "./RichTextArea";

const FIT_OPTIONS: { v: ImageFit; label: string }[] = [
  { v: "contain", label: "Maintain ratio" },
  { v: "fit-width", label: "Crop height" },
  { v: "fit-height", label: "Crop width" },
];

export default function CellEditor({ ci, si, ri, cellIndex }: { ci: number; si: number; ri: number; cellIndex: number }) {
  const slug = useEditor((s) => s.projectSlug);
  const chapterId = useEditor((s) => s.book.chapters[ci]?.id ?? "");
  const cell = useEditor((s) => s.book.chapters[ci]?.steps[si]?.grid?.[ri]?.cells?.[cellIndex]);
  const row = useEditor((s) => s.book.chapters[ci]?.steps[si]?.grid?.[ri]);
  const pageConfig = useEditor((s) => s.book.pageConfig ?? DEFAULT_PAGE_CONFIG);
  const setCellImage = useEditor((s) => s.setCellImage);
  const removeCellImage = useEditor((s) => s.removeCellImage);
  const setCellImageFit = useEditor((s) => s.setCellImageFit);
  const addCellCallout = useEditor((s) => s.addCellCallout);
  const updateCellCallout = useEditor((s) => s.updateCellCallout);
  const removeCellObject = useEditor((s) => s.removeCellObject);
  const moveCellObject = useEditor((s) => s.moveCellObject);

  const imageRef = cell?.objects.find((o) => o.kind === "image" && o.role === "primary")?.ref;
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  useEffect(() => {
    setImgAspect(null);
    if (!imageRef) return;
    const probe = new Image();
    probe.onload = () => setImgAspect(probe.naturalWidth / probe.naturalHeight);
    probe.src = assetUrl(slug, chapterId, imageRef);
    return () => { probe.onload = null; };
  }, [slug, chapterId, imageRef]);

  if (!cell || !row) return null;

  const image = cell.objects.find((o) => o.kind === "image" && o.role === "primary");
  const fit: ImageFit = image?.fit ?? "contain";
  const body = bodyRegion(pageConfig);
  const cellAspect = (cell.widthFr * body.w) / (row.heightFr * body.h);
  const misfit = imgAspect != null && Math.abs(imgAspect - cellAspect) / cellAspect > 0.1;
  const showCropPrompt = Boolean(imageRef) && misfit && fit === "contain";
  const callouts = cell.objects.map((o, i) => ({ o, i })).filter(({ o }) => o.kind === "callout");

  return (
    <section className="editor-section cell-editor">
      <h3 className="editor-subtitle">Cell {ri + 1}.{cellIndex + 1}</h3>

      <div className="editor-field">
        <ImagePicker
          chapterId={chapterId}
          value={imageRef}
          onChange={(f) => setCellImage(ci, si, ri, cellIndex, f)}
          label="Image"
        />
        {imageRef ? (
          <>
            <div className="ctrl-row">
              <span className="ctrl-label">Fit</span>
              <div className="seg">
                {FIT_OPTIONS.map(({ v, label }) => (
                  <button
                    key={v}
                    className={`seg-btn${fit === v ? " active" : ""}`}
                    onClick={() => setCellImageFit(ci, si, ri, cellIndex, v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {showCropPrompt ? (
              <p className="cell-crop-hint">
                This image doesn’t fill the cell — choose a crop above, or keep the ratio.
              </p>
            ) : null}
            <button className="mini-btn danger" onClick={() => removeCellImage(ci, si, ri, cellIndex)}>
              Remove image
            </button>
          </>
        ) : null}
      </div>

      <div className="callout-list">
        {callouts.map(({ o, i }) => (
          <div className="callout-item" key={o.id}>
            <div className="callout-item-head">
              <select
                value={normalizeCalloutType(o.callout?.type)}
                onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { type: e.target.value as Callout["type"] })}
              >
                {CALLOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="mini-btns">
                <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
              </div>
            </div>
            <input
              placeholder="Title"
              value={o.callout?.title ?? ""}
              onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { title: e.target.value })}
            />
            <RichTextArea
              rows={2}
              placeholder="Body"
              value={o.callout?.body ?? ""}
              onChange={(v) => updateCellCallout(ci, si, ri, cellIndex, i, { body: v })}
            />
          </div>
        ))}
      </div>
      <button className="add-btn" onClick={() => addCellCallout(ci, si, ri, cellIndex)}>
        + Add callout
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Render CellEditor in StepEditor's grid branch**

In `components/editor/StepEditor.tsx`: add the import and a `selectedCell` read, and render `CellEditor` after `GridStructure`.

Add import:

```ts
import CellEditor from "./CellEditor";
```

Add the selection read (near `const selectedRow = useEditor((s) => s.selection.rowIndex);`):

```ts
  const selectedCell = useEditor((s) => s.selection.cellIndex);
```

Replace the grid branch (lines ~65–66) with:

```tsx
      {mode === "grid" && step.grid ? (
        <>
          <GridStructure ci={ci} si={si} grid={step.grid} />
          {selectedCell != null ? (
            <CellEditor ci={ci} si={si} ri={selectedRow ?? 0} cellIndex={selectedCell} />
          ) : (
            <p className="editor-help">Select a cell on the page to add an image or callouts.</p>
          )}
        </>
      ) : (
```

(Leave the legacy `else` branch unchanged.)

- [ ] **Step 3: Add cell-editor CSS**

Append to `components/editor/editor.css`:

```css
/* Cell editor panel (Plan 7) */
.cell-editor .cell-crop-hint {
  margin: 4px 0 6px;
  font-size: 12px;
  color: #b45309;
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (only the pre-existing warning).

- [ ] **Step 5: Manual verification (record in the report)**

Run `pnpm dev`, toggle a step to Grid, then verify:
1. Click an empty cell → the panel shows "Cell r.c" with an image picker + "+ Add callout".
2. Choose/upload an image → it fills the cell in the preview.
3. The **Fit** control switches Contain / Crop height / Crop width and the preview crop updates; the misfit hint appears for a non-matching aspect.
4. **+ Add callout** → a callout appears in the cell; editing type/title/body updates the preview; reorder ↑↓ and × remove work.
5. **Remove image** clears it.
6. Selecting a different cell swaps the panel to that cell; selecting a different step hides the CellEditor (shows the hint).
7. `/print` is clean.

- [ ] **Step 6: Commit**

```bash
git add components/editor/CellEditor.tsx components/editor/StepEditor.tsx components/editor/editor.css
git commit -m "feat: grid cell editor panel (image + fit + callouts)"
```

---

## Plan Self-Review

**Spec coverage:**
- Cell selection (`Selection.cellIndex?`, `selectCell`) → Task 2. ✓
- 7 cell mutations → Task 1; store actions → Task 2. ✓
- `PreviewGridSelect` overlay + highlight + mount-below-other-overlays → Task 3. ✓
- `CellEditor`: ImagePicker reuse, Fit control, inline crop-confirm, new callout list, StepEditor integration → Task 4. ✓
- Editor-only / print-clean (renderer untouched, clip baseline kept) → Tasks 3–4 are `components/editor/**` only. ✓
- Immutability + bad-index no-op → Task 1 tests. ✓
- Deferred (fitGrid, drag, rich text, file-drop) → not in any task. ✓
- No `Book` schema change → confirmed (uses Plan 6 fields). ✓

**Placeholder scan:** every code step has complete code; commands have expected output; the only adaptation note (store.test.ts fixture in Task 2 Step 1) names the three exact behaviors to preserve. No TBD/"handle edge cases".

**Type consistency:** the 7 mutation signatures match between Task 1 (definitions), Task 2 (store wrappers + interface), and Task 4 (call sites); `ImageFit` values `contain|fit-width|fit-height` are consistent; `selectCell(ci, si, ri, cellIndex)` and `selection.cellIndex?: number | null` align across Tasks 2–4; `cellOf`/`gridCell` access path `chapters[ci].steps[si].grid[ri].cells[cellIndex]` is uniform.
