# Roadmap — Guidebook WYSIWYG Editor

Development plan for the print-ready A4 guidebook editor. Architecture decided in
[ADR-001](docs/adr/ADR-001-config-driven-a4-renderer-architecture.md): config-driven `book`
object, React port of the prototype renderer, Zustand store, API routes for persistence and
upload. The reference renderer in `design_handoff_guidebook_editor/design-references/Guidebook A4.html`
is the source of truth for layout, sizing, and the `fitSteps` auto-fit algorithm.

Status legend: [not started] · [in progress] · [done] · [declined]

## Guiding principles

- Renderer fidelity is non-negotiable: match the prototype pixel-for-pixel (colors, type,
  millimeter geometry, callout styles, auto-fit). Verify each layout against the eight
  screenshots in `design_handoff_guidebook_editor/screenshots/`.
- `book` is the single source of truth. The editor mutates it; the renderer consumes it;
  `public/book.js` persists it in a hand-editable form.
- Build the renderer before the editor — the editor is only useful once the right pane is
  trustworthy. Then layer controls on top.
- Keep the editor canvas a client island. The renderer touches the DOM (auto-fit) and `window`;
  never SSR it.

## Phase 0 — Scaffold and foundations  [done]

Stand up the Next.js 15 (App Router) + TypeScript + Tailwind project and lock in the data model.

- Initialize the app: `pnpm` workspace, Next 15 App Router, TypeScript strict, Tailwind, ESLint.
- Add fonts via `next/font`: Montserrat, Inter, JetBrains Mono.
- Define design tokens (Tailwind theme + CSS variables) from the README token table: `--ink`
  `#024450`, `--cream` `#f2f4f4`, `--img-border` `#d7dede`, callout palettes, geometry constants.
- Port the TypeScript types into `lib/book-schema.ts`: `Book`, `Chapter`, `Step`, `ImageRow`,
  `Callout`, `SizeOverride`, `Watermark`. Add the explicit `layout` field and `image2?: string`
  on rows/steps per the README NOTE (prefer explicit fields over filename-suffix inference).
- Seed `public/book.js` from the reference example so there is real content to render.
- Set up `vitest` and `playwright` harnesses (commands already declared in `CLAUDE.md`).

Exit criteria: app boots, fonts load, types compile, `book.js` parses into a typed `book`.

## Phase 1 — Renderer (`<A4Book>`)  [done]

Port `Guidebook A4.html` to React components. This is the largest fidelity-critical phase.

- Page geometry: 210mm × 297mm, 18mm inner padding, `@page { size: A4; margin: 0 }`, screen
  column with 12mm gaps + soft shadow, cream surfaces for cover/intro/back-cover.
- Components: `A4Book`, `A4Page`, `StepPage`, `ImageRow`, `Callout`, `ImageSlot`, plus
  `CoverPage`, `ChapterIntro`, `BackCover`. Page order: Cover/TOC → (Chapter intro → Steps) per
  chapter → Back cover.
- Image rows and sizing (port `renderImageRow`/`renderStep`): single 81mm, double 2×81mm + 8mm
  gutter, single-wide 170mm (aspect 170:135.55), phone aspect 294:492. Arrow SVG between double
  slots. Resolve layout via explicit field → filename suffix → default `single`.
- Callout placement: `side` (image caps single 60mm / double 55mm / single-wide 110mm, callout
  column flexes) and `below` (full-width grid, 1/2/3 cols, auto-numbered markers).
- Image slots: 6px `#d7dede` frame, 6px radius, `object-fit: contain`, `.no-border` variant.
- Labelled placeholder when no image: cream box, status-bar band, photo icon, uppercase label,
  exact expected file path (`public/<chapterId>/<file>`), optional hint.
- Callout styles exact: info / note / warn palettes from the token table.
- Support both authoring forms: legacy single-image step fields AND `images: ImageRow[]`.

Exit criteria: rendering the seeded `book` reproduces screenshots 01–08 visually.

## Phase 2 — Auto-fit and print route  [done]

Port `fitSteps()` and make printing accurate.

- `lib/use-auto-fit.ts`: port `fitSteps` into a `useLayoutEffect` keyed on page content, run
  against DOM refs. Preserve the **read-then-write** pass (snapshot every slot, then scale each
  from its own snapshot) so the two slots of a `double` row stay identical. Damped shrink ratio,
  `MIN_SLOT_PX` floor, guard loop, `console.warn` (surfaced as a non-blocking UI warning) when a
  page still overflows.
- Re-run after `document.fonts.ready` and on `window` load.
- `app/print/page.tsx`: clean render-only route, editor chrome hidden, `@media print` drops
  shadows/gaps, one `.page` per sheet (`break-after: page`). Auto-fit must run here too.

Exit criteria: multi-row pages (screenshot 07) fit without crop; print preview is one sheet per
page with no chrome.

## Phase 3 — Editor shell and renderer integration  [done]

Wire the two-pane editor around the renderer.

- `app/page.tsx`: two-pane layout. Left controls pane (≈380–440px, scrollable); right live render
  scaled to fit via `transform: scale()` (origin top-center), prev/next page controls outside the
  scaled element.
- Zustand store holding `book`; separate selection state (active chapter/step/row/slot indices).
- Derived selectors: page list for preview, per-page overflow flags from the auto-fit pass.
- Highlight / scroll to the page being edited on selection.
- All edits optimistic and local: mutate `book` → preview re-renders → auto-fit re-runs.

Exit criteria: selecting a step scrolls the right pane to it; a text edit reflects instantly.

## Phase 4 — Left-pane controls  [done]

Build the controls, mirroring `Editor UI Reference.html`.

- Book settings: title, subtitle, author, edition.
- Chapters list: add / remove / reorder; edit `id`, `title`, `description`.
- Steps list within selected chapter: add / remove / reorder; select to edit.
- Step editor as a **structure outline** (not a flat form): each row a card stacked in print
  order, drawing the slot skeleton (1 box for single/single-wide, 2 + arrow for double) and a
  callout band (`below` → columns beneath; `side` → narrow column right). The outline is the
  selection surface.
- Per-row controls: single/double segmented toggle + wide sub-toggle; per-slot **image dropdown**
  (thumbnails + filename, populated from `public/<chapterId>/`, with an "Upload new…" entry);
  arrow toggle (double); per-image border toggle; row title + instruction; callouts (enable,
  count stepper, side/below layout, 1/2/3 columns, per-callout type/title/body); collapsible
  size overrides.
