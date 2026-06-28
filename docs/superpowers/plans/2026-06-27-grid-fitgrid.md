# Grid Overflow Auto-Shrink (fitGrid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a grid cell's callouts overflow, uniformly scale the callout cells' content down to fit (never silently clip) — in both the editor preview and print.

**Architecture:** A `.grid-cell-content` wrapper around each cell's objects gives `fitGrid` a scalable node. `fitGrid` (in `lib/use-auto-fit.ts`, run by `useAutoFit` inside `BookCanvas`) measures each callout cell's overflow ratio, computes one grid-uniform scale factor (worst cell, floored), and applies `transform: scale(f)` to every callout cell's content; image-only cells are untouched. Also folds in the deferred stale-selection-on-row/column-removal fix.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind v4, Zustand vanilla store, vitest (node env, `lib/**/*.test.ts`, `@/*` alias).

**Design spec:** `docs/superpowers/specs/2026-06-27-grid-fitgrid-design.md`. **ADR:** ADR-006 (amended in Task 1).

## Global Constraints

- **Commits:** Conventional Commits; **NO AI attribution / no Co-Authored-By trailer.**
- **No `Book` schema change** — `fitGrid` is DOM-only; the selection fix is store state. The ADR-006 amendment records a grid-model *behavior* decision (Task 1, before code).
- **`fitGrid` is a RENDER backstop, not editor-only** — it runs via `BookCanvas` in **both** preview and `/print` (intended). It must introduce NO editor-only affordance into the render (it only scales content via `transform`).
- **Grid-uniform + image-exempt:** all **callout-bearing** cells on a step scale by the SAME factor (the worst cell's); image-only cells are never scaled. `MIN_GRID_SCALE = 0.5` floor → past it, clip + report to the existing overflow warning.
- **Fluid-first:** callouts are full-cell-width and wrap (CSS flow); `fitGrid` measures the *already-wrapped* height and shrinks only when it still overflows.
- **Pixel-identical:** a single-image grid cell must still fill its cell after the `.grid-cell-content` wrapper is added (the `img-slot` stays `height:100%` inside the full-size wrapper) — verified manually.
- **Immutability:** store actions return new `selection`/`book`; the reconcile helpers are pure.
- **Separation:** a step is legacy (`.step-body` → `fitSteps`) or grid (`.grid-step` → `fitGrid`), never both. The editor overlays measure the `.grid-cell` box (unchanged by the content transform).
- **Verification:** trust only real `pnpm test --run` + `pnpm typecheck` + `pnpm build`; the harness `<new-diagnostics>` LSP messages are stale RED-phase snapshots — ignore them.
- **Scope (Plan 8 only):** NO on-canvas drag / absolute positioning (Plan 9), NO rich-text `kind:"text"` (Plan 10). Out: auto-columnizing callouts; file-drop image; color.
- **Suite baseline:** 74 unit tests pass today; this plan adds ~8.

## File Structure

- `docs/adr/ADR-006-…md` — amendment: uniform cell-content-scale overflow mechanism. **Task 1**
- `lib/use-auto-fit.ts` — `MIN_GRID_SCALE`, pure `gridFitScale`, the `fitGrid` DOM pass, wired into `useAutoFit`. **Tasks 2 & 4**
- `lib/use-auto-fit.test.ts` — `gridFitScale` unit tests (create). **Task 2**
- `components/renderer/GridStep.tsx` — `.grid-cell-content` wrapper. **Task 3**
- `components/renderer/renderer.css` — move flex-column/gap onto `.grid-cell-content`; `transform-origin`. **Task 3**
- `lib/store.tsx` — selection reconcile in `removeGridColumn`/`removeGridRow`. **Task 5**
- `lib/store.test.ts` — reconcile tests. **Task 5**

---

### Task 1: Amend ADR-006 (overflow mechanism)

**Files:**
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` (append an amendment block at end of file)

**Interfaces:**
- Consumes: the design spec.
- Produces: the documented decision Tasks 2–4 implement.

- [ ] **Step 1: Append the amendment**

Append to the end of `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`:

```markdown
## Amendment (2026-06-27) — Plan 8: grid overflow = uniform cell-content shrink

Plan 8 replaces Plan 6's hard clip baseline with an auto-shrink backstop, and
revises the overflow mechanism in §8 / PRD Decision 1.

- **Why not page-scoped:** the PRD's "scale the whole page down" works for the
  legacy flow but NOT a proportional grid — scaling the page shrinks a cell and
  its text together, so the intra-cell overflow ratio is unchanged.
- **Mechanism:** `fitGrid` (in `lib/use-auto-fit.ts`, run by `useAutoFit` inside
  `BookCanvas`, so it executes in BOTH the editor preview and `/print`) measures
  each **callout-bearing** cell's content overflow ratio, takes the worst across
  the step, and applies ONE **grid-uniform** `transform: scale(f)` to every
  callout cell's `.grid-cell-content` (`f = max(MIN_GRID_SCALE, 1/worst)`,
  `MIN_GRID_SCALE = 0.5`). Image-only cells are exempt (they never overflow).
  Past the floor, content clips and the step is reported to the existing
  non-blocking overflow warning.
