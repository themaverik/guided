# ADR-006: Flexible Grid, Cell Stacks, and Annotation Standardization

- Status: Proposed (design of record for the v-next release; implementation phased — see ROADMAP / the v-next plan)
- Date: 2026-06-23
- Deciders: Lamtei
- Relates to: ADR-001 (config-driven A4 renderer), ADR-004 (annotation canvas), ADR-005 (multi-project ephemeral hosting).
- Companion: `PRD.md` (behavior, acceptance, Appendix A schema) and `DESIGN.md` (visual system).

## Context and Problem Statement

The v-next release (`PRD.md`) replaces the fixed row presets (`single` / `double` / `single-wide`)
with a **flexible, user-resizable grid**, **standardizes the annotation layer** on ISO 32000
element names, and unifies the **color system** on an OKLCH paired-token palette — without
sacrificing print fidelity or any existing feature (watermark, callouts, multi-project hosting,
per-section fonts, PDF export).

Three forces make this an architectural decision rather than a feature tweak:

1. **No grid/cell data model exists.** `Step` carries `images?: ImageRow[]` with preset `layout`
   strings (`lib/book-schema.ts`). There is no notion of page configuration, body-region math,
   per-row column counts, or resizable fractions.
2. **The annotation layer diverged from ADR-004.** ADR-004's design of record specified geometry
   "normalized 0–1 relative to the image slot box," stored "on the row, per image." The shipped
   implementation instead renders `step.annotations` over the **whole page** (`AnnotationLayer`
   is a page-level sibling in `StepPage.tsx`; `book-schema.ts`/`annotations.ts` comments claiming
   "relative to the image slot" are stale). So annotations currently **drift on reflow** — the
   opposite of the PRD's requirement that they stay attached to their image.
3. **"Zero regression" is unverifiable today.** There are no unit tests on `book-mutations`,
   `annotations`, `use-auto-fit`, or `book-render`, and no `schemaVersion` on `Book`.

## Decision Drivers

- Direct, deterministic layout; print-accurate by construction; standardized + export-ready
  annotations; one OKLCH color system; **100% preservation of existing capability**.
- Minimum viable surface (Karpathy): no speculative shapes or routing modes in P0.
- Hand-editable `book.json` must remain valid and migrate losslessly.

## Decision

### 1. Page configuration drives a constant body region

Add `PageConfig` to `Book` (`size`, `custom`, `orientation`, `margins`, `headerH`, `footerH`).
`bodyH`/`bodyW` are derived constants (see PRD Appendix A.1). Header/footer are **fixed
author-set heights, not content-measured** — this keeps `bodyH` constant, which the
conserved-total grid depends on. The existing system step-metadata footer (`PageFooter`) is
retained within `footerH`. The renderer's hardcoded A4 CSS constants become configurable; the
PDF export call (`app/api/projects/[slug]/pdf/route.ts`) reads the config instead of
`format:"A4"`.

### 2. Rows-first grid with conserved-total proportional resize

`Step.grid?: GridRow[]`; each `GridRow` has `heightFr` (Σ = 1) and `cells: GridCell[]` with
`widthFr` (Σ = 1). Dragging a divider redistributes proportionally (flexbox `fr`) between
neighbours, floored at a minimum size. Grid manipulation is **on-canvas direct manipulation**,
not left-panel numeric fields.

### 3. Cell = object stack

A `GridCell` holds an ordered `StackedObject[]`: one `primary` anchor plus zero+ `secondary`
companions (e.g. image + callouts), each positioned 0–1 within the cell and drag-clamped to the
cell. Migrates the current `ImageRow` (image slot + callouts) onto the stack.

### 4. Two annotation layers; cell-anchored coordinates (realigns ADR-004 intent)

- **Bottom:** cell-bound object stacks, with annotations stored per object/cell, normalized
  **0–1 to the cell** — so they survive auto-fit and reflow (the behavior ADR-004 intended).
- **Top:** `Step.freeAnnotations`, normalized 0–1 to the body region, constrained to grid bounds.
- `AnnotationLayer` is rendered scoped to its cell (bottom) or the body (top), not the page.

### 5. Annotation vocabulary = ISO 32000; presets serialize to standard primitives