- Drag-and-drop reorder for chapters, steps, rows, callouts (pick a DnD library here).

Exit criteria: a guidebook can be authored end-to-end from the UI with no hand-editing.

## Phase 5 — Persistence and image upload  [done]

- `app/api/book/route.ts`: GET/PUT the config, serializing `book` back to `public/book.js` as
  `window.BOOK = …`. Read the file on load so hand-edits are reflected.
- Debounced autosave (~800ms) from the store; mirror to `localStorage` for crash recovery.
- `app/api/upload/route.ts`: POST image → save to `public/<chapterId>/<filename>`, store the bare
  filename. New files appear as dropdown options for other slots.

Exit criteria: edits survive reload; hand-editing `book.js` then reloading reflects in the editor;
uploaded images render.

## Phase 6 — Watermark (new feature)  [done]

- Extend the model (`Watermark`) and add the book-settings section (enable, text, icon upload,
  position select, opacity slider, default 0.06).
- `Watermark.tsx` overlay on every page: text (large, uppercase, `--ink` at opacity; center =
  rotated ~-30°, corners inset ~10mm) or icon. `pointer-events: none`, behind content but above
  the page background. Must appear in print output (not hidden by `@media print`).

Exit criteria: watermark renders on screen and in print at the chosen position/opacity.

## Phase 7 — Validation, polish, and QA  [in progress]

- Non-blocking warnings: page still overflows after auto-fit (surface the `fitSteps` condition);
  referenced image file missing.
- Print / Save as PDF button opening the print route and calling `window.print()`.
- Audit the editor-island client bundle for any heavy new dependency (per `CLAUDE.md`).
- Verification: `vitest` unit tests for schema + layout resolution + any serialize helpers;
  `playwright` E2E for the core authoring flow; visual check of all eight reference screenshots;
  print-output sanity check.

Exit criteria: all eight layouts verified, autosave + upload + watermark working, tests green.

## Follow-ups / open items

- Update `CLAUDE.md` to reflect the ADR-001 stack (it currently describes the rejected TipTap
  architecture).
- Decide `book.js` vs `book.json` + shim if parsing the assignment proves brittle (ADR-001 open
  question).
- Choose the drag-and-drop library (Phase 4).

## Build order summary

Phase 0 (scaffold + types) → Phase 1 (renderer) → Phase 2 (auto-fit + print) → Phase 3 (editor
shell) → Phase 4 (controls) → Phase 5 (persistence + upload) → Phase 6 (watermark) → Phase 7
(validation + QA). Phases 1–2 are the fidelity core and gate everything after them.

---

# v2 — Feature expansion (planned)

A second wave of features that deepen styling, content, and turn the app into a hosted,
multi-project product ("Guided"). Build order agreed: Theme A → B → D → C. Decisions of record:

- Persistence: server-side ephemeral store (filesystem `data/projects/<slug>/` with a ~1h
  idle TTL sweeper) + browser mirror for crash recovery. Supersedes the single hand-editable
  `public/book.js` model from the handoff/ADR-001 — captured in a new ADR.
- Rich text: stored as a markdown-subset **string** per field (bold/italic + bullet/number
  lists). No structural change to the data model; rendered to sanitized HTML. TipTap may later
  serve as the editing surface only, still serializing to/from markdown.
- PDF export: server-side via Playwright/headless Chromium rendering the project's print route.
- Each schema/architecture change below opens a MADR ADR before implementation, per repo rules.

## Phase 8 — Styling primitives (Theme A)  [done]

