# Grid Renderer (read-only, opt-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a step's flexible grid (`step.grid`) on the page — rows by `heightFr`, cells by `widthFr`, each cell's primary image filling the cell — but only when a step is explicitly switched to grid mode, so every existing book renders pixel-identically through the proven path.

**Architecture:** Add a per-step `layoutMode` (`"legacy" | "grid"`, default unset → legacy). `StepPage` keeps its existing `ImageRow` path for legacy steps and renders a new read-only `GridStep` component for grid-mode steps. A pure helper resolves the effective mode; another extracts a cell's primary image. A small step-editor toggle flips the mode so the new renderer is visible in the live preview. **Out of scope (later plans):** on-canvas divider resize, moving callouts into cell object-stacks, the `fitSteps`→`fitGrid` backstop. Image cells are overflow-free by construction (fractions of a fixed body region + `object-fit: contain`), so no backstop is needed yet.

**Tech Stack:** TypeScript, vitest, Next.js 15 / React 19 (server + client components), Zustand, plain CSS.

## Global Constraints

- **Zero regression (structural):** migrated/existing books leave `layoutMode` unset and render through the unchanged `StepPage`/`ImageRow` path. Grid rendering activates ONLY for a step explicitly set to `"grid"`. No legacy rendering path is modified except to add the mode branch.
- **Grid model is fixed (Plan 1):** `GridRow { heightFr; cells: GridCell[] }`, `GridCell { widthFr; objects: StackedObject[] }`, `StackedObject { id; role; kind; x; y; w; h; ref?; annotations? }`. Σ`heightFr` = 1 per step; Σ`widthFr` = 1 per row. Do not change these.
- **Read-only:** the renderer never writes back to the store. No resize, no fractional-height mutation.
- **ADR-first:** a grid-model change (the new `layoutMode` field + opt-in rendering rule) is recorded as an ADR-006 amendment in Task 1 before/with the schema change (per CLAUDE.md).
- **Immutability:** store actions and mutation helpers return new objects.
- **`Book` JSON is source of truth;** HTML/PDF are derived.
- Module alias `@/*` → repo root.
- Conventional Commits; **NO AI attribution / no Co-Authored-By trailer**.
- Before each commit: `pnpm test --run` (all green) AND `pnpm typecheck` (exit 0); for tasks touching components/CSS, also `pnpm build` (succeeds).

---

## File structure

- Modify `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` — amendment documenting opt-in `layoutMode`.
- Modify `lib/book-schema.ts` — add `Step.layoutMode`; add `stepLayoutMode(step)`; retune the `grid?` JSDoc.
- Modify `lib/book-schema.test.ts` — `stepLayoutMode` tests.
- Create `lib/grid-render.ts` + `lib/grid-render.test.ts` — `cellPrimaryImage(cell)`.
- Create `components/renderer/GridStep.tsx` — the read-only grid renderer.
- Modify `components/renderer/renderer.css` — `.grid-step` / `.grid-row` / `.grid-cell` rules.
- Modify `components/renderer/StepPage.tsx` — branch to `GridStep` in grid mode.
- Modify `lib/book-mutations.ts` + `lib/store.tsx` — widen `updateStep` patch to include `layoutMode`.
- Modify `lib/store.test.ts` — `updateStep` layoutMode test.
- Modify `components/editor/StepEditor.tsx` — Layout toggle.

---

### Task 1: `layoutMode` schema field + `stepLayoutMode` helper + ADR-006 amendment

**Files:**
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`
- Modify: `lib/book-schema.ts`
- Modify: `lib/book-schema.test.ts`

**Interfaces:**
- Produces: `Step.layoutMode?: "legacy" | "grid"`; `stepLayoutMode(step: Step): "legacy" | "grid"`.

- [ ] **Step 1: Amend ADR-006**

Read `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`, then append this section after the existing decision/consequences content (keep all existing text):

```markdown
## Amendment (2026-06-25) — Opt-in `layoutMode` for grid rendering

