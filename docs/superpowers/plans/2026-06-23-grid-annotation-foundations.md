# Grid + Annotation Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the tested data-model + pure-logic foundation for the v-next flexible-grid and annotation-standardization release — with **zero runtime behavior change** — so later plans can wire it into the renderer, store, and UI safely.

**Architecture:** Additive only. Add the new schema types (`PageConfig`, grid/cell/object, schema versioning, connector/surface fields), three pure modules (`grid-math`, `book-migrate`), and a **vitest** harness. Nothing in this plan changes what renders; it ships pure functions and types behind a green test suite that the next plan consumes.

**Tech Stack:** TypeScript, vitest (unit), Next.js 15 / React 19 (no runtime changes here), Zustand (untouched here).

## Global Constraints

- **Immutability:** every helper returns new objects; never mutate inputs (matches `lib/book-mutations.ts`). Verbatim from CLAUDE.md.
- **`Book` JSON is the source of truth;** HTML/PDF are derived. No derived output stored.
- **Zero regression:** existing `book.json` / `window.BOOK` files must keep loading and rendering identically. Migration is **lossless, read-old/write-new**.
- **Karpathy discipline:** minimum code that satisfies the test; no speculative shapes/routing in P0.
- **Module path alias:** `@/*` → repo root (tsconfig `paths`). Import as `@/lib/...`.
- **P0 scope (from PRD rev2 + ADR-006):** shapes = Square/Circle/Line/PolyLine/Polygon(Diamond preset)/FreeText; routing = `straight` + `square` (no curved); connectors snap-on + arrow-default; color persisted via `swatchId`; page sizes A4/Letter/A5/Legal/Custom + portrait default/landscape toggle; margins default 15 mm; header/footer default 0.

---

## Plan map (this is Plan 1 of 5 — the rest are roadmapped at the end)

1. **Foundations (THIS PLAN):** vitest harness, schema additions, `grid-math`, `book-migrate`. No behavior change.
2. **Grid renderer + on-canvas resize** (Phase A UI): consume the grid model in the renderer, body-region CSS vars, divider drag, `fitGrid`, PDF page-config wiring.
3. **Cell stacks + objects** (Phase B): migrate callouts/images into the object stack, in-cell drag.
4. **Annotation standardization** (Phase C): ISO vocabulary, Circle/Polygon(+Diamond preset) renderers, cell-anchored coords + free layer, 8-handle selection, segment-drag reshape, snapping defaults.
5. **Color system** (Phase D): OKLCH paired tokens in `@theme`, swatch palette + hybrid inspector, unify callouts.

---

## File structure (this plan)

- Create `vitest.config.ts` — test runner config (jsdom not needed; pure logic).
- Modify `lib/book-schema.ts` — add types + defaults (`PageConfig`, `GridRow`, `GridCell`, `StackedObject`, `schemaVersion`, polygon kind + `swatchId`, connector `routing`/`snapToAnchors`/`defaultEndpoint`).
- Create `lib/grid-math.ts` — pure page/body geometry + conserved-total resize.
- Create `lib/grid-math.test.ts` — its tests.
- Create `lib/book-migrate.ts` — `migrateBook` + `legacyStepToGrid` + version constant.
- Create `lib/book-migrate.test.ts` — its tests.

---

### Task 0: Vitest harness

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/grid-math.test.ts` (smoke test, replaced in Task 2)

**Interfaces:**
- Produces: a working `pnpm test` command running `*.test.ts` with the `@/` alias resolvable.

- [ ] **Step 1: Write the failing smoke test**

```ts
// lib/grid-math.test.ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails (no config yet)**

Run: `pnpm test --run`
Expected: FAIL — vitest cannot resolve config / `@/` alias, or no config picked up.