- **Border options (#1):** widen `ImageRow.border` from `boolean` to `boolean | { color?:
  string; width?: string; radius?: string }` (back-compatible — `true`/`false` still valid).
  Renderer applies per-slot; controls add color/width/radius inputs.
- **Callout types + icons (#2):** expand `CalloutType` to `info | note | success | warning |
  danger` (keep `warn` as an alias for back-compat), each with a leading icon. Add palette
  tokens for success/danger; render the icon in the callout title; controls expose the type set.
- **Per-section fonts (#5):** add `book.theme` with optional font family/size/color overrides
  per section (cover, chapter, step, row, callout). Applied via CSS variables layered over the
  base tokens so defaults stay pixel-accurate. Controls in book settings.
- **Page background image + watermark layering (#11):** add a page/background image (book- or
  chapter-level) rendered behind content; ensure z-order is background → watermark → content.
  Upload via the project asset store; controls in book settings.

Exit criteria: all four primitives editable and rendered in preview + print, back-compatible
with existing configs.

## Phase 9 — Content model (Theme B)  [done]

- **Inline rich text (#6, #7):** ADR for markdown-subset storage. Render instruction/body/row
  fields through a sanitized markdown→HTML step; add a minimal formatting toolbar (bold, italic,
  bullet list, numbered list) to the relevant text inputs. Fields remain strings.
- **Paragraph vs. list blocks (#6):** lists are expressed within the markdown string
  (`- ` / `1. `); a body may be a paragraph or a list. No new field types.
- **Mixed callout placement (#3):** ADR for the schema change — move placement from a single
  per-row `calloutLayout` to an optional per-callout `placement: 'side' | 'below'` (falling back
  to the row default). The renderer groups side vs. below callouts within one row (e.g. two side
  + one below). Auto-fit is unaffected (DOM-measured). Editor outline reflects mixed placement.

Exit criteria: bold/italic + lists render in callouts/instructions; a single row can mix side and
below callouts; existing configs still render.

## Phase 10 — Product shell & lifecycle (Theme D)  [done]

- **Rebrand to "Guided"** (guide + editor); update app metadata and chrome.
- **Landing page** (`/`): tagline "A simple minimalist image-driven print-ready guidebook
  editor" and three actions — Start a new project (prompts for a name → slug), View demo project,
  View quickstart guide.
- **Multi-project + endpoints (#8):** route `/<slug>` (editor) and `/<slug>/print`; demo at
  `/demo`; quickstart at `/quickstart`. Slug derived from project name (deduped).
- **Ephemeral persistence (#10):** ADR for the multi-project hosting + storage model. Server
  store `data/projects/<slug>/{book.json, assets/…}` with a last-touched timestamp and a sweeper
  that deletes ~1h after inactivity. Project-scope the upload/images APIs (off `public/<chapter>`).
- **Download + PDF export (#10):** "Download project" zips `book.json` + assets; "Export PDF"
  invokes Playwright to render `/<slug>/print` to a true PDF (watermark + auto-fit preserved).
- **Legal (#9):** Terms of Use + Privacy Policy pages stating we store only user-entered/uploaded
  data, no personal details, with the 1h-ephemeral note. Linked from landing + editor footer.

Exit criteria: create/name a project, edit at its endpoint, demo + quickstart live, download and
PDF export work, data auto-expires, legal pages linked.

## Phase 11 — Annotation canvas (Theme C)  [done]

Slice A: model + static SVG render (preview + print) + property editor. Slice B: interactive
drag/resize + connector-endpoint snapping on a dedicated canvas. Direct manipulation on the
scaled main preview (vs. the dedicated canvas) remains a possible future refinement.


The largest new subsystem — gets its own ADR and a throwaway spike before committing.

- **Model:** per-image `annotations[]` with coordinates normalized (0–1) to the image box, so
  they survive auto-fit scaling. Shapes: arrow, rectangle, circle; per-shape color and width;
  arrow endpoints of type arrowhead / circle / point.
- **Layers:** an interactive SVG overlay in the editor (select/drag/resize/add) and a static SVG
  rendered in the print route, both positioned over the image slot.
- **Snapping (needs design):** start tractable — snap to image edges/center, a configurable grid,
  and manually-placed anchor points. Snapping to *detected UI elements within the screenshot* is
  a stretch goal (image analysis) deferred until the basics ship.
- **Persistence:** annotations live in the project `book.json` alongside the row's image.

Exit criteria: draw/edit arrows + shapes on an image with color/width/endpoint options, snapping
to edges/grid/anchors, rendered identically in editor and PDF.

## v2 open questions

- Slug collisions / project naming rules and reserved routes (`demo`, `quickstart`, `api`).
- Asset dedup and total-size limits per ephemeral project.
- Whether the existing seed becomes the `/demo` project's content.
- Snapping UX depth for Phase 11 (grid granularity, anchor authoring).

---

# v3 — Flexible Grid + Annotation Standardization ("v-next")  [in progress]

Third wave (`PRD.md` + design system `DESIGN.md` + `ADR-006`): replace fixed row presets with a
flexible, user-resizable grid; standardize annotations on ISO 32000 names; unify color on OKLCH
paired tokens — zero regression to existing features. Executed as sequenced plans under
`docs/superpowers/plans/`, each via subagent-driven development (fresh subagent per task + per-task
review + final whole-branch review). CLAUDE.md was corrected (it had described a non-existent TipTap
stack). Decisions of record live in `PRD.md` (Decisions 1–14) and `ADR-006`.

**Status:** Plans 1–5 merged to `main` (merge commit `2fbbbc8`). **Plans 6–11 are done and merged to
`main`** (merge commit `ecc19bf`, via `feature/improvement-rev3`): grid cells render and author image +
callout + rich-text content; overflow auto-shrinks to fit in both preview and print; callouts drag off
the flow stack to float at absolute positions; text blocks carry headings/strike and per-block
alignment; images take a per-cell border/shadow that hugs the screenshot; and a hide-grid toggle gives
a clean preview. Renderer/print zero-regression, editor-only affordances, additive schema (no migration).
**Since then the backlog wave has shipped to `main` (`origin/main` = `2a1f8ca`, 192 unit tests):** callout
lists; the connector square-routing + angle-smoothing bug fixes; the FigJam-elbow connector epic (orthogonal
auto-routing + rounded corners + reflow-surviving segment-drag handles); annotation alignment snapping + smart
guides; connector→grid-content snapping; connector endpoint direction override (panel + on-canvas knob); the
floating annotation palette **SP1** (on-canvas drag-to-size creation + tool palette); and the annotation
**delete key + confirm modal** — each detailed under the backlog below. **Five further editor-only
improvements shipped on `feat/editor-polish-bundle`:** shape cycler (Alt-click cycles overlapping shapes),
text-label alignment while typing, equal-spacing distribution guides, custom page-size inputs, and
file-drop-onto-cell — each detailed in the backlog below. Remaining v3 work — annotation
standardization (ISO 32000 vocabulary) and the OKLCH color system. (Note:
plan numbering was re-sequenced during just-in-time brainstorming; annotation standardization and color moved
later than the original 6–8 sketch.)

## Plan 1 — Foundations  [done]

Tested data-model + pure-logic foundation, zero runtime change. `vitest` harness (none existed);
`PageConfig`/grid/cell/object schema types + `schemaVersion`; `lib/grid-math.ts` (page/body
geometry, conserved-total resize, proportional water-fill redistribution); `lib/book-migrate.ts`
(lossless, idempotent, version-gated migration). 23 unit tests; 10 commits; deliberately not wired
into the live path. Plan: `docs/superpowers/plans/2026-06-23-grid-annotation-foundations.md`.

## Plan 2 — Page configuration  [done]

Author-configurable page size / orientation / margins / header / footer end-to-end: presets
(new-project 15/15/10 mm + legacy-preserving 18/0/0 mm), migrate-on-load wiring, `pageVars` CSS-var
geometry, header/footer body bands, PDF `@page` size, left-pane Page settings. Zero-regression by
construction. Plan: `docs/superpowers/plans/2026-06-24-page-configuration.md`.
Shipped on `feature/improvement-rev2` (commits `fa74912..2dee054`, 7 commits; suite 28/28, typecheck 0,
build OK; final whole-branch review: ready-to-merge, zero-regression holds). Deferred follow-ups: a
before/after PDF smoke check on a real legacy project, and `Custom`-size width/height inputs (the size
is selectable but currently falls back to A4).

## Plan 3 — Grid renderer (read-only, opt-in)  [done]

`GridStep` renderer consuming `step.grid` (rows × cells × primary image), gated on a new opt-in
per-step `layoutMode` so migrated books render pixel-identically through the proven path; a
step-editor Layout toggle makes it visible in the live preview. Image cells are overflow-free by
construction, so the `fitSteps`→`fitGrid` backstop is deferred (not needed until cells hold
overflow-capable content). Plan: `docs/superpowers/plans/2026-06-25-grid-renderer.md`.
Shipped on `feature/improvement-rev2` (commits `2e4610f..608384f`, 5 commits; suite 35/35, typecheck 0,
build OK; final whole-branch review: ready-to-merge, zero-regression holds — migration never sets
`layoutMode`, legacy JSX byte-identical, `fitSteps` skips grid pages). Deferred follow-up: style or drop
the `.editor-help` class; manual preview/PDF check of a grid-mode step. ADR-006 amended with the opt-in
rule.
(Scope split from the old "renderer + resize + cell stacks" sketch — drag-resize and cell stacks
are now their own plans below, keeping each slice small and zero-regression-safe.)

## Plan 4 — On-canvas divider resize  [done]

`PreviewGridResize` editor overlay (modelled on `PreviewAnnotations`) draws draggable row/column
divider handles over a grid-mode step; dragging applies Plan-1 `resizeAdjacent` (conserved-total,
mm min-floor via `bodyRegion`) live with a mm readout, writing fractions through new
`resizeGridRow`/`resizeGridColumn` store mutations. Editor-only — the renderer/print path is
untouched. Plan: `docs/superpowers/plans/2026-06-25-grid-resize.md`.
Shipped on `feature/improvement-rev2` (commits `606f9c8..435dbbe`, 4 commits; suite 39/39, typecheck 0,
build OK; final whole-branch review: ready-to-merge, editor-only/print-clean holds — zero renderer/print
changes). Deferred: mm-readout gap accuracy, in-browser drag manual check. (Scope: row + column resize +
mm readout; the grid-guides visibility toggle moved to Plan 6 where snapping makes guides useful.)

## Plan 5 — Grid structure editing + visible guides  [done]

Makes a grid-mode step operable: editor-only **guides** (dashed cell outlines scoped to
`.preview-scaler` + faint resting divider lines) so the grid is visible, plus **add/remove rows &
columns** from **both** a left-panel Grid section (steppers) and on-canvas +/× affordances — backed
by new `addGridRow`/`removeGridRow`/`addGridColumn`/`removeGridColumn` mutations that renormalize
fractions (Σ = 1; min 1 row / 1 cell). Editor-only; renderer/print untouched. Closes the usability gap
from Plans 3–4 (you couldn't see the grid or set row/column counts).
Plan: `docs/superpowers/plans/2026-06-25-grid-structure-editing.md`.
Shipped on `feature/improvement-rev2` (commits `3145cef..86c25e0`, 5 commits; suite 45/45, typecheck 0,
build OK; final whole-branch review: ready-to-merge, editor-only/print-clean holds). Deferred: on-canvas
button fire-on-pointerdown UX polish; out-of-bounds index guards.

## Plan 6 — Cell object stacks (callouts in cells)  [done]

Grid cells render **callout** objects alongside the primary image, plus a per-image **fit** mode
(`contain` / crop-width / crop-height). `legacyStepToGrid` migrates legacy callouts into cells (side →
`[image│callouts]`; below → Rule-1 callout row); `setStepLayoutMode` rebuilds the grid from legacy
fields on toggle so callouts carry. Schema gains `StackedObject.callout`/`fit`. Overflow keeps a clip
baseline (auto-shrink is Plan 8). Spec/plan under `docs/superpowers/`.
Shipped on `feature/improvement-rev3` (commits `a87a5b7..cc84299`, 8 commits; suite 60/60, typecheck 0,
build OK; final whole-branch review: ready-to-merge, zero-regression — migrated steps stay legacy,
single-image grid pixel-identical). ADR-006 + PRD amended (never-clip → text-only; images deliberately
croppable). Deferred: below-callout markers; cell-anchored annotation coords.

## Plan 7 — Grid cell authoring  [done]

Click a cell to select it (`PreviewGridSelect` editor overlay, `Selection.cellIndex`), then add / edit /
remove its image (reusing `ImagePicker`) and callouts from a left-panel `CellEditor`, with the image fit
control + an inline crop-confirm. Seven immutable cell-object mutations. Editor-only; renderer/print
untouched; callouts stay flow-stacked. Spec/plan under `docs/superpowers/`.
Shipped on `feature/improvement-rev3` (commits `b7e15be..81c4720`, 7 commits; suite 74/74, typecheck 0,
build OK; final whole-branch review: ready-to-merge, print-clean). No `Book` schema change. Deferred: the
stale-selection-on-removal fix (folded into Plan 8).

## Plan 8 — Grid overflow auto-shrink (`fitGrid`)  [done]

When a grid cell's callouts overflow, every callout-bearing cell on the step scales its content by one
**grid-uniform** factor (worst cell, floored at `MIN_GRID_SCALE = 0.5`, then clip + warn); image-only
cells are exempt. DOM-only `fitGrid` merged into `useAutoFit`, so it runs in **both** preview and
`/print`. A `.grid-cell-content` wrapper is the scale target; pure `gridFitScale` math is unit-tested.
Also folds in the Plan-7 stale-selection-on-row/column-removal fix. Spec/plan under `docs/superpowers/`.
Shipped on `feature/improvement-rev3` (commits `d2520c1..ebc9a5e`, 7 commits; suite 83/83, typecheck 0,
build OK; final whole-branch review: ready-to-merge). No `Book` schema change; ADR-006 amended (uniform
cell-content scale supersedes the page-scoped idea). Deferred: a `clientHeight > 0` guard.

## Plan 9 — On-canvas drag + absolute callout positioning  [done]

A grid-cell callout can be **dragged off the flow stack** to float at an absolute position within its
cell (over the screenshot or beside a letterboxed image). Opt-in per callout via a new
`StackedObject.positioned?` flag: the renderer splits each cell into a flow layer (`.grid-cell-content`,
the only layer `fitGrid` scales) and an absolute `.grid-cell-floats` layer, in **both** preview and
print. A new editor-only `PreviewCellFloat` overlay drags to detach / move, resizes width (height stays
content-driven), and click-selects; a left-panel **Dock to flow** button re-flows it. `fitGrid` is scoped
to flow callouts so floating ones are exempt (they clip past the cell edge). Spec/plan under `docs/superpowers/`.
Shipped on `feature/improvement-rev3` (commits `898a1fa..ba9c32e`, 6 commits; suite 98/98, typecheck 0,
build OK; final whole-branch review: ready-to-merge — pixel-parity + editor-only/print-accurate holds).
ADR-006 amended (the `positioned` flag + floating-layer mechanism). Deferred to human: in-browser/PDF
manual checks (drag/detach, print shows positions without handles, fitGrid exemption).

## Plan 10 — Rich-text block objects  [done]

`kind:"text"` cell blocks authored like callouts and rendered in the flow layer (preview + print),
fit-aware under `fitGrid`. Extends `lib/markdown.ts` with `## `/`### ` headings and `~~strikethrough~~`
(bold/italic/bullet/numbered already existed; underline and floating text were deliberately dropped).
New `StackedObject.text?`; `addCellText`/`updateCellText`; `RichTextArea` opt-in heading/strike toolbar;
`CellEditor` unified content-blocks list (callouts + text). Shipped on `feature/improvement-rev3` (impl
`d7eeb5b..4626bbe` + fix `c5ce00b`; suite 113/113, typecheck 0, build OK; final whole-branch review:
ready-to-merge). Additive schema, no migration. ADR-006 amended.