Plan 3 introduces the grid *renderer* (read-only). Because migration stamps a
`grid` skeleton on every step (image-only), "render the grid whenever `grid` is
present" would switch every existing book to grid rendering at once and regress
callout layout. Grid rendering is therefore **gated on an explicit per-step
`layoutMode`**:

- `Step.layoutMode?: "legacy" | "grid"`; effective mode = `layoutMode ?? "legacy"`.
- Migration leaves `layoutMode` unset → existing steps render through the proven
  `StepPage`/`ImageRow` path, pixel-identical (structural zero regression).
- The renderer switches to `GridStep` only for steps explicitly set to `"grid"`.
- Plan 3 renders **image cells only**. Moving callouts into the cell object stack,
  on-canvas divider resize, and the `fitSteps`→`fitGrid` backstop are later plans.
  Image cells are overflow-free by construction (fractions of a fixed body region
  + `object-fit: contain`), so no backstop is required yet.

This supersedes the original `grid?` field note "When present, overrides
images[]": presence alone no longer switches rendering; `layoutMode` does.
```

- [ ] **Step 2: Write the failing test**

Add to `lib/book-schema.test.ts`:

```ts
import { stepLayoutMode, type Step } from "@/lib/book-schema";

describe("stepLayoutMode", () => {
  it("defaults to legacy when unset", () => {
    expect(stepLayoutMode({} as Step)).toBe("legacy");
  });
  it("returns grid when explicitly grid", () => {
    expect(stepLayoutMode({ layoutMode: "grid" } as Step)).toBe("grid");
  });
  it("returns legacy when explicitly legacy", () => {
    expect(stepLayoutMode({ layoutMode: "legacy" } as Step)).toBe("legacy");
  });
});
```

(If `book-schema.test.ts` already imports from `@/lib/book-schema`, extend that import rather than adding a duplicate line.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test --run lib/book-schema.test.ts`
Expected: FAIL — `stepLayoutMode` is not exported.

- [ ] **Step 4: Add the field + helper**

In `lib/book-schema.ts`, in the `Step` interface, retune the `grid?` JSDoc and add `layoutMode` right after `freeAnnotations`:

```ts
  /** Flexible grid (rows × cells). Rendered only when layoutMode === "grid"
   *  (see stepLayoutMode); presence alone does not switch rendering. */
  grid?: GridRow[];
  /** Free annotation layer (0–1 of the body region), constrained to grid bounds. */
  freeAnnotations?: Annotation[];
  /** Which renderer lays out this step. Unset → "legacy" (the proven ImageRow
   *  path). "grid" renders `grid` via <GridStep>. Gated explicitly so migrated
   *  books (which all carry a grid skeleton) stay pixel-identical. */
  layoutMode?: "legacy" | "grid";
```

Then add the helper near the other pure Step/layout helpers (e.g. just after `resolveLayout`):

```ts
/** Effective layout mode for a step. Unset/any non-"grid" → "legacy"
 *  (the zero-regression default). */
export function stepLayoutMode(step: Step): "legacy" | "grid" {
  return step.layoutMode === "grid" ? "grid" : "legacy";
}
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-schema.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md lib/book-schema.ts lib/book-schema.test.ts
git commit -m "feat: add opt-in step layoutMode + stepLayoutMode helper (ADR-006 amendment)"
```

---

### Task 2: `cellPrimaryImage` render helper

**Files:**
- Create: `lib/grid-render.ts`
- Create: `lib/grid-render.test.ts`

