# Grid Cell Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render callouts inside grid cells, add a per-image fit mode, and migrate legacy callouts into cells — so a step toggled to grid keeps its callouts.

**Architecture:** Extends the read-only grid renderer (Plan 3). `StackedObject` gains a `callout` payload and an image `fit` field; `GridStep` renders every object in a cell's stack (image via `ImageSlot`, callout via `Callout`); `legacyStepToGrid` maps legacy side/below callouts into cells; `setStepLayoutMode` rebuilds the grid from legacy fields on toggle so callouts carry over. Auto-shrink (`fitGrid`), the crop-confirmation UI, in-cell drag, and rich text are explicitly later plans.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind v4 (CSS-first), Zustand vanilla store, vitest (node env, `lib/**/*.test.ts`, `@/*` alias), Playwright (PDF).

**Design spec:** `docs/superpowers/specs/2026-06-25-grid-cell-objects-design.md`. **ADR:** ADR-006 (amended in Task 1).

## Global Constraints

- **Commits:** Conventional Commits; **NO AI attribution / no Co-Authored-By trailer.**
- **Immutability:** every `book-mutations` function returns a new `Book` via the `clone` helper (`structuredClone`); never mutate input. Callout payloads copied (`{ ...c }`), not shared by reference.
- **Schema/grid change → ADR first:** Task 1 (ADR-006 amendment + PRD update) lands before any code.
- **Grid invariants:** Σ `heightFr` = 1 per step, Σ `widthFr` = 1 per row — always produce these via `normalizeFractions`.
- **Pixel-identical:** existing image-only grids render visually unchanged. Default `fit` is `"contain"` and `imageFitClass(undefined)` returns `""` (no class), so the single-primary-image markup is unchanged; the `.grid-cell` flex-direction change is confirmed by manual comparison.
- **Print-clean:** all renderer changes are additive cell rendering in `components/renderer/**`; no editor-only affordance is added, so nothing new can leak into `/print` or the PDF.
- **Scope (Plan 6 only):** NO `fitGrid` auto-shrink engine, NO crop-confirmation UI, NO add/remove/drag objects, NO rich-text (`kind:"text"`) rendering. Those are Plans 7–8.
- **Verification:** trust only real `pnpm test --run` + `pnpm typecheck`; the harness `<new-diagnostics>` LSP messages are stale RED-phase snapshots — ignore them.
- **Suite baseline:** 48 unit tests pass today; this plan adds ~10.

## File Structure

- `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` — amend (fit field, never-clip split, migration mapping). **Task 1**
- `PRD.md` — update A.1 schema, Decision 1 / acceptance line 134, A.4 migration. **Task 1**
- `lib/book-schema.ts` — add `ImageFit`, `DEFAULT_IMAGE_FIT`, `StackedObject.callout?`, `StackedObject.fit?`. **Task 2**
- `lib/book-schema.test.ts` — assert `DEFAULT_IMAGE_FIT`. **Task 2**
- `lib/grid-render.ts` — add `imageFitClass(fit?)`. **Task 3**
- `lib/grid-render.test.ts` — test `imageFitClass`. **Task 3**
- `lib/book-migrate.ts` — extend `legacyStepToGrid` (callouts → cells). **Task 4**
- `lib/book-migrate.test.ts` — side / below / mixed / no-callout cases. **Task 4**
- `lib/book-mutations.ts` — `setStepLayoutMode` rebuild-on-toggle. **Task 5**
- `lib/book-mutations.test.ts` — toggle carries callouts / preserves grid edits / immutable. **Task 5**
- `components/renderer/GridStep.tsx` — render all cell objects (image+callout). **Task 6**
- `components/renderer/ImageSlot.tsx` — add `fit?` prop. **Task 6**
- `components/renderer/renderer.css` — `.grid-cell` column/gap/clip + `.fit-width`/`.fit-height`. **Task 6**

---

### Task 1: Amend ADR-006 + PRD (design of record)

The schema/grid-model change must be recorded before code (project rule). This task only edits docs.

**Files:**
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` (append an amendment block at end of file)
- Modify: `PRD.md` (A.1 `StackedObject`, Decision 1 / acceptance line ~134, A.4 migration)

**Interfaces:**
- Consumes: the design spec `docs/superpowers/specs/2026-06-25-grid-cell-objects-design.md`.
- Produces: documented decisions that Tasks 2–6 implement (field names `callout`, `fit`, `ImageFit` values `contain|fit-width|fit-height`; side/below Rule 1 migration).

- [ ] **Step 1: Append the ADR-006 amendment**

Append to the end of `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`:

```markdown
## Amendment (2026-06-25) — Plan 6: cell callout objects + image fit mode