## Plan 11 — Grid-view polish  [done]

Three improvements from the Plan 10 smoke test. (1) **Text-block alignment** — per-block left / center /
right (`StackedObject.align?`); lists shrink-wrap so a centred list centres as a unit and a right one
aligns to its longest item. (2) **Per-image border / shadow that hugs the screenshot** —
`StackedObject.border?` (reuses the `Border` model); in contain mode the framed slot shrink-wraps the
image so the frame + shadow wrap the screenshot, crop modes still fill; full controls (on/off, colour,
width, radius, shadow). (3) **Hide-grid toggle** — a transient preview toggle that drops the editor
chrome (guides + handles) while keeping content and interactive annotations. Shipped on
`feature/improvement-rev3` (impl `e3e3f82..f445802` + fix `7cead99`; suite 117/117, typecheck 0, build OK;
final whole-branch review: ready-to-merge). Additive schema, no migration; ADR-006 amended. Also pinned
dev-only dependency advisories (esbuild / js-yaml) via `pnpm.overrides`.

## Backlog / next up

Captured from review + smoke testing; sequenced just-in-time into plans (brainstorm → spec → plan →
subagent-driven execution), each with its own ADR if it touches the schema or annotation model.

- **Floating annotation palette (per DESIGN.md / PRD.md)** — [done]. Annotation authoring moves
  off the left panel onto the canvas, per the design's **hybrid inspector** (`DESIGN.md:170-179`,
  `PRD.md:95`): a floating tool palette over the page canvas + a compact selection popover + full left-panel
  properties. Decomposed into slices:
  - **SP1 — floating tool palette + on-canvas drag-to-size creation + current-color control** — [done]
    (`feat/floating-annotation-palette`). `AnnotationPalette` floating bar (bottom-center, fixed to preview
    viewport); `activeTool`/`drawColor` transient store state (no schema change); `useAnnotationDraw` +
    `PreviewAnnotations` wiring: press→drag→release creates shapes via `boundsFromDrag` (rubber-band for
    box/diamond/text/bracket, signed start→end for line/connector), bare click drops a default-sized shape,
    one-shot tools auto-revert to Select + select new shape, `Esc` cancels, grid-mode pointer-events toggle;
    left-panel add-buttons removed (property cards kept). Editor-only; renderer + print untouched. ADR-004
    amended.
  - **SP1.1 — swatch palette + stroke-width presets** — [done] (`feat/annotation-swatch-width-palette`).
    8 OKLCH paired-token swatches (DESIGN.md §2.2: Ink / Red / Orange / Amber / Green / Teal / Blue /
    Violet) + 4 width presets (Thin 1 / Medium 2 / Thick 4 / Heavy 6); `swatchId` + `width` applied to
    shapes; fill/tint deferred to the OKLCH color system slice. No schema change; editor-only. ADR-004
    amended.
  - **SP2 — selection popover** — [done] (`feat/annotation-selection-popover`). Compact popover
    anchored to the selected shape: color (8 OKLCH swatches) + width presets + confirm-routed delete
    for all shapes; connector row adds `from`/`to` endpoint style, routing, and (square-only)
    direction; reuses `swatchPatch` and the shared option lists; hides during drag/resize via
    transient `annotationDragging` store flag; editor-only, no schema change.
  - **SP3 — annotation inspector redistribution** — [done] (`feat/annotation-inspector-redistribution`).
    Supersedes the SP3 "trim the panel" draft. The per-shape detail controls moved entirely out of the left
    sidebar: `AnnotationEditor` component deleted; a new **context row** in the bottom `AnnotationPalette`
    (`components/editor/AnnotationContext.tsx`) surfaces per-shape detail when a shape is selected —
    freeform color + width (all shapes); connector routing / waypoint stepper / from+to endpoint
    (style / size / direction[square] / binding ref+anchor); text font/size/align/color; bracket
    orientation/flip. The selection popover trimmed to color + width chips + delete `×` only (connector
    detail moved to the palette). Option lists fully consolidated in `lib/annotation-options.ts`
    (`SIZES`/`ANCHORS`/`FONTS`/`FONT_LABELS`/`ALIGNS` joined the existing
    `ENDPOINT_STYLES`/`ROUTINGS`/`DIRECTION_OPTIONS`). Intentionally dropped: numeric coords x/y/w/h,
    endpoint free-point x/y, the shape list (all canvas-reachable). Editor-only; renderer/print untouched;
    no schema change. Suite 219/219.