- [ ] **Step 3: Write the vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts lib/grid-math.test.ts
git commit -m "build: add vitest harness with @/ alias"
```

---

### Task 1: Schema additions (types + defaults)

**Files:**
- Modify: `lib/book-schema.ts` (append types near the existing annotation/Book sections; add defaults near the other `DEFAULT_*` consts)
- Test: `lib/book-schema.test.ts` (create)

**Interfaces:**
- Produces:
  - `type PageSize = "A4" | "Letter" | "A5" | "Legal" | "Custom"`
  - `interface PageConfig { size: PageSize; custom?: {w:number;h:number}; orientation:"portrait"|"landscape"; margins:{top:number;right:number;bottom:number;left:number}; headerH:number; footerH:number }`
  - `interface StackedObject { id:string; role:"primary"|"secondary"; kind:"image"|"callout"|"text"; x:number;y:number;w:number;h:number; ref?:string; annotations?: Annotation[] }`
  - `interface GridCell { widthFr:number; objects: StackedObject[] }`
  - `interface GridRow { heightFr:number; cells: GridCell[] }`
  - `Book` gains `schemaVersion?: number`, `pageConfig?: PageConfig`
  - `Step` gains `grid?: GridRow[]`, `freeAnnotations?: Annotation[]`
  - `Surface.kind` gains `"polygon"`; `Surface` gains `preset?: "diamond"`, `vertices?: {x:number;y:number}[]`, `cornerRadius?: number`, `swatchId?: string`
  - `Connector.routing` becomes `"straight" | "square"`; `Connector` gains `snapToAnchors?: boolean`, `defaultEndpoint?: EndpointStyle`, `swatchId?: string`
  - `const CURRENT_SCHEMA_VERSION = 2`
  - `const DEFAULT_PAGE_CONFIG: PageConfig`

- [ ] **Step 1: Write the failing test**

```ts
// lib/book-schema.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_PAGE_CONFIG, CURRENT_SCHEMA_VERSION } from "@/lib/book-schema";