- **Callouts/text are fluid:** a callout is full cell width and wraps (CSS flow);
  shrink is the last resort, after reflow.
- This **supersedes the previously-rejected "per-cell local shrink"** (ADR-006
  Alternatives) with a uniform-across-cells *content* scale — which preserves the
  cross-cell consistency that motivated the original page-scoped choice. Grid
  track sizes (fractions) are author-controlled and never resized by fitGrid.
- **Scope:** drag/absolute positioning (Plan 9) and rich-text blocks (Plan 10)
  remain deferred; text will reflow + shrink through the same `.grid-cell-content`.
```

- [ ] **Step 2: Verify docs**

Run: `pnpm typecheck`
Expected: PASS (no code changed).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md
git commit -m "docs: amend ADR-006 for Plan 8 uniform cell-content overflow shrink"
```

---

### Task 2: `gridFitScale` helper + `MIN_GRID_SCALE`

**Files:**
- Modify: `lib/use-auto-fit.ts` (add near `MIN_SLOT_PX`, line 28)
- Test: `lib/use-auto-fit.test.ts` (create)

**Interfaces:**
- Produces: `export const MIN_GRID_SCALE = 0.5`; `export function gridFitScale(ratios: number[], minScale: number): number`. Consumed by `fitGrid` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `lib/use-auto-fit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gridFitScale, MIN_GRID_SCALE } from "@/lib/use-auto-fit";

describe("gridFitScale", () => {
  it("returns 1 when every cell fits (empty or ratio ≤ 1)", () => {
    expect(gridFitScale([], 0.5)).toBe(1);
    expect(gridFitScale([0.8, 1], 0.5)).toBe(1);
  });
  it("returns 1/worst for the worst overflow", () => {
    expect(gridFitScale([1.25, 1.5], 0.5)).toBeCloseTo(1 / 1.5, 6);
  });
  it("floors at minScale", () => {
    expect(gridFitScale([3], 0.5)).toBe(0.5);
  });
  it("MIN_GRID_SCALE is 0.5", () => {
    expect(MIN_GRID_SCALE).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run lib/use-auto-fit.test.ts`
Expected: FAIL — `gridFitScale`/`MIN_GRID_SCALE` not exported.

- [ ] **Step 3: Implement**

In `lib/use-auto-fit.ts`, after the `MIN_SLOT_PX` export (line 28):

```ts
/** Never shrink grid cell content below this scale; past it, clip + warn. */
export const MIN_GRID_SCALE = 0.5;

/** Uniform content-scale factor for a grid step, from its callout cells'
 *  overflow ratios (content height / cell height). 1 when all fit; else the
 *  worst cell drives `1/worst`, floored at `minScale`. */
export function gridFitScale(ratios: number[], minScale: number): number {
  const worst = Math.max(1, ...ratios);
  return worst <= 1 ? 1 : Math.max(minScale, 1 / worst);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run lib/use-auto-fit.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/use-auto-fit.ts lib/use-auto-fit.test.ts
git commit -m "feat: add gridFitScale helper and MIN_GRID_SCALE"
```

---

### Task 3: `.grid-cell-content` wrapper

Verified by `pnpm typecheck` + `pnpm build` + manual (renderer; no DOM unit test — consistent with `GridStep`).