- **Bug — endpoint marker-size consistency** — [done] (`fix/annotation-endpoint-marker-size`).
  Endpoint arrowhead / circle / point markers were rendered at inconsistent sizes across styles.
  Fix: retune the per-style marker geometry in `AnnotationLayer.tsx`'s `endpointMarker` so every
  style (arrow / circle / diamond / point / bar) renders at a visually consistent size for a given
  endpoint size (small/medium/large). Renderer change only; editor + print identical; no schema
  change. (Stroke-width-relative marker scaling was deliberately left out of scope.)

- **Annotation delete key + confirm modal** — [done] (`feat/annotation-delete-confirm`).
  Delete/Backspace removes the selected annotation; the left-panel `×` uses the same path — both
  route through a reusable `ConfirmDialog` (Esc / overlay / Cancel dismiss; focus on Cancel;
  danger-toned Delete button). Pure `shouldHandleDeleteKey` guard (`lib/keyboard.ts`, unit-tested)
  skips `<input>`/`<textarea>`/`<select>`/`contenteditable` so text editing is never hijacked.
  Transient `pendingDelete` store state; `AnnotationDeleteController` mounted inside the store
  provider; editor-only (no schema change, renderer/print untouched). ADR-004 amended.

- **Editor-polish bundle** — [done] (`feat/editor-polish-bundle`). Five additive, editor-only
  improvements with no schema change, no migration, and renderer/print route untouched:
  - **Shape cycler:** Alt/Option-click cycles the active selection through overlapping rect-bearing
    shapes (`box`/`diamond`/`ellipse`/`text`/`bracket`) via pure `hitStack`/`nextInStack` helpers
    in `lib/annotations.ts`; plain click is unchanged; lines/connectors excluded. Cycler uses AABB
    bounds (deliberately looser than the SVG outline for diamond/bracket — a disambiguation tool
    benefits from a generous hit area).
  - **Text-label alignment while typing:** `.anno-editwrap` derives `justify-content` from the
    shape's `align` field so left/right-aligned labels no longer appear centered during editing.
    Pure CSS binding; no logic change.
  - **Equal-spacing distribution guides:** `snapDistribute` + `DistGuide` in `lib/annotations.ts`
    run alongside `snapAlign` on the annotation move drag — alignment wins per axis, distribution
    fills the rest. Editor-only magenta capped tick bars that never reach `AnnotationLayer` or the
    print path. Move-drag only; overlap-guarded; guide `at` is post-snap.
  - **Custom page-size inputs:** Width/Height (mm) number inputs in `PageSettings.tsx` shown when
    page size is "Custom"; values clamped by `clampPageMm` in `lib/grid-math.ts`. Schema already
    had `PageConfig.custom`; no model change.
  - **File-drop-onto-cell:** drag an image file onto a grid cell to upload (shared
    `lib/upload-image.ts` helper) and set it as the cell's image; drop highlight + red error
    outline on failure.