Plan 6 implements §3 (cell object stack) for callouts and adds a per-image fit mode.

- **Schema:** `StackedObject` gains `callout?: Callout` (payload when `kind:"callout"`) and
  `fit?: "contain" | "fit-width" | "fit-height"` (default `"contain"`). `fit-width` spans the
  cell width and crops overflow height (bottom); `fit-height` spans the height and crops overflow
  width (right).
- **never-clip is refined:** text/callout content is never *accidentally* clipped — the page-scoped
  auto-shrink backstop (`fitSteps` → `fitGrid`, DOM-only, Plan 7) guarantees it. Images may be
  *deliberately* cropped via `fit`. This narrows §8 / PRD Decision 1: clipping is an intentional
  image affordance, not an overflow outcome.
- **Migration mapping (normative):** legacy callouts move into cells by placement —
  **side** → the source row becomes `[image cell(s) │ side-callouts cell]`, `widthFr` from the
  legacy slot mm (single 60:110, single-wide 110:60, double 55:55:60).
  **below** → the source row becomes an image row **plus** a callout row of `calloutCols`
  equal-width cells; callouts are assigned round-robin (`k mod calloutCols`), per-callout `span`
  is dropped, image-row:callout-row height = 2:1 (Rule 1). **mixed** combines both.
  Below-callout numbered markers are not rendered in cells (no grid pin equivalent yet).
- **Scope:** Plan 6 renders objects + migrates. The `fitGrid` auto-shrink engine, the crop
  confirmation UI, in-cell drag, and rich-text (`kind:"text"`) are Plans 7–8.
```

- [ ] **Step 2: Update PRD A.1 schema**

In `PRD.md` Appendix A.1, the `StackedObject` interface — add the two fields and the type. Change the `interface StackedObject { ... }` block to include:

```ts
  callout?: Callout;                          // payload when kind === "callout"
  fit?: "contain" | "fit-width" | "fit-height"; // image fit; default "contain"
```

- [ ] **Step 3: Update PRD overflow wording + acceptance criterion**

In `PRD.md`, update the never-clip statements to the text-vs-image split. Edit the shrink-to-fit bullet (the "Shrink-to-fit backstop" line) and the acceptance line that reads "the page is never clipped" to add: *"Text/callout content is never accidentally clipped (auto shrink-to-fit); images may be deliberately cropped via an author-set `fit`."*

- [ ] **Step 4: Update PRD A.4 migration rule**

In `PRD.md` Appendix A.4, replace the bullet "Callouts become `secondary` objects in the cell" with the side/below Rule 1 mapping (copy the migration paragraph from the ADR amendment in Step 1).

- [ ] **Step 5: Verify docs**

Run: `pnpm typecheck`
Expected: PASS (no code changed; confirms the doc edits didn't touch TS by accident).

- [ ] **Step 6: Commit**

```bash
git add docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md PRD.md
git commit -m "docs: amend ADR-006 + PRD for Plan 6 cell callouts and image fit"
```

---

### Task 2: Schema — `callout` + `fit` fields on `StackedObject`

**Files:**
- Modify: `lib/book-schema.ts` (the `StackedObject` interface at ~lines 202–216; add `ImageFit` type + `DEFAULT_IMAGE_FIT` const near the other defaults ~line 420)
- Test: `lib/book-schema.test.ts`

**Interfaces:**
- Consumes: existing `Callout` interface (`lib/book-schema.ts`).
- Produces: `type ImageFit = "contain" | "fit-width" | "fit-height"`; `const DEFAULT_IMAGE_FIT: ImageFit = "contain"`; `StackedObject.callout?: Callout`; `StackedObject.fit?: ImageFit`. Consumed by Tasks 3–6.

- [ ] **Step 1: Write the failing test**

Add to `lib/book-schema.test.ts` (match its existing `import { ... } from "@/lib/book-schema"` style):

```ts
import { DEFAULT_IMAGE_FIT } from "@/lib/book-schema";

