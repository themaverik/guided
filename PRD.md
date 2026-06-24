# Guided — Flexible Grid Layout Engine & Annotation Standardization
## Product Requirements Document (v-next)

**Status:** Draft for build  
**Date:** 2026-06-23  
**Builds on:** existing Guided codebase — Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Zustand; Playwright/Chromium PDF export.

---

## Context

Guided is a minimalist, image-driven, print-ready guidebook editor: authors compose A4 guides from chapters and steps, place screenshots with callouts and annotations, and export print-accurate PDFs. The current layout system uses **fixed row presets** (single / double / single-wide) sized by a **shrink-to-fit** pass, plus an **ad-hoc annotation canvas**.

This release replaces the fixed presets with a **flexible, user-resizable grid**, **standardizes the annotation layer**, and unifies the **color system** — without sacrificing print fidelity or any existing feature (watermark, callouts, multi-project hosting, per-section fonts, PDF export all remain).

---

## Problem statement

Authors need precise, predictable control over how screenshots and callouts sit on a page, but the fixed row presets force content into a handful of shapes and shrink-to-fit makes sizing feel automatic rather than directed. Separately, the annotation layer grew ad-hoc — non-standard shape vocabulary, per-image only, no consistent color model — so it's inconsistent to use and hard to export or interoperate. The net effect is friction on the core task (laying out an annotated screenshot guide) and a UI that doesn't feel cohesive.

---

## Goals

1. **Direct, deterministic layout control** — arrange any number of cells per row, resize by dragging, with content-driven heights that always stay within the page.
2. **Print-accurate by construction** — the grid never exceeds the body region, and a shrink-to-fit backstop guarantees no overflow.
3. **Standardized annotations** — built on established vocabularies (ISO 32000 element names internally; W3C Web Annotation model for later interop) so the layer is consistent and export-ready.
4. **One consistent visual system** — a single OKLCH-based paired-token palette driving both annotation shapes and callouts.
5. **Zero regression** — preserve 100% of existing capability.

---

## Non-goals

1. **Editable / interactive PDF annotations** — export stays *flattened vector* (current pipeline). Real PDF annotation objects are a future consideration, not v1.
2. **W3C interop export** — the data model is shaped around PDF primitives now; W3C serialization is **phase 2** (sequenced after PDF, per decision of record).
3. **Detected-element snapping** (snapping to UI inside a screenshot via image analysis) — snapping is to grid / edges / siblings / anchors only.
4. **Exhaustive multi-format tuning** — page-size config (A4 / Letter / etc.) is in; per-format template polish is not.
5. **Collaborative / multi-user editing** — single-author, ephemeral hosting model unchanged.

---

## Personas

- **Author (primary):** a product, ops, support, or technical-writing person documenting a software workflow as an annotated, printable guide.
- **Reader (secondary):** consumes the exported PDF/print; never opens the editor — relevant only to output fidelity.

---

## User stories

**Layout**
- As an author, I want to choose a page size and margins so my guide matches my target format.
- As an author, I want to set a header and footer and have the grid automatically stay within the remaining body, so content never collides with them.
- As an author, I want to add rows and set how many columns each row has, so I can build asymmetric layouts.
- As an author, I want to drag a divider to resize a row or column and have neighbors absorb the change, so the page stays full and balanced.
- As an author, I want a cell to hold an image *plus* its callouts together, so related content moves as a unit.
- As an author, I want row height to follow the tallest content and shrink-to-fit only when it must, so the page is always print-safe.

**Annotation**
- As an author, I want to draw arrows, boxes, circles, brackets, and freehand marks on a screenshot, so I can direct the reader's attention.
- As an author, I want annotations to stay attached to their image when the layout reflows, so they never drift.
- As an author, I want a consistent palette where picking a color sets a coordinated fill and border, so my marks look intentional.
- As an author, I want to toggle the grid guides on or off and have shapes snap to them, so I can align precisely without clutter in the output.

**Output**
- As an author, I want export to reproduce exactly what I see (colors, tints, endpoints, watermark), so the printed guide matches the editor.

---

## Requirements

### P0 — Must have