- **UI polish (per DESIGN.md)** — [todo]. Catch-all for visual + interaction refinement against the
  canonical design system in `DESIGN.md` (tokens, type scale, spacing, control styling, focus states,
  mini-toolbars, popovers, mobile touch targets ≥768/<768). Not yet scoped — break into concrete,
  verifiable passes during a brainstorm (e.g. audit editor chrome vs `DESIGN.md` section by section).
  Editor-only; `DESIGN.md` is the source of truth on visual questions.

- **Callout lists (numbered + bullet)** — [done]. Verified already implemented end-to-end: the bullet
  (`•`) and numbered (`1.`) toolbar buttons are always present in `RichTextArea`
  (`components/editor/RichTextArea.tsx:99-112`, not prop-gated); both callout body editors use it — legacy
  `CalloutEditor.tsx:148-153` and grid-cell `CellEditor.tsx:182-187`; the renderer runs callout bodies
  through block markdown in preview and print (`Callout.tsx:38` → `RichText.tsx:20-22` →
  `renderMarkdownBlocks`), with list CSS (disc/decimal + padding, Tailwind-preflight restored) at
  `renderer.css:452-513`. No code gap — only the missing numbered-list (`<ol>`) regression test was added
  (`lib/markdown.test.ts`, 4 cases incl. inline-marks-in-items and marker-type-switch; suite 121/121).
  By-design limits (documented in `markdown.ts:8-17`): no nested lists; bullet+numbered can't mix in one
  block.
- **Annotation snapping — object alignment + smart guides** — [done] (`feat/annotation-alignment-snapping`).
  Moving/resizing a rectangular surface (box/diamond/text/bracket) snaps its edges/center to other
  surfaces, the grid cell borders + primary image slots beneath, and the page (center + edges), any-to-any
  (Figma-exact), with red smart-guide lines. Pure `snapAlign` helper (`lib/annotations.ts`, 8 tests) +
  editor-collected targets (`collectSnapTargets` measures `.grid-cell`/`.img-slot`) in `PreviewAnnotations`;
  screen-consistent ~6px threshold; **Alt** bypasses snapping (surfaces + connectors → fully-free placement).
  Editor-only (guides never print); renderer/print untouched; no schema change. Spec/plan
  `docs/superpowers/{specs,plans}/2026-07-01-annotation-alignment-snapping*`, ADR-004 amended. Suite 168/168.
  *Still open (separate item):* fixed-**grid** snapping. Equal-spacing/distribution guides — [done] (`feat/editor-polish-bundle`); see **Editor-polish bundle** entry below.
- **Connector endpoints snap to grid content** — [done] (`feat/connector-grid-content-snapping`).
  A connector endpoint snaps to grid-content anchors — cell borders, screenshots, callouts, text blocks
  (`.grid-cell`/`.img-slot`/`.callout`/`.grid-text`) — landing as a **free point** (snap-and-stay, no
  binding), with snap dots shown on that content when a connector is focused (previously a grid step with
  no drawn shapes offered nothing to snap to). Pure `rectAnchors` + `nearestPoint` (`lib/annotations.ts`,
  5 tests); editor measures grid rects in `PreviewAnnotations`; precedence drawn-surface (binds) → grid
  (free point) → axis-snap; **Alt** bypasses; ~8px threshold. No schema change; renderer/print untouched.
  Spec/plan `docs/superpowers/{specs,plans}/2026-07-01-connector-grid-content-snapping*`, ADR-004 amended.
  *Still open (future):* true re-tracking binding of a connector to grid content.
- **Connector endpoint direction override** — [done] (Phase 1 `feat/connector-endpoint-direction`, Phase 2
  `feat/connector-direction-handle`). Complete: **panel** control (Phase 1) + **on-canvas drag knob**
  (Phase 2). Phase 2 adds a draggable direction knob on a stem at each endpoint of a focused square
  connector (`KNOB_PX=24`, run direction from `connectorRoute`); drag snaps `(pointer−endpoint)` via pure
  `compassDir` and writes `Endpoint.dir` (reuses Phase-1 field, no schema change). Editor-only (no print),
  `compassDir` 3 tests, suite 181/181. Spec/plan
  `docs/superpowers/{specs,plans}/2026-07-01-connector-direction-handle*`, ADR-004 amended.
- **Connector endpoint direction override (Phase 1)** — [done] (`feat/connector-endpoint-direction`).
  A square connector's endpoint can carry `Endpoint.dir?: "left"|"right"|"up"|"down"` so the arrow points a
  chosen way instead of only the dominant-axis heuristic (fixes "arrow stuck pointing up"). Routing
  (`lib/annotations.ts`): `anchorAxis`/`anchorDir` honor `dir` for free points (precedence explicit dir →
  anchor → heuristic), role-aware `anchorDir(ep,isTo)`, `squareRoute` sign-forces a single directed end via
  a `STUB` so ←/→ & ↑/↓ differ — gated on explicit `dir` so existing connectors route byte-identically. UI:
  auto/←/→/↑/↓ select in the connector inspector's From/To rows. Data-driven (editor + PDF identical),
  square-only, no schema bump. 5 tests, suite 178/178. Spec/plan
  `docs/superpowers/{specs,plans}/2026-07-01-connector-endpoint-direction*`, ADR-004 amended.
  *Phase 2 (pending):* on-canvas drag handle to set `dir` spatially. *Known limit:* mixed dir+far-anchor
  on a different axis follows layout.