describe("schema defaults", () => {
  it("defaults to A4 portrait, 15mm margins, no header/footer", () => {
    expect(DEFAULT_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      headerH: 0,
      footerH: 0,
    });
  });
  it("current schema version is 2", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-schema.test.ts`
Expected: FAIL — `DEFAULT_PAGE_CONFIG`/`CURRENT_SCHEMA_VERSION` not exported.

- [ ] **Step 3: Add the types + defaults**

Add the `routing` change to the existing `Connector` interface (replace `routing?: "straight" | "elbow";` with the line below) and add the new optional fields:

```ts
// in interface Connector { ... }
  /** Path style: a straight line or an orthogonal (square/elbow) route. */
  routing?: "straight" | "square";
  /** Default true — endpoints snap to object anchors without a modifier. */
  snapToAnchors?: boolean;
  /** Default endpoint style for new connectors (default "arrow"). */
  defaultEndpoint?: EndpointStyle;
  /** Palette token id; resolved stroke/fill remain the render source. */
  swatchId?: string;
```

Extend `Surface` (add `"polygon"` to `kind`, and the new optional fields):

```ts
// Surface.kind union becomes:
  kind: "box" | "line" | "bracket" | "diamond" | "text" | "polygon";
  /** polygon only: closed-shape vertices, normalized 0–1. */
  vertices?: { x: number; y: number }[];
  /** polygon only: preset that constrains authoring (e.g. a decision diamond). */
  preset?: "diamond";
  /** Rounded corners (px at natural scale); 0 = sharp. */
  cornerRadius?: number;
  /** Palette token id; resolved stroke/fill remain the render source. */
  swatchId?: string;
```

Append the grid + page types (after the `Annotation` type, before `ImageRow`):

```ts
export type PageSize = "A4" | "Letter" | "A5" | "Legal" | "Custom";

export interface PageConfig {
  size: PageSize;
  /** Required when size = "Custom" (mm). */
  custom?: { w: number; h: number };
  /** landscape swaps W/H. */
  orientation: "portrait" | "landscape";
  /** mm. */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Fixed author-set header height (mm), default 0. Not content-measured. */
  headerH: number;
  /** Fixed author-set footer height (mm), default 0. Not content-measured. */
  footerH: number;
}

/** One stacked object inside a cell: a primary anchor or a companion. */
export interface StackedObject {
  id: string;
  role: "primary" | "secondary";
  kind: "image" | "callout" | "text";
  /** 0–1 within the cell. In-cell drag clamps to these bounds. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** image filename / callout payload ref. */
  ref?: string;
  /** Cell-anchored annotations (0–1 of the cell). */
  annotations?: Annotation[];
}

/** A grid cell: a fractional-width column holding an object stack. */
export interface GridCell {
  /** Fraction of the row width; Σ across a row = 1. */
  widthFr: number;
  objects: StackedObject[];
}

/** A grid row: a fractional-height band of cells. */
export interface GridRow {
  /** Fraction of bodyH; Σ across a step = 1. */
  heightFr: number;
  cells: GridCell[];
}
```

Add `schemaVersion?` and `pageConfig?` to `Book`, and `grid?` / `freeAnnotations?` to `Step`:

```ts
// in interface Book { ... }
  /** Schema generation; absent/1 = pre-grid. Migrated to CURRENT_SCHEMA_VERSION on load. */
  schemaVersion?: number;
  /** Page size/orientation/margins/header-footer. Defaults to DEFAULT_PAGE_CONFIG. */
  pageConfig?: PageConfig;

// in interface Step { ... }  (in the form (B) area)
  /** Flexible grid. When present, overrides images[] / legacy single-image fields. */
  grid?: GridRow[];
  /** Free annotation layer (0–1 of the body region), constrained to grid bounds. */
  freeAnnotations?: Annotation[];
```

Add the constants near the other `DEFAULT_*`:

```ts
export const CURRENT_SCHEMA_VERSION = 2;

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  headerH: 0,
  footerH: 0,
};
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-schema.test.ts && pnpm typecheck`
Expected: PASS, and `tsc --noEmit` clean. (If `tsc` flags the `Connector.routing` change anywhere, the only current writer is `lib/book-mutations.ts` / `AnnotationLayer.tsx` reading `"elbow"`; leave those for Plan 2 — but if `tsc` errors now, add `| "elbow"` temporarily is NOT allowed; instead update the one comparison site in `lib/annotations.ts:160` `if (c.routing !== "elbow")` to `!== "square"` and the writer in `book-mutations.ts` if any. Verify with the grep in Step 5.)

- [ ] **Step 5: Verify no stale `"elbow"` references remain compiled**

Run: `grep -rn '"elbow"' lib components app --include=*.ts --include=*.tsx`
Expected: only matches you have already retargeted to `"square"` (or none). Fix any remaining compile site minimally.

- [ ] **Step 6: Commit**

```bash
git add lib/book-schema.ts lib/book-schema.test.ts lib/annotations.ts
git commit -m "feat: add grid/page-config schema types and schema versioning"
```

---

### Task 2: Page + body geometry (`grid-math`)

**Files:**
- Create: `lib/grid-math.ts`
- Test: `lib/grid-math.test.ts` (replace the Task 0 smoke test)

**Interfaces:**
- Consumes: `PageConfig` from `@/lib/book-schema`.
- Produces:
  - `pageDimensions(cfg: PageConfig): { w: number; h: number }` — mm, orientation applied.
  - `interface BodyRegion { x: number; y: number; w: number; h: number }` — mm.
  - `bodyRegion(cfg: PageConfig): BodyRegion`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/grid-math.test.ts
import { describe, it, expect } from "vitest";
import { pageDimensions, bodyRegion } from "@/lib/grid-math";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";

describe("pageDimensions", () => {
  it("returns A4 portrait mm", () => {
    expect(pageDimensions(DEFAULT_PAGE_CONFIG)).toEqual({ w: 210, h: 297 });
  });
  it("swaps W/H in landscape", () => {
    expect(pageDimensions({ ...DEFAULT_PAGE_CONFIG, orientation: "landscape" }))
      .toEqual({ w: 297, h: 210 });
  });
  it("uses custom dimensions", () => {
    expect(pageDimensions({ ...DEFAULT_PAGE_CONFIG, size: "Custom", custom: { w: 100, h: 200 } }))
      .toEqual({ w: 100, h: 200 });
  });
});

describe("bodyRegion", () => {
  it("subtracts margins and header/footer", () => {
    const cfg = { ...DEFAULT_PAGE_CONFIG, headerH: 10, footerH: 20 };
    // A4 210×297; x=left margin=15; y=top margin+header=25; w=210−15−15=180;
    // h = 297 − 15(top) − 15(bottom) − 10(header) − 20(footer) = 237
    expect(bodyRegion(cfg)).toEqual({ x: 15, y: 25, w: 180, h: 237 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `grid-math.ts`**

```ts
// lib/grid-math.ts
/** Pure page/body geometry + conserved-total grid resize. All sizes in mm. */
import type { PageConfig } from "./book-schema";

const PAGE_MM: Record<Exclude<PageConfig["size"], "Custom">, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
  A5: { w: 148, h: 210 },
  Legal: { w: 215.9, h: 355.6 },
};