describe("DEFAULT_IMAGE_FIT", () => {
  it("defaults images to maintain-ratio (contain)", () => {
    expect(DEFAULT_IMAGE_FIT).toBe("contain");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run lib/book-schema.test.ts`
Expected: FAIL — `DEFAULT_IMAGE_FIT` is not exported.

- [ ] **Step 3: Add the type + default**

In `lib/book-schema.ts`, add the `ImageFit` type immediately above the `StackedObject` interface:

```ts
/** How an image object fills its cell. `fit-width`/`fit-height` crop the overflow
 *  axis (bottom / right respectively); `contain` letterboxes (never crops). */
export type ImageFit = "contain" | "fit-width" | "fit-height";
```

Add two fields to the `StackedObject` interface (after `ref?: string;`):

```ts
  /** Callout payload when kind === "callout". */
  callout?: Callout;
  /** Image fit mode (kind === "image"); default "contain". */
  fit?: ImageFit;
```

Add the default near the other `DEFAULT_*` consts (after `DEFAULT_BORDER`):

```ts
export const DEFAULT_IMAGE_FIT: ImageFit = "contain";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run lib/book-schema.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/book-schema.ts lib/book-schema.test.ts
git commit -m "feat: add StackedObject callout payload and image fit field"
```

---

### Task 3: `imageFitClass` helper

A pure mapping from `ImageFit` to a CSS modifier class. Returning `""` for `contain`/undefined is what guarantees the single-image markup stays unchanged.

**Files:**
- Modify: `lib/grid-render.ts`
- Test: `lib/grid-render.test.ts`

**Interfaces:**
- Consumes: `ImageFit` (Task 2).
- Produces: `imageFitClass(fit?: ImageFit): string` → `""` | `"fit-width"` | `"fit-height"`. Consumed by `ImageSlot` (Task 6).

- [ ] **Step 1: Write the failing test**

Add to `lib/grid-render.test.ts` (it already imports from `@/lib/grid-render`):

```ts
import { imageFitClass } from "@/lib/grid-render";

describe("imageFitClass", () => {
  it("returns '' for contain / undefined (markup unchanged)", () => {
    expect(imageFitClass()).toBe("");
    expect(imageFitClass("contain")).toBe("");
  });
  it("maps the crop modes to their class", () => {
    expect(imageFitClass("fit-width")).toBe("fit-width");
    expect(imageFitClass("fit-height")).toBe("fit-height");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run lib/grid-render.test.ts`
Expected: FAIL — `imageFitClass` is not exported.

- [ ] **Step 3: Implement**

In `lib/grid-render.ts`, change the type import and add the function:

```ts
import type { GridCell, ImageFit, StackedObject } from "./book-schema";

// ...existing cellPrimaryImage unchanged...

/** CSS modifier class for an image object's fit mode. "" for contain/undefined,
 *  which keeps the default `object-fit: contain` markup unchanged. */
export function imageFitClass(fit?: ImageFit): string {
  return fit === "fit-width" ? "fit-width" : fit === "fit-height" ? "fit-height" : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run lib/grid-render.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/grid-render.ts lib/grid-render.test.ts
git commit -m "feat: add imageFitClass grid-render helper"
```

---

### Task 4: Migrate legacy callouts into cells (`legacyStepToGrid`)

Rewrite `legacyStepToGrid` so each legacy source row produces image cell(s) plus callout cells per placement (side / below Rule 1 / mixed). No-callout output stays identical to today.

**Files:**
- Modify: `lib/book-migrate.ts` (`legacyStepToGrid` at lines 40–62; `imageObject` helper at 26–37; imports at 12–24)
- Test: `lib/book-migrate.test.ts`

**Interfaces:**
- Consumes: `Callout`, `CalloutLayout`, `GridCell`, `GridRow`, `ImageRow`, `StackedObject`, `Step`, `DEFAULT_CALLOUT_LAYOUT`, `DEFAULT_CALLOUT_COLS`, `resolveLayout` (book-schema); `annotationId` (annotations); `normalizeFractions` (grid-math); the `callout?` field (Task 2).
- Produces: same signature `legacyStepToGrid(step: Step): GridRow[]`, now placing callouts. Consumed by `migrateBook` (unchanged caller) and `setStepLayoutMode` (Task 5).

- [ ] **Step 1: Write the failing tests**

Add to `lib/book-migrate.test.ts` inside (or after) the existing `describe("legacyStepToGrid", ...)`:

```ts
import { DEFAULT_CALLOUT_COLS } from "@/lib/book-schema";

describe("legacyStepToGrid — callouts", () => {
  const info = (body: string) => ({ type: "info" as const, body });

  it("side callouts → [image | callouts] cells, image narrow", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [info("one"), info("two")], calloutLayout: "side",
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "a.jpg" });
    expect(grid[0].cells[0].widthFr).toBeCloseTo(60 / 170, 6);
    expect(grid[0].cells[1].widthFr).toBeCloseTo(110 / 170, 6);
    expect(grid[0].cells[1].objects).toHaveLength(2);
    expect(grid[0].cells[1].objects[0]).toMatchObject({
      role: "secondary", kind: "callout",
    });
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "one" });
  });

  it("below callouts → image row + Rule-1 callout row, round-robin", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [info("c0"), info("c1"), info("c2")],
      calloutLayout: "below", calloutCols: 2,
    });
    expect(grid).toHaveLength(2);
    // image row
    expect(grid[0].cells).toHaveLength(1);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "a.jpg" });
    // callout row: 2 cells, round-robin c0->cell0, c1->cell1, c2->cell0
    expect(grid[1].cells).toHaveLength(2);
    expect(grid[1].cells[0].objects.map((o) => o.callout?.body)).toEqual(["c0", "c2"]);
    expect(grid[1].cells[1].objects.map((o) => o.callout?.body)).toEqual(["c1"]);
    // height 2:1
    expect(grid[0].heightFr).toBeCloseTo(2 / 3, 6);
    expect(grid[1].heightFr).toBeCloseTo(1 / 3, 6);
  });

  it("mixed side+below → image+side row, then below row", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [
        { type: "info", body: "s", placement: "side" },
        { type: "note", body: "b", placement: "below" },
      ],
      calloutCols: 2,
    });
    expect(grid).toHaveLength(2);
    expect(grid[0].cells).toHaveLength(2); // image + side-callouts
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "s" });
    expect(grid[1].cells[0].objects[0].callout).toMatchObject({ body: "b" });
  });

  it("heightFr and widthFr each sum to 1", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg",
      callouts: [{ type: "info", body: "x", placement: "below" }],
      calloutCols: DEFAULT_CALLOUT_COLS,
    });
    const hSum = grid.reduce((a, r) => a + r.heightFr, 0);
    expect(hSum).toBeCloseTo(1, 6);
    grid.forEach((r) =>
      expect(r.cells.reduce((a, c) => a + c.widthFr, 0)).toBeCloseTo(1, 6),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run lib/book-migrate.test.ts`
Expected: FAIL — current `legacyStepToGrid` ignores callouts (cells lack callout objects, single row for below).

- [ ] **Step 3: Rewrite `legacyStepToGrid`**

In `lib/book-migrate.ts`, update the imports (add `Callout`, `CalloutLayout`, `GridCell`, `DEFAULT_CALLOUT_LAYOUT`, `DEFAULT_CALLOUT_COLS`):

```ts
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_PAGE_CONFIG,
  DEFAULT_CALLOUT_LAYOUT,
  DEFAULT_CALLOUT_COLS,
  resolveLayout,
  type Annotation,
  type Book,
  type Callout,
  type CalloutLayout,
  type GridCell,
  type GridRow,
  type ImageRow,
  type StackedObject,
  type Step,
} from "./book-schema";
```

Keep `imageObject` as-is and add a callout-object helper + the block builder, then replace `legacyStepToGrid`:

```ts
function calloutObject(c: Callout): StackedObject {
  return {
    id: annotationId(),
    role: "secondary",
    kind: "callout",
    x: 0, y: 0, w: 1, h: 1,
    callout: { ...c },
  };
}