- **Bug — square (orthogonal) connector routing** — [done] (`fix/connector-orthogonal-routing`). Root
  cause: `connectorPoints` picked the elbow orientation purely from the normalized run (`|Δx|≥|Δy|`) and
  ignored the side an *anchored* endpoint attaches to, so a connector bound to e.g. a box's **right** edge
  ran straight down the box edge instead of exiting rightward (verified against the live `/print` SVG; the
  free-point case was already correct, which is why it slipped through). Fix: a new pure
  `squareHorizontalFirst` helper in `lib/annotations.ts` forces the segment touching an anchored edge to be
  perpendicular to it (left/right→horizontal, top/bottom→vertical), source anchor first, then target, then
  the old dominant-axis fallback — pure geometry, so the editor overlay and print render identically. 7 new
  unit tests (`lib/annotations.test.ts`, first geometry tests for this module); suite 128/128; typecheck 0.
  ADR-004 amended. Deferred: two-corner (Z) route when both endpoints anchor to conflicting axes.
- **Bug — connector angle handling is not smooth** — [done] (`fix/connector-angle-smoothing`). Symptom
  (confirmed with the user): you couldn't hold a *shallow* angle while dragging an endpoint — the line kept
  snapping flat, worse on shorter connectors. Root cause: the horizontal/vertical axis-snap used a fixed
  *normalized distance* (`AXIS = 0.04`), so its angular width grows as the run shortens (a 0.1-long run snaps
  flat over ~±22°). Fix: new pure `snapAxisVector` helper in `lib/annotations.ts` snaps **angle-based**
  (`AXIS_SNAP_DEG = 6`, length-independent; Shift still hard-locks the dominant axis; signs preserved). Wired
  into `PreviewAnnotations` for *both* connector-endpoint and line-resize drags (same duplicated defect, now
  shared/DRY). 7 new unit tests; suite 135/135; typecheck 0; lint clean. ADR-004 amended. Note: the pure
  helper is fully unit-tested but the drag *feel* was not re-verified in-browser (extension not connected).
- **FigJam-style elbow connectors (epic)** — bringing `square` connectors to FigJam parity, in three
  sequenced sub-projects (each its own spec → plan):
  - **P1 — orthogonal auto-routing** — [done] (`feat/connector-elbow-routing`). Full L/Z/C/U routing in
    `connectorPoints` via the pure `squareRoute` helper (`lib/annotations.ts`): each edge-anchored end exits
    perpendicular to **and outward from** its edge (`anchorDir` + `STUB`), with the shape chosen
    deterministically — **L** (perpendicular axes), **Z** (opposite magnets facing toward), **C** (parallel
    magnets), **U** (opposite magnets facing away). Resolves the old "two-corner (Z) route" deferral. Pure
    geometry → renders identically in editor + print, no schema/renderer change. 6 new unit tests; suite
    140/140; typecheck 0; lint clean. Spec `docs/superpowers/specs/2026-06-29-connector-orthogonal-routing-design.md`,
    plan `docs/superpowers/plans/2026-06-29-connector-orthogonal-routing.md`, ADR-004 amended. Deferred:
    true obstacle avoidance (routing around box bodies in degenerate overlaps) — P3 handles are the remedy.
  - **P2 — rounded corners** — [done] (`feat/connector-rounded-corners`). Pure `buildRoundedConnector` helper
    (`lib/annotations.ts`) + `ConnectorLine` render: each elbow is a quadratic bend of `CORNER_RADIUS=0.02`
    (clamped per corner) in a nested `<svg viewBox="0 0 1 1">` path with `vector-effect="non-scaling-stroke"`;
    arrowhead markers kept in the outer `%` space via trimmed end-`<line>`s (a nested viewBox would distort
    them), meeting the rounded middle seamlessly. No schema change; editor + print identical; verified in the
    `elbow-demo` print render. Spec/plan `docs/superpowers/{specs,plans}/2026-06-30-connector-rounded-corners*`.
  - **P3 — interactive segment handles + relative-offset storage** — [done] (`feat/connector-segment-handles`).
    Additive `Connector.bends?: ConnectorBend[]` (`{ seg, axis, offset }`) storing each manual drag as a
    perpendicular **offset from the recomputed auto-route** (rides reflow; dropped on L↔Z↔C↔U class change;
    one bend per base segment). Pure `routeWithBends` (interior runs displace in place, anchored runs insert a
    `STUB` stub+jog for L-bending) + `connectorRoute`/`squareBaseRoute`/`bendForDrag` in `lib/annotations.ts`;
    `connectorPoints` delegates (no-bend path unrounded → byte-identical), so editor + print render identically
    and P2 rounding applies unchanged — `AnnotationLayer`/print path untouched. Editor: axis-constrained
    midpoint handle per draggable segment in `PreviewAnnotations.tsx`, writing `bends` immutably; `straight`
    keeps its `waypoints` handles. Suite 160/160; typecheck + lint clean; verified in the `elbow-demo` print
    render. Spec/plan `docs/superpowers/{specs,plans}/2026-06-30-connector-segment-handles*`, ADR-004 amended.
  - **Epic complete** — `square` connectors reach FigJam parity: orthogonal auto-routing (P1) + rounded
    corners (P2) + draggable, reflow-surviving segment handles (P3).