**Files:**
- Modify: `components/renderer/GridStep.tsx` (the cell map, lines 25–44)
- Modify: `components/renderer/renderer.css` (`.grid-cell` block, lines 846–853)

**Interfaces:**
- Produces: a `.grid-cell-content` node inside every `.grid-cell`, holding the flow-stacked objects — the `transform` target for `fitGrid` (Task 4).

- [ ] **Step 1: Add the wrapper in GridStep**

In `components/renderer/GridStep.tsx`, wrap the cell's object map in a `.grid-cell-content` div:

```tsx
          {row.cells.map((cell, ci) => (
            <div className="grid-cell" key={ci} style={{ flexGrow: cell.widthFr }}>
              <div className="grid-cell-content">
                {cell.objects.map((obj) => {
                  if (obj.kind === "image") {
                    return (
                      <ImageSlot
                        key={obj.id}
                        src={imageSrc(assetBase, chapter.id, obj.ref)}
                        label="Screen"
                        path={displayPath(chapter.id, obj.ref)}
                        fit={obj.fit}
                      />
                    );
                  }
                  if (obj.kind === "callout" && obj.callout) {
                    return <Callout key={obj.id} data={obj.callout} />;
                  }
                  return null; // text objects: Plan 10
                })}
              </div>
            </div>
          ))}
```

- [ ] **Step 2: Move flex layout onto the wrapper (CSS)**

In `components/renderer/renderer.css`, replace the `.grid-cell` block (lines 846–853) with:

```css
.grid-cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  overflow: hidden; /* clips residual after fitGrid scales content (Plan 8) */
}
.grid-cell-content {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column; /* stack image + callouts vertically */
  gap: 4mm;
  transform-origin: top left; /* fitGrid scales from here (Plan 8) */
}
```