/** Image cell(s) for a source row's layout (no callouts). */
function imageCells(src: ImageRow | Step): GridCell[] {
  const layout = resolveLayout(src.layout, src.image);
  if (layout === "double") {
    return [
      { widthFr: 0.5, objects: [imageObject(src.image)] },
      { widthFr: 0.5, objects: [imageObject(src.image2)] },
    ];
  }
  return [{ widthFr: 1, objects: [imageObject(src.image)] }];
}

/** The grid rows for ONE legacy source row, as {weight, cells} blocks.
 *  weight = relative height within the source's allocation (image:callout = 2:1). */
function rowBlocks(src: ImageRow | Step): { weight: number; cells: GridCell[] }[] {
  const callouts = src.callouts ?? [];
  if (callouts.length === 0) {
    return [{ weight: 1, cells: imageCells(src) }];
  }
  const layout = resolveLayout(src.layout, src.image);
  const calloutLayout: CalloutLayout = src.calloutLayout ?? DEFAULT_CALLOUT_LAYOUT;
  const cols = src.calloutCols ?? DEFAULT_CALLOUT_COLS;
  const placementOf = (c: Callout) => c.placement ?? calloutLayout;
  const side = callouts.filter((c) => placementOf(c) === "side");
  const below = callouts.filter((c) => placementOf(c) === "below");

  // Image row: image cell(s) + (if any) one side-callouts cell, sized from legacy mm.
  let imageRowCells = imageCells(src);
  if (side.length > 0) {
    imageRowCells = [...imageRowCells, { widthFr: 0, objects: side.map(calloutObject) }];
    const imageMm = layout === "single-wide" ? 110 : layout === "double" ? 55 : 60;
    const weights = layout === "double" ? [imageMm, imageMm, 60] : [imageMm, 170 - imageMm];
    const wf = normalizeFractions(weights);
    imageRowCells = imageRowCells.map((c, i) => ({ ...c, widthFr: wf[i] }));
  }

  const blocks: { weight: number; cells: GridCell[] }[] = [
    { weight: below.length > 0 ? 2 : 1, cells: imageRowCells },
  ];

  // Below callouts → one callout row of `cols` equal cells, round-robin (span dropped).
  if (below.length > 0) {
    const cells: GridCell[] = Array.from({ length: cols }, () => ({
      widthFr: 0,
      objects: [] as StackedObject[],
    }));
    below.forEach((c, k) => cells[k % cols].objects.push(calloutObject(c)));
    const wf = normalizeFractions(cells.map(() => 1));
    blocks.push({ weight: 1, cells: cells.map((c, i) => ({ ...c, widthFr: wf[i] })) });
  }

  return blocks;
}