Internal kinds map to ISO names (`box→Square`, `line→Line`, `connector→PolyLine`, `text→FreeText`).
**P0 adds `Circle` and the `Polygon` primitive.** Two editor conveniences serialize to standard
primitives: **Bracket → PolyLine**, **Diamond → Polygon** (`preset:"diamond"`, 4-vertex rhombus,
vertex+center anchors, rounded corners). **Rationale for Diamond-as-Polygon:** ISO 32000 (the
chosen standardization basis) has no diamond/decision shape; a diamond is a 4-vertex Polygon. The
"rhombus = decision" convention belongs to ISO 5807 (a flowchart *symbol* standard), which is not
a serialization primitive, so it cannot be the data model. **Deferred to P1:** free-vertex Polygon
authoring, `Ink` (freehand), `Highlight`/`StrikeOut`. No existing primitive is removed.

### 6. Connectors: Straight + Square routing; snapping on by default

`Connector.routing` is `"straight" | "square"` (`elbow` renamed to `square`; **Curved/bezier
dropped to P1**). New connectors default to an **arrow** endpoint and have **endpoint→object-anchor
snapping ON by default** (no modifier key) — the core FigJam-style flowchart interaction. The
existing manual-waypoint-stepper UX is replaced by segment-drag reshape (storage stays
`waypoints`).

### 7. Color: OKLCH paired tokens persisted via `swatchId`

Picking a swatch sets fill + stroke together and persists a `swatchId` on the shape; the renderer
still reads resolved `stroke`/`fill`. `swatchId` keeps the inspector's live OKLCH + PDF `/C`·`/IC`
readouts reliable (hex→swatch is lossy). On-canvas fill renders at ~50% tint; **export renders fill
at full opacity** — the tint is an editor-only affordance. The same palette drives annotation
shapes and callout types.

### 8. Versioning and lossless migration

Add `schemaVersion` to `Book`; migrate-on-load in `lib/book-io.ts` before the store, re-save at the
current version. Migration rules are normative in PRD Appendix A.4 (legacy single-image step → 1×1
grid; `images[]` → rows with preset-mapped columns and callouts as secondary objects; page-anchored
annotations re-normalized to the cell — identity where the image fills the cell; `diamond` →
`polygon` preset). The renamed `fitGrid` backstop scales DOM only and never writes fractions back
to the store.

## Consequences

**Positive**
- Direct, print-safe layout; standardized, export-ready annotations; one color system; the
  annotation layer finally behaves as ADR-004 intended (no drift on reflow).
- Hand-editable `book.json` stays valid; existing projects migrate losslessly.

**Negative / costs**
- `ImageRow.tsx`, the `step-body` DOM, `resolveStepRows`, `AnnotationEditor.tsx`, and the
  `fitSteps` selectors require rewrites; `book-mutations` migration paths grow (mitigated by a hard
  cut-over to the grid model at load).
- A coordinate-space migration (page → cell) touches all existing annotation data; gated on a
  unit-test baseline (Phase 0) so "zero regression" is verifiable.

## Alternatives Considered

- **Per-cell (local) shrink-to-fit backstop** — rejected (PRD Decision 1): page-scoped reuse of the
  proven `fitSteps` preserves cross-cell alignment and fires rarely; locality isn't worth the
  complexity.
- **Equal-split resize** — rejected as default (PRD Decision 2) in favor of proportional `fr`;
  offered as a P1 mode.
- **Keep `diamond` as a bespoke non-standard kind** — rejected: the user explicitly wants a
  standardized shape; `Polygon` provides it with zero regression via the preset.
- **Store resolved hex only (no `swatchId`)** — rejected: lossy for the live OKLCH/PDF inspector.
- **Curved (bezier) routing in P0** — rejected: dropped to P1 to keep the connector engine minimal.

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

## Amendment (Plan 9, 2026-06-27): absolute callout positioning

`StackedObject` gains `positioned?: boolean`. A callout with `positioned === true`
leaves the cell flow stack and renders absolutely within its cell at `x`, `y`
(top-left, cell-relative 0–1) and width `w` (cell-relative); height is
content-driven. Absent/false keeps the Plan 6 flow rendering (x/y/w ignored), so
existing/migrated books are pixel-identical — no migration.

`GridStep` renders two sibling layers per cell: the existing flow layer
`.grid-cell-content` (the only layer `fitGrid` scales) and a new absolute overlay
`.grid-cell-floats` (a sibling under `.grid-cell`, which gains `position:relative`).
Floating callouts are author-placed and EXEMPT from `fitGrid`: its callout-overflow
filter is scoped to `.grid-cell-content .callout` so a cell whose only callout is
floated is not shrunk; anything past the cell edge clips via `.grid-cell{overflow:hidden}`.
Drag/resize handles are editor-only (`components/editor/PreviewCellFloat.tsx`); the
position itself is document data and renders in print.