**Interfaces:**
- Consumes: `GridCell`, `StackedObject` (`@/lib/book-schema`).
- Produces: `cellPrimaryImage(cell: GridCell): StackedObject | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/grid-render.test.ts
import { describe, it, expect } from "vitest";
import { cellPrimaryImage } from "@/lib/grid-render";
import type { GridCell } from "@/lib/book-schema";

const imageObj = (ref?: string) => ({
  id: "o1", role: "primary" as const, kind: "image" as const,
  x: 0, y: 0, w: 1, h: 1, ref,
});

describe("cellPrimaryImage", () => {
  it("returns the primary image object", () => {
    const cell: GridCell = { widthFr: 1, objects: [imageObj("a.jpg")] };
    expect(cellPrimaryImage(cell)?.ref).toBe("a.jpg");
  });
  it("returns undefined for an empty cell", () => {
    const cell: GridCell = { widthFr: 1, objects: [] };
    expect(cellPrimaryImage(cell)).toBeUndefined();
  });
  it("ignores secondary / non-image objects", () => {
    const cell: GridCell = {
      widthFr: 1,
      objects: [{ id: "c", role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1 }],
    };
    expect(cellPrimaryImage(cell)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/grid-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/grid-render.ts
/** Pure helpers for the read-only grid renderer (Plan 3). */
import type { GridCell, StackedObject } from "./book-schema";

/** The cell's primary image object, or undefined for an empty / image-less cell. */
export function cellPrimaryImage(cell: GridCell): StackedObject | undefined {
  return cell.objects.find((o) => o.kind === "image" && o.role === "primary");
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/grid-render.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/grid-render.ts lib/grid-render.test.ts
git commit -m "feat: cellPrimaryImage grid-render helper"
```

---

### Task 3: `GridStep` renderer component + CSS

**Files:**
- Create: `components/renderer/GridStep.tsx`
- Modify: `components/renderer/renderer.css`

This task is verified by `pnpm build` (no unit test — the pure parts it relies on are covered by Task 2). `GridStep` is a server component (like `StepPage`/`ImageRow`); do NOT add `"use client"`.

**Interfaces:**
- Consumes: `GridRow`, `Chapter` (`@/lib/book-schema`); `imageSrc`, `displayPath` (`@/lib/book-render`); `cellPrimaryImage` (`@/lib/grid-render`); `ImageSlot` (`./ImageSlot`).
- Produces: `<GridStep grid={GridRow[]} chapter={Chapter} assetBase={string} />`.

- [ ] **Step 1: Create the component**

```tsx
// components/renderer/GridStep.tsx
/*
 * Read-only renderer for a step's flexible grid (Plan 3): rows distribute by
 * heightFr, cells by widthFr (flex-grow), each cell's primary image fills the
 * cell (object-fit: contain). Image cells are overflow-free by construction.
 * Resize, callouts-in-cells, and the fitGrid backstop are later plans.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import { cellPrimaryImage } from "@/lib/grid-render";
import ImageSlot from "./ImageSlot";

export default function GridStep({
  grid,
  chapter,
  assetBase,
}: {
  grid: GridRow[];
  chapter: Chapter;
  assetBase: string;
}) {
  return (
    <div className="grid-step">
      {grid.map((row, ri) => (
        <div className="grid-row" key={ri} style={{ flexGrow: row.heightFr }}>
          {row.cells.map((cell, ci) => {
            const primary = cellPrimaryImage(cell);
            return (
              <div
                className="grid-cell"
                key={ci}
                style={{ flexGrow: cell.widthFr }}
              >
                {primary ? (
                  <ImageSlot
                    key={`${ri}-${ci}-${primary.ref ?? ""}`}
                    src={imageSrc(assetBase, chapter.id, primary.ref)}
                    label="Screen"
                    path={displayPath(chapter.id, primary.ref)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the CSS**

Append to `components/renderer/renderer.css` (near the existing `.step-body` / `.step-row` rules):

```css
/* Flexible grid (read-only renderer, Plan 3). Fills the body region in place of
   .step-body; rows/cells distribute by fr via flex-grow (set inline). Image
   cells contain-fit, so the grid is overflow-free by construction. */
.grid-step {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4mm;
}
.grid-row {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  gap: 4mm;
}
.grid-cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}
.grid-cell .img-slot {
  width: 100%;
  height: 100%;
}
.grid-cell .img-slot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