/** Page dimensions in mm, with landscape orientation applied. */
export function pageDimensions(cfg: PageConfig): { w: number; h: number } {
  const base =
    cfg.size === "Custom"
      ? { w: cfg.custom?.w ?? 210, h: cfg.custom?.h ?? 297 }
      : PAGE_MM[cfg.size];
  return cfg.orientation === "landscape" ? { w: base.h, h: base.w } : { ...base };
}

export interface BodyRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The content body region (mm) — excludes margins, header, and footer. */
export function bodyRegion(cfg: PageConfig): BodyRegion {
  const { w, h } = pageDimensions(cfg);
  const { top, right, bottom, left } = cfg.margins;
  return {
    x: left,
    y: top + cfg.headerH,
    w: w - left - right,
    h: h - top - bottom - cfg.headerH - cfg.footerH,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grid-math.ts lib/grid-math.test.ts
git commit -m "feat: page + body-region geometry math"
```

---

### Task 3: Divider resize (conserved-total, floored)

**Files:**
- Modify: `lib/grid-math.ts`
- Modify: `lib/grid-math.test.ts`

**Interfaces:**
- Produces: `resizeAdjacent(sizes: number[], dividerIndex: number, delta: number, minSize: number): number[]` — moves `delta` across the divider between `dividerIndex` and `dividerIndex+1`; both sides floored at `minSize`; Σ unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/grid-math.test.ts
import { resizeAdjacent } from "@/lib/grid-math";

describe("resizeAdjacent", () => {
  it("transfers delta from one neighbor to the other (Σ unchanged)", () => {
    expect(resizeAdjacent([0.5, 0.5], 0, 0.1, 0.1)).toEqual([0.6, 0.4]);
  });
  it("blocks at the floor when shrinking past minSize", () => {
    // row1 would go to 0.05 < floor 0.1 → clamp: row0 max = total2 - floor = 0.9
    expect(resizeAdjacent([0.5, 0.5], 0, 0.45, 0.1)).toEqual([0.9, 0.1]);
  });
  it("leaves untouched rows alone", () => {
    expect(resizeAdjacent([0.3, 0.3, 0.4], 1, 0.1, 0.05)).toEqual([0.3, 0.4, 0.3]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: FAIL — `resizeAdjacent` not exported.

- [ ] **Step 3: Implement**

```ts
// append to lib/grid-math.ts
/**
 * Move `delta` across the divider between `dividerIndex` and `dividerIndex+1`.
 * Both sides are floored at `minSize`; the pair's total is conserved, so all
 * other entries are untouched. Returns a new array.
 */
export function resizeAdjacent(
  sizes: number[],
  dividerIndex: number,
  delta: number,
  minSize: number,
): number[] {
  const i = dividerIndex;
  const j = dividerIndex + 1;
  if (i < 0 || j >= sizes.length) return sizes.slice();
  const pairTotal = sizes[i] + sizes[j];
  const lo = minSize;
  const hi = pairTotal - minSize;
  const newI = Math.min(Math.max(sizes[i] + delta, lo), hi);
  const out = sizes.slice();
  out[i] = newI;
  out[j] = pairTotal - newI;
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grid-math.ts lib/grid-math.test.ts
git commit -m "feat: conserved-total divider resize with floor"
```

---

### Task 4: Proportional redistribution + normalization

**Files:**
- Modify: `lib/grid-math.ts`
- Modify: `lib/grid-math.test.ts`

**Interfaces:**
- Produces:
  - `normalizeFractions(weights: number[]): number[]` — scales to Σ = 1 (equal split if all zero).
  - `redistributeProportional(sizes: number[], index: number, target: number, minSize: number): number[]` — sets `sizes[index]` toward `target` (clamped so the rest can stay ≥ `minSize`), shrinking/growing the **other** entries proportional to their current size via water-filling; Σ unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/grid-math.test.ts
import { redistributeProportional, normalizeFractions } from "@/lib/grid-math";

describe("normalizeFractions", () => {
  it("scales weights to sum 1", () => {
    expect(normalizeFractions([1, 1, 2])).toEqual([0.25, 0.25, 0.5]);
  });
  it("equal-splits when all zero", () => {
    expect(normalizeFractions([0, 0])).toEqual([0.5, 0.5]);
  });
});

describe("redistributeProportional", () => {
  it("grows one entry, shrinking others proportionally (Σ=1)", () => {
    // T=1; set index0 to 0.6; others were [0.3,0.1]→ pool 0.4 split 3:1 → [0.3,0.1]
    const r = redistributeProportional([0.6, 0.3, 0.1], 0, 0.8, 0.05);
    expect(r[0]).toBeCloseTo(0.8, 6);
    expect(r[1]).toBeCloseTo(0.15, 6); // 0.3/0.4 * 0.2
    expect(r[2]).toBeCloseTo(0.05, 6); // 0.1/0.4 * 0.2
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("clamps target so others keep the floor", () => {
    const r = redistributeProportional([0.5, 0.5], 0, 0.99, 0.1);
    expect(r[0]).toBeCloseTo(0.9, 6); // maxTarget = 1 - 1*0.1
    expect(r[1]).toBeCloseTo(0.1, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

```ts
// append to lib/grid-math.ts
/** Scale weights so they sum to 1; equal-split if every weight is 0. */
export function normalizeFractions(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / sum);
}

/**
 * Set `sizes[index]` toward `target` and absorb the change across the OTHER
 * entries proportional to their current size (flexbox `fr` behavior), each
 * floored at `minSize`, conserving Σ. `target` is clamped so the others can
 * all stay ≥ minSize. Returns a new array.
 */
export function redistributeProportional(
  sizes: number[],
  index: number,
  target: number,
  minSize: number,
): number[] {
  const n = sizes.length;
  const total = sizes.reduce((a, b) => a + b, 0);
  const maxTarget = total - (n - 1) * minSize;
  const clamped = Math.min(Math.max(target, minSize), maxTarget);
  const result = sizes.slice();
  result[index] = clamped;

  const others = sizes.map((_, i) => i).filter((i) => i !== index);
  let pool = total - clamped;
  const pinned = new Set<number>();

  // Water-fill: pin any entry whose proportional share falls below the floor,
  // re-distribute the rest. Guaranteed to resolve because clamp ensures
  // pool >= (n-1)*minSize.
  for (let guard = 0; guard <= n; guard++) {
    const free = others.filter((i) => !pinned.has(i));
    const freeBase = free.reduce((a, i) => a + sizes[i], 0) || 1;
    const poolForFree = pool - pinned.size * minSize;
    let pinnedThisPass = false;
    for (const i of free) {
      if ((sizes[i] / freeBase) * poolForFree < minSize) {
        pinned.add(i);
        pinnedThisPass = true;
      }
    }
    if (!pinnedThisPass) {
      for (const i of free) result[i] = (sizes[i] / freeBase) * poolForFree;
      for (const i of pinned) result[i] = minSize;
      break;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run lib/grid-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grid-math.ts lib/grid-math.test.ts
git commit -m "feat: proportional redistribution + fraction normalization"
```

---

### Task 5: Migration (`book-migrate`)

**Files:**
- Create: `lib/book-migrate.ts`
- Test: `lib/book-migrate.test.ts`

**Interfaces:**
- Consumes: `Book`, `Step`, `ImageRow`, `GridRow`, `CURRENT_SCHEMA_VERSION`, `DEFAULT_PAGE_CONFIG`, `resolveLayout` from `@/lib/book-schema`; `annotationId` from `@/lib/annotations`; `normalizeFractions` from `@/lib/grid-math`.
- Produces:
  - `legacyStepToGrid(step: Step): GridRow[]` — builds the grid **skeleton** (rows × cells with fractions and the primary image object). Callouts are NOT yet moved into the stack (that is Plan 3 / Phase B); existing fields are preserved.
  - `migrateBook(book: Book): Book` — **additive, lossless**: fills `pageConfig` default, maps connector `routing: "elbow" → "square"`, adds `step.grid` when absent, stamps `schemaVersion = CURRENT_SCHEMA_VERSION`. Idempotent (returns input unchanged when already at the current version). Pure — returns a new object.

- [ ] **Step 1: Write the failing test**

```ts
// lib/book-migrate.test.ts
import { describe, it, expect } from "vitest";
import { migrateBook, legacyStepToGrid } from "@/lib/book-migrate";
import { CURRENT_SCHEMA_VERSION, DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

const baseBook = (steps: Book["chapters"][0]["steps"]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps }],
});

describe("legacyStepToGrid", () => {
  it("single-image step → 1 row, 1 cell, image as primary", () => {
    const grid = legacyStepToGrid({ image: "a.jpg" });
    expect(grid).toHaveLength(1);
    expect(grid[0].heightFr).toBe(1);
    expect(grid[0].cells).toHaveLength(1);
    expect(grid[0].cells[0].widthFr).toBe(1);
    expect(grid[0].cells[0].objects[0]).toMatchObject({
      role: "primary", kind: "image", ref: "a.jpg",
    });
  });
  it("double row → 1 row, 2 cells each widthFr 0.5", () => {
    const grid = legacyStepToGrid({ images: [{ image: "l.jpg", image2: "r.jpg", layout: "double" }] });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells.map((c) => c.widthFr)).toEqual([0.5, 0.5]);
    expect(grid[0].cells[1].objects[0].ref).toBe("r.jpg");
  });
  it("N image rows → N rows, equal heightFr", () => {
    const grid = legacyStepToGrid({ images: [{ image: "a" }, { image: "b" }, { image: "c" }] });
    expect(grid).toHaveLength(3);
    grid.forEach((r) => expect(r.heightFr).toBeCloseTo(1 / 3, 6));
  });
});

describe("migrateBook", () => {
  it("adds pageConfig default, grid, and stamps the version", () => {
    const out = migrateBook(baseBook([{ image: "a.jpg" }]));
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.pageConfig).toEqual(DEFAULT_PAGE_CONFIG);
    expect(out.chapters[0].steps[0].grid).toBeDefined();
  });
  it("is idempotent for an already-migrated book", () => {
    const once = migrateBook(baseBook([{ image: "a.jpg" }]));
    expect(migrateBook(once)).toEqual(once);
  });
  it("preserves legacy fields (lossless)", () => {
    const out = migrateBook(baseBook([{ image: "a.jpg", title: "keep me" }]));
    expect(out.chapters[0].steps[0].image).toBe("a.jpg");
    expect(out.chapters[0].steps[0].title).toBe("keep me");
  });
  it("maps connector routing elbow → square", () => {
    const book = baseBook([{
      image: "a.jpg",
      annotations: [{ id: "c1", kind: "connector", from: { x: 0, y: 0, style: "none" }, to: { x: 1, y: 1, style: "arrow" }, stroke: "#000", width: 2, routing: "elbow" } as never],
    }]);
    const out = migrateBook(book);
    const conn = out.chapters[0].steps[0].annotations![0] as { routing: string };
    expect(conn.routing).toBe("square");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-migrate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/book-migrate.ts
/**
 * Schema migration. Runs on load (before the store) to bring any older
 * book.json / window.BOOK up to CURRENT_SCHEMA_VERSION. ADDITIVE + lossless:
 * legacy fields are preserved; new fields are filled. Pure — returns a new
 * object and never mutates the input.
 *
 * Scope (Plan 1 / Phase A foundations): page config default, grid SKELETON
 * (rows×cells + primary image), connector routing rename. Moving callouts into
 * the object stack and the diamond→polygon data conversion are later phases.
 */
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PAGE_CONFIG,
  resolveLayout,
  type Annotation,
  type Book,
  type GridRow,
  type ImageRow,
  type StackedObject,
  type Step,
} from "./book-schema";
import { annotationId } from "./annotations";
import { normalizeFractions } from "./grid-math";

function imageObject(ref: string | undefined): StackedObject {
  return {
    id: annotationId(),
    role: "primary",
    kind: "image",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    ref,
  };
}

/** Build the grid skeleton for a legacy step (single-image or images[]). */
export function legacyStepToGrid(step: Step): GridRow[] {
  const rows: (ImageRow | Step)[] =
    Array.isArray(step.images) && step.images.length > 0 ? step.images : [step];
  const heights = normalizeFractions(rows.map(() => 1));
  return rows.map((src, i) => {
    const layout = resolveLayout(src.layout, src.image);
    if (layout === "double") {
      return {
        heightFr: heights[i],
        cells: [
          { widthFr: 0.5, objects: [imageObject(src.image)] },
          { widthFr: 0.5, objects: [imageObject(src.image2)] },
        ],
      };
    }
    return {
      heightFr: heights[i],
      cells: [{ widthFr: 1, objects: [imageObject(src.image)] }],
    };
  });
}

function migrateConnectorRouting(annotations: Annotation[] | undefined): Annotation[] | undefined {
  if (!annotations) return annotations;
  let changed = false;
  const next = annotations.map((a) => {
    if (a.kind === "connector" && (a as { routing?: string }).routing === "elbow") {
      changed = true;
      return { ...a, routing: "square" as const };
    }
    return a;
  });
  return changed ? next : annotations;
}

function migrateStep(step: Step): Step {
  return {
    ...step,
    annotations: migrateConnectorRouting(step.annotations),
    grid: step.grid ?? legacyStepToGrid(step),
  };
}

/** Bring a Book up to the current schema version. Idempotent + lossless. */
export function migrateBook(book: Book): Book {
  if ((book.schemaVersion ?? 1) >= CURRENT_SCHEMA_VERSION) return book;
  return {
    ...book,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pageConfig: book.pageConfig ?? DEFAULT_PAGE_CONFIG,
    chapters: book.chapters.map((ch) => ({
      ...ch,
      steps: ch.steps.map(migrateStep),
    })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run lib/book-migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test --run && pnpm typecheck`
Expected: all PASS, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/book-migrate.ts lib/book-migrate.test.ts
git commit -m "feat: lossless schema migration to the grid model (additive)"
```

> **Not wired into the load path yet — by design.** `migrateBook` is consumed in Plan 2 (where `parseBookSource`/`loadExampleBook`/the API book read call it AND the renderer switches to the grid model together), so behavior never changes mid-flight. Wiring it now would feed `grid` to a renderer that still reads `images[]`, rendering blank.

---

## Self-review (done)

- **Spec coverage (this plan's slice):** page geometry ✓ (Task 2), conserved-total resize + floor ✓ (Tasks 3–4), schema for grid/cell/object + page config ✓ (Task 1), versioning + lossless migration ✓ (Task 5), connector routing rename ✓ (Task 5). Renderer/store/UI deliberately out of scope (Plans 2–5).
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `resizeAdjacent`/`redistributeProportional`/`normalizeFractions`/`pageDimensions`/`bodyRegion`/`migrateBook`/`legacyStepToGrid` names are used identically across tasks; `Connector.routing` is `"straight"|"square"` everywhere; `StackedObject`/`GridCell`/`GridRow` field names match Task 1.

---

## Roadmap — Plans 2–5 (to be detailed just-in-time after each lands)

> Each becomes its own `docs/superpowers/plans/*.md` written with full TDD code once its predecessor is merged, because each depends on the concrete DOM/store shapes the prior establishes.

**Plan 2 — Grid renderer + on-canvas resize (Phase A UI)**
- Wire `migrateBook` into `parseBookSource` / `loadExampleBook` / the API book read (`app/api/projects/[slug]/book/route.ts`).
- New `GridStep` renderer consuming `step.grid`; emit body-region CSS vars from `pageConfig`; `StepPage` switches from `resolveStepRows` to grid (keep legacy fallback one release).
- Rename/retarget `fitSteps` → `fitGrid` at the grid-cell DOM; implement the redistribute-then-backstop protocol.
- On-canvas divider drag (uses `resizeAdjacent`) with live mm readout + floor-blocked state; grid-visibility toggle as shared Zustand state.
- PDF route reads `pageConfig` (size/orientation) instead of hardcoded `format:"A4"`; E2E for Letter.

**Plan 3 — Cell stacks + objects (Phase B)**
- Extend migration to move callouts/images into `StackedObject` stacks (primary + secondary).
- In-cell object drag clamped to cell bounds; `CalloutEditor`/`RowCard` rebind to the stack.

**Plan 4 — Annotation standardization (Phase C)**
- ISO vocabulary at the UI layer; `Circle` + `Polygon` renderers; `diamond → polygon(preset)` data migration.
- Cell-anchored annotation layer + `freeAnnotations` body layer; 8-handle + center-dot selection.
- Segment-drag connector reshape (storage stays `waypoints`); snapping defaults on; arrow default endpoint.

**Plan 5 — Color system (Phase D)**
- OKLCH paired tokens in `app/globals.css` `@theme`; cool the `app-bg`.
- Swatch palette + hybrid inspector (OKLCH + PDF `/C`·`/IC` readouts via `swatchId`); fill ~50% tint on canvas, full opacity in export; unify callout type→swatch.