**Grid & layout**
- **Page configuration:** selectable size — **A4, Letter, A5, US Legal, and Custom (W × H)**; **portrait by default with a landscape toggle** (swaps W/H). Margins default to **1.5 cm**.
- **Header / footer:** **fixed, author-set heights** (default **none**). They are *not* content-measured — this keeps `bodyH` a constant, which the conserved-total grid depends on. If header/footer content exceeds its set height, clip or warn (do not reflow the grid).
- **Body-region math:** `bodyH = pageH − marginTop − marginBottom − headerH − footerH`; `bodyW = pageW − marginLeft − marginRight`. The grid is bounded to the body region and must never overlap header, footer, or margins.
- **Rows-first grid:** author sets N rows; initial heights distributed equally (`bodyH / N`). Per-row column count is independently configurable; initial widths split equally within each row.
- **Conserved-total resize:** dragging a row divider redistributes height between adjacent rows (Σ = bodyH); dragging a column border redistributes width within the row (Σ = row width). Redistribution is **proportional** — affected neighbors shrink in proportion to their current size (flexbox `fr` behavior), not by an equal split. A **minimum size floor** blocks further shrink.
- **Cell = object stack:** a cell contains an ordered stack of objects — one **primary** anchor plus zero or more **secondary** companions (e.g. image + callouts). Objects are bounded by the cell.
- **Content-driven height:** a row's height tracks the max content height across its cells; rows redistribute to conserve bodyH.
- **Shrink-to-fit backstop:** when redistribution + floor cannot fit content, **scale the whole page down** so the page never overflows and cross-cell alignment/relative scale is preserved; surface the existing non-blocking overflow warning. **Protocol:** conserved-total redistribution runs first (store/React, before paint); the DOM backstop (the existing `fitSteps`, renamed **`fitGrid`** and re-targeted at the grid cell DOM) runs after paint in `useLayoutEffect` and **only scales the DOM — it never writes fractional heights back to the store**. See Appendix A.
- **In-cell object drag:** an object can be repositioned anywhere inside its cell without crossing the cell border.

**Annotation**
- **Shape set** (internal vocabulary = ISO 32000 names). **P0:** `Square` (rectangle ← current `box`), `Circle`/ellipse (**new**), `Line` (← current `line`, + endpoint styles), `PolyLine` (← current `connector`), `Polygon` (closed N-gon; **P0 ships the Diamond preset only**), `FreeText` (label ← current `text`). **Editor-convenience presets that serialize to standard primitives:** **Bracket → `PolyLine`**, and **Diamond → `Polygon`** (`preset:"diamond"` — 4-vertex rhombus, vertex+center connector anchors, rounded corners). **Deferred to P1:** free-vertex `Polygon` authoring, `Ink` (freehand), `Highlight`/`StrikeOut` (text-markup). **No existing primitive is removed** — `box/line/connector/bracket/diamond/text` all survive under the new names/presets (zero regression). Rationale for Diamond: ISO 32000 has no diamond/decision shape, so the standardized representation is `Polygon`; the flowchart "rhombus = decision" convention is ISO 5807 (a symbol standard, not a data primitive).
- **Endpoint styles** for `Line`/`PolyLine` map to PDF `/LE`. **All current styles are retained** (`none/arrow/circle/diamond/point/bar`); **new connectors default to `arrow`**. Additional `/LE` styles (Square, Slash) are P1.
- **Anchor model:** each annotation targets its **cell/image** (not the page); coordinates normalized **0–1** to the anchor so they survive auto-fit and reflow.
- **Two layers:** bottom = cell-bound object stacks; top = free annotation layer constrained to body/grid bounds.
- **Snapping:** shape edges/handles snap to **cell borders and sibling objects by default**; **sub-grid and manual anchor points are opt-in** (Figma/FigJam convention — smart guides on, grid-snap optional). Sensitivity/granularity is exposed via the P1 control.
- **Grid visibility toggle:** guides can be shown/hidden in the editor; **never printed** in export.
- **Connector snapping (default on):** a connector endpoint dragged within the snap threshold of an object edge **auto-binds to the nearest anchor without a modifier key**. This object-snapping is always on (distinct from the opt-in sub-grid / manual-anchor snapping above).
- **Editor model — hybrid inspector + on-canvas grid:** the annotation inspector is **hybrid** — a floating tool/swatch palette over the canvas, a compact popover on the selection for quick color, and the full numeric properties in the left panel. **Grid row/column/cell resizing is direct-manipulation on the page canvas** (drag dividers with a live mm readout), not left-panel numeric fields.

