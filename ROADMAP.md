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
a clean preview. 117 unit tests, renderer/print zero-regression, editor-only affordances, additive
schema (no migration). Remaining v3 work — annotation standardization (ISO 32000 vocabulary) and the
OKLCH color system — plus the backlog below. (Note: plan numbering was re-sequenced during just-in-time
brainstorming; annotation standardization and color moved later than the original 6–8 sketch.)

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
- **Annotation snapping — more options:** extend snapping beyond image edges / center / manual anchors
  (e.g. snap to the grid, to other objects' edges/centers, and equal-spacing / alignment guides). Builds
  on the Phase-11 "snapping needs design" note.
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
  - **P3 — interactive segment handles + relative-offset storage** — axis-constrained midpoint handles on
    each straight run (horizontal segment drags vertically, vertical drags horizontally), a *stored*
    relative-offset model so manual drags persist, and reflow preservation when a connected object moves.
    Schema change + its own ADR amendment; needs a dedicated brainstorm for the offset storage model
    (today's `waypoints` are absolute and won't track object moves).

## Later (v3 remainder)

- **Annotation standardization** (ISO 32000 vocabulary; Circle + Polygon / Diamond preset; 8-handle
  selection; segment-drag connector reshape; arrow-snap defaults; grid-guides on/off toggle).
- **OKLCH color system** (paired tokens in `@theme`; swatch palette + hybrid inspector; editor-only fill
  tint, full opacity in export; unify callouts).
- **Misc:** file-drop-onto-cell image upload; `Custom` page-size width/height inputs.