/** Build the grid for a legacy step. Each source row gets an equal 1/N of the
 *  page height, subdivided 2:1 when it carries below callouts. */
export function legacyStepToGrid(step: Step): GridRow[] {
  const sources: (ImageRow | Step)[] =
    Array.isArray(step.images) && step.images.length > 0 ? step.images : [step];
  const n = sources.length;
  const rows: GridRow[] = [];
  sources.forEach((src) => {
    const blocks = rowBlocks(src);
    const intra = normalizeFractions(blocks.map((b) => b.weight));
    blocks.forEach((b, i) => rows.push({ heightFr: intra[i] / n, cells: b.cells }));
  });
  const heights = normalizeFractions(rows.map((r) => r.heightFr));
  return rows.map((r, i) => ({ ...r, heightFr: heights[i] }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run lib/book-migrate.test.ts && pnpm typecheck`
Expected: PASS — new callout cases pass AND the pre-existing `legacyStepToGrid` / `migrateBook` tests still pass (no-callout output unchanged: single → 1 row/cell `heightFr 1`, double → `[0.5,0.5]`, N rows → `1/N`).

- [ ] **Step 5: Commit**

```bash
git add lib/book-migrate.ts lib/book-migrate.test.ts
git commit -m "feat: migrate legacy callouts into grid cells (side/below Rule 1)"
```

---

### Task 5: Rebuild grid from legacy fields on toggle (`setStepLayoutMode`)

Today `setStepLayoutMode` only seeds a grid when one is absent, so migrated steps (which carry an image-only skeleton) lose their callouts when toggled to grid. Rebuild from the legacy fields whenever switching to grid from a non-grid step.

**Files:**
- Modify: `lib/book-mutations.ts` (`setStepLayoutMode` at lines 37–51; imports at 12–27)
- Test: `lib/book-mutations.test.ts`

**Interfaces:**
- Consumes: `legacyStepToGrid` (Task 4, now callout-aware); `stepLayoutMode` (book-schema).
- Produces: `setStepLayoutMode(book, ci, si, mode)` unchanged signature; switching to `"grid"` from a non-grid step rebuilds `step.grid` from legacy fields. Consumed by the store + `StepEditor` (unchanged callers).

- [ ] **Step 1: Write the failing tests**

Add to `lib/book-mutations.test.ts` (use its existing helpers/imports; if a `legacyBook()`/book factory exists, reuse it — otherwise inline a minimal book):

```ts
import { setStepLayoutMode } from "@/lib/book-mutations";
import type { Book } from "@/lib/book-schema";

const bookWith = (step: Book["chapters"][0]["steps"][0]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps: [step] }],
});

