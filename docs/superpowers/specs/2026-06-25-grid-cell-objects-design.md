# Grid Cell Objects — Design Spec (Plan 6)

- Status: Approved (brainstorm complete; feeds writing-plans)
- Date: 2026-06-25
- Branch: `feature/improvement-rev3` (BASE = `main` HEAD `2fbbbc8`)
- Relates to: ADR-006 (flexible grid, cell stacks, annotation standardization), PRD.md Appendix A, ADR-001 (config-driven renderer).
- Supersedes (via the Task-1 amendment below): parts of PRD Decision 1 / A.4 and ADR-006 §3/§8 on overflow and the cell content model.

## Context and Problem

The grid renderer (Plan 3) renders **image cells only** — `GridStep` draws `cellPrimaryImage(cell)` and ignores every other object in the stack. Legacy callouts are dropped on the floor: `legacyStepToGrid` seeds image-only cells, and `setStepLayoutMode` only seeds a grid when one is absent, so **toggling a callout-bearing legacy step to grid silently loses its callouts**. The `StackedObject` substrate (role/kind/x/y/w/h/ref/annotations) exists from Plan 1 but is unused for anything but the primary image.

This spec covers the first slice that makes a grid cell hold real content: **render secondary callout objects, add a per-image fit mode, and migrate legacy callouts into cells.**

## Governing Model (resolves a PRD/ADR conflict)

During brainstorming, a material conflict surfaced between the live discussion and the normative PRD/ADR-006. It was resolved as follows (this is the design of record going forward):

- **Callouts and text paragraphs → automatic shrink-to-fit, no dialog.** Their size is unknowable before authoring but **measurable after render**; the page-scoped backstop (`fitSteps` → `fitGrid`, DOM-only, runs in `useLayoutEffect`) measures the real DOM and uniformly scales the page so content always fits. This is the PRD model, kept. (The `fitGrid` engine itself is **Plan 7**.)
- **Images → per-image fit mode, applied *with* author confirmation.** Image cropping is a **deliberate compositional choice** ("show only part of this screenshot"), not an overflow failure, so a prompt belongs there. Stored as a durable property; re-editable. (The confirmation **UI** is Plan 7; Plan 6 adds the field + rendering, default `contain`.)
- **never-clip is amended:** *text/callout content is never **accidentally** clipped (auto shrink-to-fit guarantees it); images may be **deliberately** cropped via the `fit` field.*

## Scope — the three-plan slice

This feature is decomposed into three sequenced, independently-testable plans. **This spec is Plan 6 only.**

- **Plan 6 (this spec):** render secondary callout objects in cells; image `fit` field + 3 rendering modes (default `contain`); migrate legacy callouts into cells; rebuild-on-toggle so legacy→grid carries callouts.
- **Plan 7:** `fitGrid` auto-shrink engine (rename + retarget `fitSteps`); image-crop confirmation UI; add/remove objects; in-cell drag (floating placement).
- **Plan 8:** rich-text block objects (`kind:"text"`) — headings h1–h4, underline, strikethrough, numbered lists; extend the `lib/markdown.ts` subset.

Subsequent plans renumber: Plan 9 = annotation/grid-guide on/off toggle; Plan 10 = OKLCH color system.

## Schema Changes (`lib/book-schema.ts`)

Add two optional fields to `StackedObject`:

```ts
export interface StackedObject {
  id: string;
  role: "primary" | "secondary";
  kind: "image" | "callout" | "text";
  x: number; y: number; w: number; h: number;
  ref?: string;                 // image filename (unchanged)
  callout?: Callout;            // NEW — payload when kind === "callout"
  fit?: ImageFit;               // NEW — image fit mode; default "contain"
  annotations?: Annotation[];
}

export type ImageFit = "contain" | "fit-width" | "fit-height";
export const DEFAULT_IMAGE_FIT: ImageFit = "contain";
```

- `fit-width` = image spans the cell width, natural height, overflow height cropped (bottom).
- `fit-height` = image spans the cell height, natural width, overflow width cropped (right).
- `contain` = current behavior (whole image, letterboxed). Default → existing grids unchanged.

The `x/y/w/h` fields stay (already present); Plan 6 renders secondary callouts as a **flow stack** and does not consume `x/y/w/h` for layout (floating placement is Plan 7). Images keep `x:0,y:0,w:1,h:1`.

## Document Amendments — Plan Task 1 (before any code)

Per the project rule (schema/grid-model change → ADR first):

- **ADR-006:** new amendment block — add the `fit` field to §3 (cell object stack), revise the never-clip statement in §8 to the text-vs-image split above, and record the migration mapping (side / below Rule 1) as the normative cell layout.
- **PRD.md:** update A.1 `StackedObject` (add `callout?`, `fit?`), Decision 1 / line 84 / acceptance line 134 (never-clip → text-only; images deliberately croppable), and A.4 migration (callout placement = side `[image│callouts]`, below Rule 1).

## Rendering (`components/renderer/GridStep.tsx`, `lib/grid-render.ts`, `renderer.css`)