(Leave the `.grid-cell .img-slot` and `.fit-width`/`.fit-height` rules below it unchanged — they are descendant selectors and still match the `img-slot` inside the wrapper.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (a pre-existing `use-auto-fit` warning may appear; only NEW errors matter). Full suite still 74/74: `pnpm test --run`.

- [ ] **Step 4: Manual verification (record in the report)**

Run `pnpm dev`, open a grid step, verify:
1. **Pixel-identical** — a single-image cell still fills the cell exactly (the wrapper didn't shift it).
2. A cell with callouts still stacks them top-to-bottom with the 4mm gap, clipped at the cell edge (the Plan 6 baseline — fitGrid arrives in Task 4).
3. Resize dividers + cell-select still align (overlays measure `.grid-cell`, unchanged).

- [ ] **Step 5: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/renderer.css
git commit -m "feat: add grid-cell-content wrapper for fitGrid content scaling"
```

---

### Task 4: `fitGrid` DOM pass + wire into `useAutoFit`

Verified by `pnpm typecheck` + `pnpm build` + manual (DOM measurement — like `fitSteps`, no unit test; the math is covered by Task 2).

**Files:**
- Modify: `lib/use-auto-fit.ts` (add `fitGrid`; wire into `useAutoFit`'s `run()`, line ~134–138)

**Interfaces:**
- Consumes: `gridFitScale`, `MIN_GRID_SCALE` (Task 2); the `.grid-cell-content` wrapper (Task 3).
- Produces: `export function fitGrid(container: HTMLElement): string[]` (labels of grid steps still overflowing after the floor); merged into the existing `onReport`.

- [ ] **Step 1: Add `fitGrid`**

In `lib/use-auto-fit.ts`, after `fitSteps` (line ~112):

```ts
/** Grid analogue of fitSteps: for each grid step, scale every callout-bearing
 *  cell's `.grid-cell-content` by ONE grid-uniform factor (the worst cell's,
 *  floored at MIN_GRID_SCALE) so callouts fit; image-only cells are untouched.
 *  Returns the labels of grid steps still overflowing at the floor. */
export function fitGrid(container: HTMLElement): string[] {
  const overflows: string[] = [];

  container.querySelectorAll<HTMLElement>(".page.step").forEach((page) => {
    const gridStep = page.querySelector<HTMLElement>(".grid-step");
    if (!gridStep) return; // legacy step → handled by fitSteps

    // Only cells that contain a callout can overflow; image-only cells stay 1:1.
    const contents = [...gridStep.querySelectorAll<HTMLElement>(".grid-cell")]
      .filter((cell) => cell.querySelector(".callout"))
      .map((cell) => cell.querySelector<HTMLElement>(":scope > .grid-cell-content"))
      .filter((c): c is HTMLElement => c != null);
    if (contents.length === 0) return;

    // Reset before measuring so the ratios are at natural scale.
    contents.forEach((c) => { c.style.transform = ""; });
    const ratios = contents.map((c) => c.scrollHeight / c.clientHeight);
    const f = gridFitScale(ratios, MIN_GRID_SCALE);
    contents.forEach((c) => { c.style.transform = f < 1 ? `scale(${f})` : ""; });

    // Still overflows at the floor → warn (worst > 1/MIN_GRID_SCALE).
    if (f <= MIN_GRID_SCALE && Math.max(1, ...ratios) > 1 / MIN_GRID_SCALE) {
      overflows.push(page.getAttribute("data-screen-label") || "");
    }
  });

  return overflows;
}
```

- [ ] **Step 2: Wire into `useAutoFit`**

In `lib/use-auto-fit.ts`, in the `run` closure inside `useAutoFit` (currently `const overflows = fitSteps(el);`), merge both passes:

```ts
    const run = () => {
      if (cancelled) return;
      const overflows = [...fitSteps(el), ...fitGrid(el)];
      reportRef.current?.(overflows);
    };
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS. Full suite still 74/74 plus Task 2's: `pnpm test --run` (gridFitScale already added).

- [ ] **Step 4: Manual verification (record in the report)**

Run `pnpm dev`, then:
1. Add several long callouts to one **small** grid cell → its content (and every callout cell on that page, uniformly) shrinks to fit; image cells are unaffected.
2. Keep adding text past half scale → shrinking stops at 0.5 and the "N pages overflow" warning appears.
3. Remove the extra callouts → content scales back up to 1 (transform cleared).
4. **`/print`** (and PDF if Playwright is installed) applies the SAME shrink — no clipping, no editor affordance. If Playwright isn't available, note that and rely on the `/print` route.

- [ ] **Step 5: Commit**

```bash
git add lib/use-auto-fit.ts
git commit -m "feat: fitGrid uniform cell-content auto-shrink in preview and print"
```

---

### Task 5: Reconcile cell selection on row/column removal

**Files:**
- Modify: `lib/store.tsx` (`removeGridRow`/`removeGridColumn` actions, lines 349–354; add two pure helpers)
- Test: `lib/store.test.ts`

**Interfaces:**
- Consumes: `Selection` (store); `M.removeGridRow`/`M.removeGridColumn`.
- Produces: `removeGridRow`/`removeGridColumn` store actions that reconcile `selection.cellIndex`/`rowIndex` after a successful removal.

- [ ] **Step 1: Write the failing tests**

Add to `lib/store.test.ts` (reuse its store harness; build a grid with ≥2 rows/columns so the min-1 remover guard doesn't no-op):

```ts
it("removeGridColumn clears the selection when the selected column is removed", () => {
  const store = makeStore();
  store.getState().setStepLayoutMode(0, 0, "grid");
  store.getState().addGridColumn(0, 0, 0); // row 0 now has 2 cells
  store.getState().selectCell(0, 0, 0, 1);
  store.getState().removeGridColumn(0, 0, 0, 1);
  expect(store.getState().selection.cellIndex ?? null).toBeNull();
});

it("removeGridColumn decrements cellIndex when an earlier column is removed", () => {
  const store = makeStore();
  store.getState().setStepLayoutMode(0, 0, "grid");
  store.getState().addGridColumn(0, 0, 0); // 2 cells
  store.getState().selectCell(0, 0, 0, 1);
  store.getState().removeGridColumn(0, 0, 0, 0); // remove cell before the selected
  expect(store.getState().selection.cellIndex).toBe(0);
});

it("removeGridRow clears the cell selection when the selected row is removed", () => {
  const store = makeStore();
  store.getState().setStepLayoutMode(0, 0, "grid");
  store.getState().addGridRow(0, 0); // 2 rows
  store.getState().selectCell(0, 0, 1, 0);
  store.getState().removeGridRow(0, 0, 1);
  expect(store.getState().selection.cellIndex ?? null).toBeNull();
});

it("removeGridColumn leaves an unrelated selection untouched", () => {
  const store = makeStore();
  store.getState().setStepLayoutMode(0, 0, "grid");
  store.getState().addGridColumn(0, 0, 0);
  store.getState().selectCell(0, 0, 0, 0);
  store.getState().removeGridColumn(0, 0, 0, 1); // remove a later column
  expect(store.getState().selection.cellIndex).toBe(0);
});
```

(Adapt `makeStore()` to the file's actual harness, as in Plan 7 Task 2.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — the first/third clear-on-removal cases fail (selection currently unreconciled).

- [ ] **Step 3: Implement**

In `lib/store.tsx`, add two pure helpers near the top (after the imports / before `createStore`, alongside any existing helpers like `clamp`):

```ts
function reconcileColumnRemoval(sel: Selection, ci: number, si: number, ri: number, cellIndex: number): Selection {
  if (sel.chapterIndex !== ci || sel.stepIndex !== si || sel.rowIndex !== ri || sel.cellIndex == null) return sel;
  if (sel.cellIndex === cellIndex) return { ...sel, cellIndex: null };
  if (sel.cellIndex > cellIndex) return { ...sel, cellIndex: sel.cellIndex - 1 };
  return sel;
}

function reconcileRowRemoval(sel: Selection, ci: number, si: number, ri: number): Selection {
  if (sel.chapterIndex !== ci || sel.stepIndex !== si || sel.rowIndex == null) return sel;
  if (sel.rowIndex === ri) return { ...sel, cellIndex: null };
  if (sel.rowIndex > ri) return { ...sel, rowIndex: sel.rowIndex - 1 };
  return sel;
}
```

Replace the two store actions (lines 349–354) so they reconcile selection ONLY when the removal actually happened (the mutation returns a new book ref on success, the same ref on a min-1 no-op):

```ts
    removeGridRow: (ci, si, ri) =>
      set((s) => {
        const book = M.removeGridRow(s.book, ci, si, ri);
        if (book === s.book) return { book };
        return { book, selection: reconcileRowRemoval(s.selection, ci, si, ri) };
      }),
    removeGridColumn: (ci, si, ri, cellIndex) =>
      set((s) => {
        const book = M.removeGridColumn(s.book, ci, si, ri, cellIndex);
        if (book === s.book) return { book };
        return { book, selection: reconcileColumnRemoval(s.selection, ci, si, ri, cellIndex) };
      }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS. Full suite green: `pnpm test --run`.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/store.test.ts
git commit -m "fix: reconcile cell selection on grid row/column removal"
```

---

## Plan Self-Review

**Spec coverage:**
- ADR-006 amendment (mechanism) → Task 1. ✓
- `gridFitScale` + `MIN_GRID_SCALE` (grid-uniform, floored) → Task 2. ✓
- `.grid-cell-content` wrapper (fluid stack, scale target) + pixel-identical → Task 3. ✓
- `fitGrid` (callout-cell-only, uniform scale, reset/measure/apply, floor→warn, runs preview+print via `useAutoFit`) → Task 4. ✓
- Image cells exempt (filter on `.callout`) → Task 4. ✓
- Folded-in stale-selection reconcile → Task 5. ✓
- Deferred (drag, text, columnize) → not in any task. ✓
- No `Book` schema change → confirmed. ✓

**Placeholder scan:** every code step shows complete code; commands have expected output; the one adaptation note (store.test.ts harness in Task 5) is explicit, mirroring Plan 7.

**Type consistency:** `gridFitScale(ratios: number[], minScale: number): number` and `MIN_GRID_SCALE` match between Task 2 (def) and Task 4 (use); `fitGrid(container: HTMLElement): string[]` merges into the same `onReport` array as `fitSteps`; the reconcile helpers take/return `Selection` and are wired with the same `(ci, si, ri[, cellIndex])` arg order as the remover actions; `.grid-cell-content` is the class produced in Task 3 and targeted in Task 4.