describe("setStepLayoutMode — carries callouts", () => {
  it("rebuilds the grid (with callouts) when toggling a legacy step to grid", () => {
    const book = bookWith({
      image: "a.jpg", layout: "single",
      callouts: [{ type: "info", body: "hi" }], calloutLayout: "side",
    });
    const out = setStepLayoutMode(book, 0, 0, "grid");
    const grid = out.chapters[0].steps[0].grid!;
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "hi" });
    expect(out.chapters[0].steps[0].layoutMode).toBe("grid");
  });

  it("does not rebuild a step already in grid mode (preserves edits)", () => {
    const edited = bookWith({
      image: "a.jpg", layoutMode: "grid",
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
    });
    const out = setStepLayoutMode(edited, 0, 0, "grid");
    expect(out.chapters[0].steps[0].grid).toEqual(edited.chapters[0].steps[0].grid);
  });

  it("does not mutate the input book", () => {
    const book = bookWith({ image: "a.jpg", callouts: [{ type: "info", body: "x" }] });
    const snapshot = structuredClone(book);
    setStepLayoutMode(book, 0, 0, "grid");
    expect(book).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — the first test fails (current guard keeps the image-only skeleton; cell 2 with the callout is missing).

- [ ] **Step 3: Implement the rebuild-on-toggle**

In `lib/book-mutations.ts`, add `stepLayoutMode` to the book-schema import (line 12–24 block), then replace `setStepLayoutMode` (lines 37–51):

```ts
export function setStepLayoutMode(
  book: Book,
  ci: number,
  si: number,
  mode: "legacy" | "grid",
): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step) return book;
  const wasGrid = stepLayoutMode(step) === "grid";
  step.layoutMode = mode;
  // Switching INTO grid from a legacy step: (re)build the grid from the legacy
  // fields so callouts carry over. A step already in grid mode keeps its edits.
  if (mode === "grid" && !wasGrid) {
    step.grid = legacyStepToGrid(step);
  }
  return next;
}
```

(Update the doc comment above it to describe rebuild-on-toggle instead of seed-if-empty.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run lib/book-mutations.test.ts && pnpm typecheck`
Expected: PASS — toggle carries callouts; already-grid step unchanged; input not mutated. Existing `book-mutations` tests still pass.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test --run`
Expected: PASS — all tests (≈58) green.

- [ ] **Step 6: Commit**

```bash
git add lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: rebuild grid from legacy fields on grid toggle so callouts carry"
```

---

### Task 6: Render cell objects (image + callout) with fit modes

`GridStep` currently renders only the primary image. Render every object in each cell's stack; wire the image `fit` prop and the fit-mode CSS; stack objects vertically. This task is verified by `pnpm typecheck` + `pnpm build` + manual/PDF check (the renderer has no DOM unit-test harness — consistent with Plan 3's `GridStep`).

**Files:**
- Modify: `components/renderer/GridStep.tsx`
- Modify: `components/renderer/ImageSlot.tsx` (props at 16–30; `cls` at line 83)
- Modify: `components/renderer/renderer.css` (`.grid-cell` at 846–859)

**Interfaces:**
- Consumes: `imageFitClass` (Task 3); `Callout` component; `imageSrc`/`displayPath` (book-render); `StackedObject.callout`/`fit` (Task 2).
- Produces: a grid cell renders its `objects` in order; `ImageSlot` accepts `fit?: ImageFit`.

- [ ] **Step 1: Add the `fit` prop to `ImageSlot`**

In `components/renderer/ImageSlot.tsx`: import the helper and type, add the prop, and apply the class.

```ts
import { type Annotation, type Border, type ImageFit, resolveBorder } from "@/lib/book-schema";
import { imageFitClass } from "@/lib/grid-render";
```

Add to `ImageSlotProps`:

```ts
  /** Grid-only image fit mode; default contain (no class → unchanged markup). */
  fit?: ImageFit;
```

Add `fit` to the destructured params, and change the `cls` line (currently line 83):

```ts
  const fitCls = imageFitClass(fit);
  const cls =
    `img-slot${frame.show ? "" : " no-border"}${loaded ? " has-img" : ""}` +
    `${fitCls ? ` ${fitCls}` : ""}`;
```

- [ ] **Step 2: Rewrite `GridStep` to render all cell objects**

Replace `components/renderer/GridStep.tsx` body with:

```tsx
/*
 * Renderer for a step's flexible grid (Plan 3 + Plan 6): rows distribute by
 * heightFr, cells by widthFr (flex-grow). Each cell renders its object stack —
 * images via ImageSlot (with fit mode), callouts via Callout — top to bottom.
 * Editor-free + print-safe; auto-shrink (fitGrid) is a later plan.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import Callout from "./Callout";
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
          {row.cells.map((cell, ci) => (
            <div className="grid-cell" key={ci} style={{ flexGrow: cell.widthFr }}>
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
                return null; // text objects: Plan 8
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update grid CSS — stack vertically, clip, fit modes**

In `components/renderer/renderer.css`, replace the `.grid-cell` block and the `.grid-cell .img-slot img` rule (lines ~846–859) with:

```css
.grid-cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column; /* stack the object (image + callouts) vertically */
  gap: 4mm;
  overflow: hidden; /* Plan 6 clip baseline; Plan 7 fitGrid replaces this */
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
/* Image fit modes (Plan 6). Default (no class) keeps object-fit: contain.
   The base .img-slot img is position:absolute; inset:0 — releasing one inset
   edge + auto-sizing that axis lets the cell's overflow:hidden crop it. */
.grid-cell .img-slot.fit-width img {
  inset: 0 0 auto 0; /* top-anchored: crop overflow at the bottom */
  width: 100%;
  height: auto;
}
.grid-cell .img-slot.fit-height img {
  inset: 0 auto 0 0; /* left-anchored: crop overflow at the right */
  width: auto;
  height: 100%;
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS — no type errors; production build succeeds.

- [ ] **Step 5: Manual verification (record results in the report)**

Run `pnpm dev`, open `/demo` (or any project), and verify:
1. **Pixel-identical image grid:** toggle an image-only step to grid → the image still fills the cell exactly as before (compare against `git stash` of this task if unsure).
2. **Callouts appear:** add side callouts to a legacy step, toggle to grid → a second cell shows the stacked callout card(s); add below callouts → a callout row appears under the image.
3. **Crop modes:** in `data/projects/<slug>/book.json`, hand-set a grid image object's `"fit": "fit-width"` then `"fit-height"`, reload → the image fills width (crops bottom) / fills height (crops right). Reset to `contain`.
4. **Print clean:** open `/<slug>/print` → no editor affordances; the grid renders the same as the editor preview.

- [ ] **Step 6: PDF smoke check**

If Playwright/Chromium is installed: export a PDF of a grid step with callouts and confirm callouts render and nothing editor-only leaks. If not installed, note "PDF export not available in this environment" in the report and rely on the `/print` route check.

- [ ] **Step 7: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/ImageSlot.tsx components/renderer/renderer.css
git commit -m "feat: render callout objects and image fit modes in grid cells"
```

---

## Plan Self-Review

**Spec coverage:**
- Schema (`callout`, `fit`, `ImageFit`, default contain) → Task 2. ✓
- ADR-006/PRD amendment first → Task 1. ✓
- Render secondary callouts in cells + image fit rendering → Task 6 (+ helper Task 3). ✓
- Pixel-identical single-image guarantee → `imageFitClass("")` (Task 3) + manual check (Task 6 Step 5.1). ✓
- Migration side `[image│callouts]` ratios + below Rule 1 + mixed → Task 4. ✓
- Toggle rebuild carries callouts → Task 5. ✓
- Markers dropped → GridStep renders `Callout` without `marker` (Task 6). ✓
- Print-clean (renderer-only, additive) → Task 6 Steps 5.4 / 6. ✓
- Deferred (fitGrid, crop UI, drag, rich text) → not in any task; clip baseline + `return null` for text. ✓

**Placeholder scan:** every code step shows complete code; commands have expected output; no TBD/"handle edge cases". ✓

**Type consistency:** `ImageFit = "contain"|"fit-width"|"fit-height"` and `imageFitClass` returns those exact strings; `StackedObject.callout`/`fit` used identically across Tasks 4–6; `legacyStepToGrid(step: Step): GridRow[]` signature unchanged; `setStepLayoutMode` signature unchanged. ✓