(The inline `flexGrow` from the component overrides only the grow longhand; `flex: 1 1 0` keeps basis 0 + shrink 1, so distribution is proportional to `heightFr` / `widthFr`.)

- [ ] **Step 3: Verify the build**

Run: `pnpm build && pnpm typecheck`
Expected: both succeed. (`GridStep` is not yet referenced by any route — that wiring is Task 4 — so this only confirms it compiles and the CSS is valid.)

- [ ] **Step 4: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/renderer.css
git commit -m "feat: read-only GridStep renderer + grid CSS"
```

---

### Task 4: Branch `StepPage` to `GridStep` in grid mode

**Files:**
- Modify: `components/renderer/StepPage.tsx`

Verified by `pnpm build` + `pnpm typecheck`. Legacy rendering must be untouched except for the added branch.

**Interfaces:**
- Consumes: `stepLayoutMode` (`@/lib/book-schema`), `GridStep` (`./GridStep`).

- [ ] **Step 1: Add the imports**

In `components/renderer/StepPage.tsx`, add `stepLayoutMode` to the existing `@/lib/book-schema` import (it currently imports types; add the value import — a separate `import { stepLayoutMode } from "@/lib/book-schema";` line is fine since the existing one is `import type`), and import the component:

```ts
import { stepLayoutMode } from "@/lib/book-schema";
import GridStep from "./GridStep";
```

- [ ] **Step 2: Branch the body**

Still compute `const { rows, showRowHead } = resolveStepRows(step);` as today. Add `const mode = stepLayoutMode(step);` After the `<h2 className="step-title">` + instruction block, replace the existing `<div className="step-body"> … rows.map … </div>` with:

```tsx
        {mode === "grid" && step.grid && step.grid.length > 0 ? (
          <GridStep grid={step.grid} chapter={chapter} assetBase={assetBase} />
        ) : (
          <div className="step-body">
            {rows.map((row, i) => (
              <ImageRow
                key={i}
                chapter={chapter}
                row={row}
                showHead={showRowHead}
                assetBase={assetBase}
              />
            ))}
          </div>
        )}
```

Leave `PageBackground`, `Watermark`, `step-head`, title, instruction, `PageFooter`, and the page-level `<AnnotationLayer annotations={step.annotations} />` exactly as they are. (Grid mode keeps the same page-level annotation overlay; cell-anchored annotations are a later plan.)

Note for the implementer: a grid-mode page has no `.step-body` element, so the legacy `fitSteps` pass (which early-returns when `.step-body` is absent) naturally skips grid pages — no change to `use-auto-fit.ts` is needed or wanted.

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test --run`
Expected: all succeed/green.

- [ ] **Step 4: Commit**

```bash
git add components/renderer/StepPage.tsx
git commit -m "feat: render GridStep for grid-mode steps; legacy path unchanged"
```

---

### Task 5: `updateStep` layoutMode wiring + step-editor Layout toggle

**Files:**
- Modify: `lib/book-mutations.ts`
- Modify: `lib/store.tsx`
- Modify: `lib/store.test.ts`
- Modify: `components/editor/StepEditor.tsx`

**Interfaces:**
- Consumes: `stepLayoutMode` (`@/lib/book-schema`), `updateStep` (store).
- Produces: `updateStep(ci, si, { layoutMode })` accepted end-to-end; a Layout `<select>` in the step editor.

- [ ] **Step 1: Write the failing store test**

Add to `lib/store.test.ts` (build a book with one chapter + one step):

```ts
import { createEditorStore } from "@/lib/store";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

const bookWithStep: Book = {
  schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c", title: "C", description: "", steps: [{ title: "S" }] }],
};

describe("updateStep layoutMode", () => {
  it("sets layoutMode on the step immutably", () => {
    const store = createEditorStore(bookWithStep, "slug");
    store.getState().updateStep(0, 0, { layoutMode: "grid" });
    expect(store.getState().book.chapters[0].steps[0].layoutMode).toBe("grid");
    // input book not mutated
    expect(bookWithStep.chapters[0].steps[0].layoutMode).toBeUndefined();
  });
});
```