**Color system**
- **Paired-token palette:** each color = `{ fill (light), stroke (darker), text }`, OKLCH-derived with **uniform lightness across hues** (fill ≈ L 0.96, stroke ≈ L 0.58). 8 swatches anchored on `#024450` ink: Ink, Red, Orange, Amber, Green, Teal, Blue, Violet.
- Selecting a swatch sets **fill + stroke together** (locked by default) and persists a **`swatchId`** on the shape (the renderer still reads the resolved `stroke`/`fill`; `swatchId` keeps the inspector's live OKLCH + PDF readouts reliable and survives round-trips). On-canvas fills render as a **~50% tint**; **in export the fill renders at full opacity** — the tint is editor-only.
- **One source of truth:** the same palette drives annotation shapes *and* callout types (info / note / success / warning / danger fold into the token system).

**Export**
- **Flattened-vector PDF** via the existing Playwright → `/print` → Chromium path; reproduce colors, **fills at full opacity (no editor tint)**, endpoints, watermark, and auto-fit exactly. The PDF call must **read the page config** (size/orientation) rather than the current hardcoded `format:"A4"`. No new export subsystem.

### P1 — Nice to have
- **Free-vertex `Polygon` tool** (click-to-place arbitrary vertices) — in P0 the only Polygon path is the Diamond preset.
- **`Ink` (freehand)**, **`Highlight`**, and **`StrikeOut`** shapes.
- **Curved (bezier) connector routing** — P0 ships **Straight + Square only**.
- Per-side color override (unlock fill/stroke independently).
- Additional `/LE` endpoints (Square, Slash) surfaced in UI.
- Snap sensitivity / sub-grid granularity control.
- Optional **equal-split** redistribution mode on resize (proportional is the default).
- Palette brightness presets (muted ↔ vivid) with gamut-safety hinting.

### P2 — Future considerations (design for, don't build)
- **Editable PDF annotation export** (real `Square`/`Circle`/`Line` dicts with `/C`, `/IC`, `/LE`; needs appearance streams to keep fill-only alpha).
- **W3C Web Annotation serialization** for interop (body/target/selector adapter over the existing geometry).
- **Detected-element snapping** via screenshot image analysis.
- **CMYK-aware color management** for professional print.

---

## Acceptance criteria (key P0s)

**Grid bounds**
- [ ] Given a page with header and footer set, when the grid renders, then no cell, divider, or annotation extends into header, footer, or margin regions.
- [ ] Given N rows, when first created, then each row height = `bodyH / N` (±1px rounding).

**Resize**
- [ ] Given two adjacent rows, when a divider is dragged by Δ, then one grows by Δ and the other shrinks by Δ; total height unchanged.
- [ ] Given a row at the minimum floor, when dragged to shrink further, then the drag is blocked at the floor.

**Backstop**
- [ ] Given content that cannot fit after redistribution, when the page renders, then content scales down to fit and the overflow warning appears; the page is never clipped.

**Annotation anchor**
- [ ] Given an annotation on an image, when that image's row resizes or the page auto-fits, then the annotation stays aligned to the same image region.

**Color**
- [ ] Given a selected shape, when a swatch is picked, then both fill and stroke update to that token; fill renders as a tint, stroke at full strength.

**Grid toggle**
- [ ] Given guides visible, when the author hides them, then they disappear in the editor; in export they never appear.

**Connector snapping**
- [ ] Given the connector tool, when an endpoint is dragged within the snap threshold of an object edge, then it binds to the nearest anchor with **no modifier key**; new connectors default to an **arrow** endpoint.

**Fill in export**
- [ ] Given a filled shape shown at ~50% tint in the editor, when exported, then the fill renders at **full opacity**.

**Standardized diamond**
- [ ] Given an existing `diamond` annotation, when the book migrates, then it is represented as a `Polygon` (`preset:"diamond"`) and renders identically (zero regression).

**Migration**
- [ ] Given a pre-release `book.json` (legacy single-image step or `images: ImageRow[]`), when loaded, then it migrates to the grid model **losslessly** and re-saves at the new `schemaVersion`.

---

## Success metrics

**Leading**
- Flexible-grid adoption: % of new projects using >1 column in a row — target **≥ 50%** within 30 days.
- Annotation usage: % of steps with ≥1 annotation — target **≥ 40%**.
- Resize engagement: % of sessions that drag a divider — target **≥ 30%**.
- Backstop rate: % of pages hitting shrink-to-fit — target **< 10%** (high = the model is fighting authors).

**Lagging**
- Export rate (% projects exporting PDF) — maintain or improve.
- 4-week returning-author rate — no regression.
- Reported layout issues / thumbs-down — downward trend.

---

## Decisions of record

*Resolved 2026-06-23. Reflected in the requirements above.*

| # | Decision | Rationale |
|---|---|---|
| 1 | **Backstop scope = whole page** (page-scoped `fitSteps`) | Proven path; preserves cross-cell alignment and relative scale; fires rarely, so locality isn't worth the complexity. |
| 2 | **Resize redistribution = proportional** | Matches the flexbox `fr` mental model; preserves untouched rows' relative balance; avoids equal-split crushing small rows. |
| 3 | **Snap defaults = edges + siblings on; sub-grid + anchors opt-in** | Figma/FigJam convention; high-value snapping without the sticky fight or visual noise. |
| 4 | **Header/footer = fixed author-set heights** (default none) | Keeps `bodyH` constant — the invariant the conserved-total grid depends on. Content-measured deferred to P2. |
| 5 | **Page sizes = A4, Letter, A5, US Legal, Custom** + portrait default / landscape toggle | Covers global, US, booklet, and long-form defaults; Custom + landscape future-proof without blocking authors. A3/Tabloid deferred. |

*Resolved 2026-06-23 (rev2).*

| # | Decision | Rationale |
|---|---|---|
| 6 | **P0 shape set trimmed** to Square / Circle / Line / PolyLine / Polygon(Diamond preset) / FreeText; **Ink, Highlight, StrikeOut, free-Polygon, Curved routing → P1** | Minimum viable that covers ~95% of screenshot-annotation needs; freehand + text-markup cost is disproportionate. No existing primitive removed (zero regression). |
| 7 | **Diamond standardized as a `Polygon` preset** | ISO 32000 (the chosen basis) has no diamond; a diamond is a 4-vertex rhombus Polygon. Promotes the Polygon primitive+renderer to P0 as substrate; existing diamonds migrate losslessly. (ISO 5807 = symbol convention, not a data primitive.) |
| 8 | **Connector endpoint→anchor snapping ON by default; Arrow = default endpoint** | Core FigJam-style flowchart UX; object-snapping is already the PRD default, connectors are the same case. |
| 9 | **Annotation inspector = hybrid; grid resize = on-canvas direct manipulation** | Resolves the README (popover) vs DESIGN (panel) contradiction; canvas-first for spatial edits, panel for precise numeric props. |
| 10 | **Color persisted via `swatchId`; fill full-opacity in export** | Hex→swatch is lossy — `swatchId` keeps live OKLCH/PDF readouts reliable; tint is an editor affordance, not print intent. |
| 11 | **`schemaVersion` + migrate-on-load (lossless, read-old/write-new)** | The only way the "zero regression" goal is verifiable; gated by a unit-test baseline (Phase 0). |

No blocking questions remain. Non-blocking items are captured as P1/P2. Full data model and migration rules are normative in **Appendix A** and **ADR-006**.

---

## Timeline / phasing

- **Phase A — Grid engine:** body-region math, rows × columns, conserved-total resize + floor, content-driven height, backstop integration.
- **Phase B — Cell stacks + objects:** primary/secondary stack model, in-cell drag, migrate existing `ImageRow` + callouts onto the stack.
- **Phase C — Annotation standardization:** ISO vocabulary, `/LE` endpoints, cell-anchored normalized coords, snapping, grid toggle.
- **Phase D — Color system:** OKLCH paired tokens, unify callouts, shape inspector.

Export stays flattened-vector throughout (no dedicated phase). P2 items (editable-PDF, W3C interop) follow, per the PDF-first decision.

---

*Companion documents: `DESIGN.md` (canonical design system — tokens, type, components, interaction patterns) at repo root, plus the full handoff bundle in `docs/design-handoff/` (`README.md` screen-by-screen spec + `Guided Design.dc.html` interactive reference). This PRD defines behavior, requirements, and acceptance criteria; `DESIGN.md` defines look and screens. The data model and migration rules are normative in **Appendix A** below and **ADR-006**. All feed the Claude Code build.*

---

## Appendix A — Data model & migration (normative)

> TypeScript sketch, additive to `lib/book-schema.ts`. Detailed rationale and alternatives in **ADR-006**. Field names indicative; the ADR is authoritative.

### A.1 Page configuration (on `Book`)

```ts
type PageSize = "A4" | "Letter" | "A5" | "Legal" | "Custom";
interface PageConfig {
  size: PageSize;
  custom?: { w: number; h: number };        // mm — required when size = "Custom"
  orientation: "portrait" | "landscape";    // landscape swaps W/H
  margins: { top: number; right: number; bottom: number; left: number }; // mm, default 15
  headerH: number;                           // mm, fixed author-set, default 0
  footerH: number;                           // mm, fixed author-set, default 0
}
// Body region (constant — the conserved-total grid invariant depends on it):
//   bodyH = pageH − marginTop − marginBottom − headerH − footerH
//   bodyW = pageW − marginLeft − marginRight
```

The existing system step-metadata footer (`PageFooter`) is retained and sits **within** `footerH` (it is not a separate band). Header/footer are **not content-measured** — if content exceeds the set height, clip or warn; never reflow the grid.

### A.2 Grid & cell stacks (on `Step`)

```ts
interface GridCell { widthFr: number; objects: StackedObject[] }  // Σ widthFr = 1 within a row
interface GridRow  { heightFr: number; cells: GridCell[] }        // Σ heightFr = 1 within a step
interface StackedObject {
  id: string;
  role: "primary" | "secondary";            // one primary anchor + zero+ companions
  kind: "image" | "callout" | "text";
  x: number; y: number; w: number; h: number;   // 0–1 within the cell; in-cell drag clamps here
  ref?: string;                              // image filename / callout payload ref
  annotations?: Annotation[];                // CELL-anchored (0–1 of the cell)
}
// Step gains:  grid?: GridRow[]   // when present, overrides images[] / legacy single-image fields
// Step also gains:  freeAnnotations?: Annotation[]  // the top free layer, 0–1 of the body region
```

Minimum size floors (mm) block further shrink on resize; redistribution is **proportional** (flexbox `fr`).

### A.3 Annotation additions

```ts
// New Surface kind:
//   "polygon" — closed N-gon: vertices: {x;y}[] (0–1), preset?: "diamond", cornerRadius?: number
// Existing kinds map to ISO names at the UI layer (box→Square, line→Line, text→FreeText).
// bracket stays an editor tool that serializes to PolyLine; diamond → polygon(preset:"diamond").
interface Connector {
  // ...existing fields
  routing: "straight" | "square";            // "elbow" renamed → "square"; curved dropped (P1)
  snapToAnchors?: boolean;                    // default TRUE
  defaultEndpoint?: EndpointStyle;            // default "arrow"
}
// Surface & Connector both gain:  swatchId?: string  // palette token; resolved stroke/fill remain
```

### A.4 Versioning & migration

- Add **`schemaVersion: number`** to `Book`. Migrate-on-load in `lib/book-io.ts` **before** the book reaches the store; re-save at the current version. **Lossless, read-old/write-new.**
- **Legacy single-image step** → one `GridRow` (heightFr 1) × one `GridCell` (widthFr 1) with the image as the `primary` object.
- **`images: ImageRow[]`** → N rows; each row's `RowLayout` preset maps to columns (`single`→1, `double`→2, `single-wide`→1 full-bleed). Callouts become `secondary` objects in the cell.
- **Page-anchored annotations** (today on `step.annotations`, normalized to the whole page) → re-normalized to their cell on migration; where the image fills the cell (every legacy case) this is an **identity transform**. Genuinely free marks move to `step.freeAnnotations`.
- **`diamond` Surface** → `polygon` with `preset:"diamond"` (rhombus vertices, vertex+center anchors, rounded corners preserved).

### A.5 Backstop protocol (restating the P0 requirement, normatively)

1. Conserved-total redistribution (proportional, floored) runs in the store/React layer **before paint**.
2. `fitGrid` (the renamed `fitSteps`, re-targeted at grid-cell DOM) runs **after paint** in `useLayoutEffect` as the page-scoped backstop. It scales DOM only; it **must not** write `heightFr`/`widthFr` back to the store. It fires only when content still overflows `bodyH` after step 1, and surfaces the existing non-blocking overflow warning.