- A cell renders its `objects` in order as a **vertical flow stack**: `kind:"image"` → `ImageSlot` wrapped with a fit class; `kind:"callout"` → the existing `Callout` component fed `object.callout`. (`kind:"text"` is Plan 8 — render nothing / skip in Plan 6.)
- **Pixel-identical guarantee (locked by a render-equivalence test):** a cell holding exactly one primary image and no other objects renders the **current markup** (image fills the cell, `object-fit: contain`). The stacked-column layout engages only when secondary objects are present. This keeps every existing image-only grid byte-identical.
- **Image fit CSS:**
  - `contain` → `img { width:100%; height:100%; object-fit:contain }` (today).
  - `fit-width` → wrapper `overflow:hidden`; `img { width:100%; height:auto }` (crops bottom).
  - `fit-height` → wrapper `overflow:hidden`; `img { height:100%; width:auto }` (crops right).
- **P6 clip baseline:** `.grid-cell { overflow:hidden }` so a too-tall cell never breaks the page. Plan 7's `fitGrid` replaces clipping with auto-shrink for text/callout overflow.
- **Markers dropped:** below-callout numbered markers (①②③) are not rendered in cells (a below-grid pin affordance with no grid equivalent yet). Minor, opt-in-only fidelity loss; revisit if needed.
- `ImageSlot` gains a `fit?: ImageFit` prop (or `GridStep` applies the wrapper class) to drive the fit CSS.

## Migration + Toggle (`lib/book-migrate.ts`, `lib/book-mutations.ts`)

Extend `legacyStepToGrid(step)` (used by both migrate-on-load and the toggle) to place callouts. For each legacy source row (an `ImageRow`, or the step itself), resolve `layout` and split callouts by placement (`callout.placement ?? row.calloutLayout`):

- **No callouts** → image cell(s), exactly as today (`double` → two 0.5 cells; else one full-width cell).
- **Side callouts** → one row: image cell(s) + a callouts cell holding the side callouts as stacked `secondary` objects. `widthFr` from legacy mm geometry:
  - single: `[0.35 image, 0.65 callouts]` (60mm : 110mm)
  - single-wide: `[0.65 image, 0.35 callouts]` (110mm : 60mm)
  - double: `[≈0.32, ≈0.32, ≈0.36]` (55mm : 55mm : 60mm), callouts in the third cell
- **Below callouts → Rule 1:** an image row (full-width cell(s) per layout) **plus** one callout row of `calloutCols` equal-width cells; callouts distributed round-robin (`k → k mod calloutCols`), stacking within a cell; **per-callout `span` is dropped** (cell width replaces it). Row `heightFr` heuristic = image row : callout row(s) = `2:1`, normalized.
- **Mixed (side + below)** → image row carrying the side-callouts cell, plus a below callout row.

Each migrated callout becomes `{ id: annotationId(), role:"secondary", kind:"callout", x:0, y:0, w:1, h:1, callout: <the Callout> }`. All fractions normalized via `normalizeFractions` (Σ=1 invariants preserved).

**Toggle fix (`setStepLayoutMode`):** when switching to `"grid"` from a step that is **not already in grid mode** (`stepLayoutMode(step) !== "grid"`), **rebuild** `step.grid = legacyStepToGrid(step)` (now callout-aware), replacing any stale image-only skeleton — so toggling a callout-bearing legacy step carries its callouts. Steps already in grid mode are not rebuilt (author edits preserved). `migrateBook`'s at-rest skeleton is left image-only (vestigial, harmless) — out of scope.

## Guarantees

- **Zero regression:** existing image-only grids render byte-identical (render-equivalence test); legacy/migrated steps still default to `layoutMode` unset → the proven `StepPage`/`ImageRow` path. Default `fit:"contain"` means no image changes until an author opts into a crop (Plan 7 UI).
- **Print-clean:** all changes are additive cell rendering in `components/renderer/**`; no editor-only affordance is introduced here, so nothing new can leak into `/print` or the PDF.

## Testing

- **Unit (vitest, `lib/**`):**
  - `legacyStepToGrid`: none / side (each layout + fractions) / below Rule 1 (round-robin, span dropped, 2:1 heights) / mixed / double — cell shapes, `widthFr`/`heightFr` sums = 1, callout payloads carried.
  - `setStepLayoutMode`: legacy-with-callouts → grid carries callouts; already-grid not rebuilt; input not mutated (immutability).
  - `grid-render`: fit-class mapping for each `ImageFit`; cell-object iteration order.
- **Render-equivalence:** single-primary-image cell markup/classes unchanged vs current.
- **Manual / PDF:** toggle a callout-bearing legacy step to grid → callouts appear; image-only grid visually unchanged; hand-set `fit:"fit-width"/"fit-height"` renders the crop; `/print` + PDF clean.
- Suite grows 48 → ~56–58.

## Deferred (explicitly not in Plan 6)

- `fitGrid` auto-shrink engine and the overflow warning for grid steps (Plan 7).
- Image-crop confirmation UI; add/remove objects; in-cell drag / floating placement using `x/y/w/h` (Plan 7).
- Rich-text block objects + markdown-subset extension (Plan 8).
- Restoring below-callout markers; cell-anchored annotation coordinate migration (later).