- **Improvement rev4 bundle** — [done] (`feature/improvement-rev4`). Six additive
  fixes/features: (1) demo hardening — `/demo` is seeded via a new `forceGridLayout` (always
  grid, never legacy), never offered for crash-recovery, and `useAutosave` no-ops for it (no
  localStorage mirror, no server PUT); (2) legacy→grid migration — confirmed feasible and
  lossless (`legacyStepToGrid` already total over `Step`); added a bulk `migrateAllStepsToGrid` +
  a "Migrate all legacy steps to grid" `BookSettings` action, and new steps (`blankStep`,
  `defaultBook`) now default to `layoutMode: "grid"` (legacy stays fully supported for existing
  content); (3) background image — added `Background.fit` (`auto`/`crop`/`shrink`/`fit`/
  `stretch`, `PageBackground` switched from a CSS `background-image` div to an `<img>` +
  `object-fit` so `scale-down` is available) and fixed the image being stored as a slug-baked URL
  (now a bare filename resolved per-project via new `backgroundImageSrc`, mirroring
  `watermarkIconSrc`); (4) watermark — `.wm-mark` is now a row (icon left of text, not stacked),
  icon sizing rebalanced for that layout; opacity was already applied once on the outer wrapper
  (confirmed consistent, no change needed); (5) fonts — `--font-heading`/`--font-body` repointed
  to Roboto by default, with a new `--font-cover` (Montserrat) so only the cover title keeps its
  old look; (6) restore/discard — `restore()` now checks if the original project is still alive
  server-side and, if so, PUTs the cached book onto that *same* slug and reopens it (assets
  untouched, fixing the "images vanish on restore" bug) instead of always recreating a new,
  asset-less project; added a per-item **Discard** action on the homepage reusing `ConfirmDialog`
  (same pattern as `AnnotationDeleteController`) that calls a new `DELETE /api/projects/[slug]`
  and clears the local cache entry. No `schemaVersion` bump — every addition is an optional field
  with a defaulted fallback. Spec/plan
  `docs/superpowers/{specs,plans}/2026-07-06-editor-improvement-rev4*`. Suite/typecheck/lint were
  verified against a clean install after a sandbox filesystem-sync issue prevented running them
  in-session against live edits — every changed file was re-synced verbatim and re-verified before
  commit. Shipped on `feature/improvement-rev4` (commit `968779d`, 23 files, suite/typecheck/lint
  clean); merged to `main` via `--no-ff` merge commit `1862764`. Branch intentionally kept (not
  deleted) as a fix-forward point in case issues surface post-merge.

- **Improvement rev6 bundle** — [done] (`feature/improvement-rev6`). Six additive,
  editor-only-authoring features shipped across three SDD waves, no schema migration:
  (1) darker blue/violet annotation swatch strokes (`#1A5FB4` / `#6740B8`), which also
  shifts the `info` callout color; (2) multi-line annotation text labels with correct
  alignment (newlines preserved) and draggable labels that re-anchor on snap-back via a
  new `TextLabel.labelOffset?`, rendered through the existing masked opaque-pill path so
  no stroke crosses the text; (3) a draggable annotation selection popover — drag it
  aside by a grip, editor-only, per-annotation, non-persisted; (4) annotation z-order —
  bring-forward / send-backward on the popover (`raiseAnnotation`/`lowerAnnotation`) —
  and an adjustable fill-opacity slider (`Surface.fillOpacity?`), single-opacity WYSIWYG
  so preview and `/print` render identically; (5) chapter cover image — place an image
  anywhere on the chapter-intro page and drag/resize it on-canvas (`Chapter.coverImage?`;
  editor-only overlay, data-driven render in print); (6) per-page background + text color
  for the cover, chapter-intro, and back-cover pages (`Book.coverBackground?`/
  `coverTextColor?`, `Chapter.background?`/`pageTextColor?`, `Ending.background?`/
  `pageTextColor?`), layering over the existing book-level fallback — scoped to those
  three page types only, no per-step background. All fields additive/optional; no
  `schemaVersion` bump, no migration. ADR-004 (annotations) and ADR-001/ADR-005
  (renderer/persistence) amended per wave. Spec/plans
  `docs/superpowers/{specs,plans}/2026-07-26-editor-improvement-rev6*`. Shipped on
  `feature/improvement-rev6` (17 commits across 3 waves, HEAD `8501d6c`; suite 287/287,
  typecheck clean); branch not yet merged to `main`.

- **Left-sidebar design polish** — [done] (`feature/sidebar-design-polish`). Production
  DESIGN.md alignment of the left editor pane, no behavior changes, renderer/print
  untouched: (1) three new `@theme` UI tokens — `--color-selection: #3b82f6`,
  `--color-hover-bg: #f0f5f6`, `--color-danger-text: #9e332f` (AA-safe small danger
  text) — plus adoption of the existing `--color-paper` across `editor.css` (25 sites);
  (2) zero-dep toast system — store `notices` channel (`pushNotice`/`dismissNotice`) +
  `components/editor/Toast.tsx` fixed bottom-left stack (~4s auto-dismiss paused on
  hover/focus, manual ×, `role="alert"`, reduced-motion safe); ImagePicker upload errors
  migrated off the permanent inline `.img-picker-error`; (3) crop hint restyled as the
  canonical `.status-pill` (formalized from `.overflow-warn`); (4) "Remove image" fixed
  from a wrapped 22px `.mini-btn` to a proper `.btn-outline-danger`; a new
  `.border-controls` rule styles the CellEditor border rows (the old `.border-fields`
  grid stays for RowCard); (5) section labels to mono 10px/500/1.5px, radius 6→7px
  outliers, row-card 10→9px; (6) a11y — `:focus-visible` rings on all sidebar controls
  (`.seg` unclipped via `overflow: visible` + end-cap radii) and `aria-pressed` on all
  segmented buttons. DESIGN.md gained Notification (toast/pill), danger-button, and
  Sub-header/Dense-control roles + the new tokens. Spec/plan
  `docs/superpowers/{specs,plans}/2026-08-02-left-sidebar-polish*`. Suite 288/288,
  typecheck/build clean; final opus review APPROVE (5 non-blocking notes parked).
  Note: `pnpm e2e` is unrunnable repo-wide (no `playwright.config.*` committed) —
  pre-existing, unrelated.

- **Crop-fit stretch bugfix** — [done] (merge `223d521`). "Crop height"/"Crop width"
  image fit modes stretched grid-cell images: the base `.grid-cell .img-slot img`
  `max-width/height: 100%` clamp broke the crop rules' intrinsic-ratio box and
  `object-fit: fill` squashed the image. Fixed with `max-width/height: none` in both
  `.fit-width`/`.fit-height` img rules (`components/renderer/renderer.css` only —
  shared by preview and print). Semantics: fill the stated axis at intrinsic ratio,
  crop overflow (top/left-anchored), short axis stays blank. Suite 288/288.
  Follow-up candidate: the now-inert `object-fit: fill` could be removed.

## Later (v3 remainder)

- **Annotation standardization** (ISO 32000 vocabulary; Circle + Polygon / Diamond preset; 8-handle
  selection; segment-drag connector reshape; arrow-snap defaults; grid-guides on/off toggle).
- **OKLCH color system** (paired tokens in `@theme`; swatch palette + hybrid inspector; editor-only fill
  tint, full opacity in export; unify callouts).
- **Misc:** file-drop-onto-cell image upload — [done] (`feat/editor-polish-bundle`); `Custom` page-size width/height inputs — [done] (`feat/editor-polish-bundle`).