(If `store.test.ts` already imports `createEditorStore` / `DEFAULT_PAGE_CONFIG`, extend those imports instead of duplicating.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — TypeScript rejects `layoutMode` in the `updateStep` patch (type error) or the field is not set.

- [ ] **Step 3: Widen the patch type in both layers**

In `lib/book-mutations.ts`, widen `updateStep`'s patch type (the body already spreads/assigns the patch onto the step — confirm it merges generically; only the type needs widening):

```ts
  patch: Partial<Pick<Step, "title" | "instruction" | "layoutMode">>,
```

In `lib/store.tsx`, widen the `updateStep` signature on the `EditorState` interface to match:

```ts
  updateStep: (
    ci: number,
    si: number,
    patch: Partial<Pick<Step, "title" | "instruction" | "layoutMode">>,
  ) => void;
```

(The store's `updateStep` implementation already delegates to `M.updateStep`, so no body change there.)

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Add the Layout toggle to the step editor**

In `components/editor/StepEditor.tsx`, add the import:

```ts
import { stepLayoutMode } from "@/lib/book-schema";
```

and insert a Layout field after the “Page instruction” field and before the `<h3 className="editor-subtitle">Rows</h3>` heading:

```tsx
      <div className="editor-field">
        <label>Layout</label>
        <select
          value={stepLayoutMode(step)}
          onChange={(e) =>
            updateStep(ci, si, { layoutMode: e.target.value as "legacy" | "grid" })
          }
        >
          <option value="legacy">Legacy (rows)</option>
          <option value="grid">Grid (preview)</option>
        </select>
        <p className="editor-help">
          Grid renders image cells from the flexible grid. Callouts and
          drag-resize are coming in a later update.
        </p>
      </div>
```

(If the editor already uses a help/hint text class — check a neighbor like `BookSettings.tsx`/`PageSettings.tsx` — reuse that class name; if none exists, plain `<p>` text is acceptable. Do NOT invent a styled class.)

- [ ] **Step 6: Verify everything**

Run: `pnpm test --run && pnpm typecheck && pnpm build`
Expected: all green. Manual check (note in PR): selecting **Grid (preview)** on a step makes the live preview render that step as a grid of image cells; switching back to **Legacy** restores the row layout; other steps and existing projects are unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/book-mutations.ts lib/store.tsx lib/store.test.ts components/editor/StepEditor.tsx
git commit -m "feat: step Layout toggle (legacy/grid) wired through updateStep"
```

---

## Self-review (done)

- **Spec coverage:** opt-in mode field + helper ✓ (T1, ADR-amended), primary-image extraction ✓ (T2), grid renderer + CSS ✓ (T3), renderer branch ✓ (T4), store wiring + editor toggle ✓ (T5).
- **Zero-regression:** legacy is the default; the only change to the legacy render path is the added `mode === "grid"` branch (false for every migrated/existing step, since migration never sets `layoutMode`). `fitSteps` skips grid pages (no `.step-body`). Stated in T4.
- **Read-only:** no store writes from the renderer; no fractional mutation. Resize/callouts-in-cells/fitGrid explicitly deferred (ADR amendment + this header).
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `stepLayoutMode`, `cellPrimaryImage`, `GridStep` prop names, and the widened `updateStep` patch agree across tasks and with the Plan-1 grid types (`GridRow.heightFr`, `GridCell.widthFr`, `StackedObject.kind/role/ref`).

## Carry-forward (not this plan)

- **On-canvas divider resize** (conserved-total via `resizeAdjacent`/`redistributeProportional`, live mm readout) — next plan.
- **Callouts (and text) as cell object-stacks** with in-cell drag; migrating legacy `callouts` into `secondary` objects; this is where `fitSteps`→`fitGrid` becomes necessary (cells gain overflow-capable content).
- **Cell-anchored annotations** + the free annotation layer (`step.freeAnnotations`).
- **New-project grid default** + grid-visibility guides toggle.
