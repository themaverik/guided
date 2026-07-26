# Editor Improvement rev6 (design)

**Date:** 2026-07-26
**Branch:** `feature/improvement-rev6` (base `main` `f7828bb`)
**Status:** Draft — awaiting user review.

Six additive improvements bundled into one branch, shipped in three waves.
Waves 1 (surgical, no schema), 2 (annotation-model additions, ADR-004 amend),
3 (renderer/print additions, ADR-001 + ADR-005 amend). Executed via
**subagent-driven development** with **karpathy-guidelines** discipline.

## Global constraints

- **All schema changes are additive.** No `schemaVersion` bump, no migration.
  Every new field is optional; absent = today's behavior byte-for-byte.
- **Immutability:** all `Book` edits go through `lib/book-mutations.ts`
  (structuredClone-based). Never mutate document state in place.
- **`Book` JSON is the source of truth.** The label offset, fill opacity,
  z-order, chapter image, and per-page background/ink are all data on the
  `Book`; HTML/PDF are derived-only.
- **Editor-only vs render.** #1 and the popover/context UI are editor-only
  (`components/editor/**` + editor CSS), never printed. #2 fill-opacity, #3
  label offset, #4 colors, #5 chapter image, and #6 per-page background/ink are
  **data-driven render** — they run in both the editor preview and the `/print`
  export path (`components/renderer/**`).
- **Grid affordances untouched.** No changes to `components/editor/PreviewGrid*`
  or the grid layout engine.
- **Pure geometry/helpers are unit-tested** (vitest, following
  `annotations.test.ts` / `book-mutations.test.ts` / `book-render.test.ts`
  style). UI/CSS/interaction is build- + manual-verified (repo convention — no
  DOM test harness). Suite stays green; net-new tests for new pure helpers only.

---

# Wave 1 — surgical, no schema

## 1 — Draggable selection popover

**Problem.** `AnnotationSelectionPopover` (`AnnotationSelectionPopover.tsx`,
`.anno-popover` `editor.css:1376`) anchors above the selected shape (flips below
when it would clip the top) via `popoverPlacement`. Because it sits directly over
the shape's bounds, it can obstruct the exact area being annotated. There is no
way to move it out of the way.

**Design.** Make the popover draggable by its bar; the auto-placement stays the
default until the user drags.

- Add a drag affordance (grab the toolbar bar / a small grip) to `.anno-popover`.
  Pointer-drag adjusts a `{dx, dy}` px offset applied on top of the computed
  `popoverPlacement` `top/left`.
- The offset is **editor-only, never persisted to `Book`.** Held in component
  state as a `Map<annotationId, {dx,dy}>` so a moved popover keeps its spot while
  that shape stays focused ("per annotation"); cleared on step change.
- Auto-placement (above/below flip + viewport clamp) still runs; the stored
  offset is added afterward, then re-clamped inside the container so it can't be
  dragged fully off-screen.
- Hidden during an active shape drag (unchanged) — the popover offset drag is a
  distinct gesture on the bar, not on the canvas.

**Tests.** None (editor-only interaction). Manual: select a shape, drag the
popover aside, confirm it stays put while focused and resets on re-select of a
different shape / step change.

## 3a — Text-label newlines + centering

**Problem (blocker).** The inline `TextEditor` (`PreviewAnnotations.tsx:772`)
saves `e.currentTarget.textContent` on `onInput` (`:830`) and `onBlur` (`:838`).
`textContent` **collapses** the `<div>`/`<br>` line breaks a contentEditable
produces, so newlines are silently dropped. And the render side
(`LabelBox`/`ShapeLabel` `AnnotationLayer.tsx:37–71`; the free-`text` `.anno-text`
div `AnnotationLayer.tsx:162–189`) has no `white-space` handling, so even a
stored `\n` would not wrap. Separately, the live editor's alignment can drift from
the rendered label ("not always centred").

**Design.**
- **Capture newlines:** `TextEditor` reads `e.currentTarget.innerText` (preserves
  visual line breaks as `\n`) in both `onInput` and `onBlur`.
- **Render newlines:** add `white-space: pre-wrap` to the label/text render
  classes — `.anno-shape-label span` and `.anno-text` (renderer CSS), and the
  `.anno-text.editing` overlay (`editor.css:635`) so what-you-type == what renders.
- **Centering:** confirm the edit overlay's justify + `text-align` match the
  rendered `LabelBox` for every `align` value; the align-while-typing wire from
  the polish bundle (`.anno-editwrap` justify from `a.align`) already exists —
  verify closed-shape labels (box/diamond/ellipse fill-bounds path) centre both
  while editing and when rendered, and fix any residual divergence.

**Tests.** None (CSS/interaction + a one-line source swap). Manual: type a
multi-line label on a box and a connector; confirm the break survives blur,
reopen, and print; confirm left/centre/right match while typing and rendered.

## 4 — Darker blue + purple swatch strokes

**Problem.** The `blue` (`#217fd0`) and `violet` (`#8464cf`) strokes in `SWATCHES`
(`annotation-palette.ts:21–22`) read lighter/brighter than the rest of the
palette (which sits at green/teal depth).

**Design.** Swap the two strokes; keep the paired light fills unchanged so only
the border/line darkens.

- `blue.stroke` `#217fd0` → **`#1A5FB4`**
- `violet.stroke` `#8464cf` → **`#6740B8`**
- `ink` (the default swatch) and every other swatch are untouched.
- The mirrored `@theme` tokens `--swatch-blue-stroke` / `--swatch-violet-stroke`
  (`globals.css:45,47`) must be updated to match — `swatch-tokens.test.ts`
  enforces the mirror and will fail until they are.
- **Coupling (accepted):** `--swatch-blue-stroke` also drives info-callout
  title/marker/border (`globals.css:53–56`), so info callouts pick up the new
  blue. This is intended. `violet` is annotation-only. Callouts are re-rendered
  from `Book` each time; nothing derived is stored.

**Tests.** `swatch-tokens.test.ts` (existing drift test) passes with the new
values. Manual: eyeball a blue + violet annotation and an info callout.

---

# Wave 2 — annotation-model additions (ADR-004 amend)

## 2 — Z-order + fill transparency

**Problem.** Two overlapping filled shapes: the later one in the `annotations`
array paints on top (`AnnotationLayer.tsx:356` maps surfaces in array order), and
its fill is an **opaque** swatch tint, so the shape beneath is fully hidden with
no way to (a) reorder or (b) see through.

**Design — reorder (no schema field).**
- New immutable helpers in `lib/book-mutations.ts`: `raiseAnnotation(step/row, id)`
  and `lowerAnnotation(step/row, id)` — swap the target with its next/previous
  sibling in the `annotations` array (returns a new `Book`). No-op at the ends.
- Store actions `bringAnnotationForward` / `sendAnnotationBackward` (mirror the
  existing `updateAnnotation` plumbing across the annotation containers: step,
  row, grid-cell, freeAnnotations — reuse the same container-resolution the
  update path uses).
- Two buttons (forward / backward icons) in `AnnotationSelectionPopover` next to
  Delete.
- **Scope:** reorder acts within the **surface paint stack.** `AnnotationLayer`
  renders all surfaces, then all connectors, so connectors remain above surfaces
  (unchanged). The stated use case — overlapping shapes — is surfaces, and their
  relative order follows the array, so forward/back works without touching the
  layer split. Documented as a deliberate limit.

**Design — transparency (schema).**
- Add `Surface.fillOpacity?: number` (0–1, default 1) to `book-schema.ts`.
- Render: box/diamond/ellipse pass `fillOpacity` as the SVG `fill-opacity`
  attribute on the `<rect>`/`<ellipse>`/diamond `<path>` (`AnnotationLayer.tsx:88–160`)
  — affects the fill only, not stroke or label. For the free-`text` block, convert
  `fill` + `fillOpacity` to an `rgba()` background so the box tint fades but the
  text stays opaque.
- Editor: an opacity `<input type="range">` (0–100%) in the `AnnotationContext`
  context row (`AnnotationContext.tsx:169–183` / `:294`), shown only when Fill is
  on. Writes `fillOpacity` via `updateAnnotation`.

**Tests.** `raiseAnnotation` / `lowerAnnotation` in `book-mutations.test.ts`
(reorder, no-op at ends, immutability). `fillOpacity` clamp helper (if extracted)
+ schema round-trip. Manual: two overlapping filled boxes — reorder + lower the
top's opacity, confirm the lower shows through in preview and print.

## 3b — Draggable labels

**Problem.** A shape's text label is pinned to its default anchor — box/diamond/
ellipse fill-bounds centre, line/bracket/connector masked midpoint (`labelRect` /
`labelRectAt` in `lib/annotations.ts`). It cannot be moved off the shape.

**Design.** Add an optional label offset; a dragged label detaches to a masked
free box; drag-to-centre clears it.

- Add `TextLabel.labelOffset?: { x: number; y: number }` (normalized 0–1 offset
  from the label's default anchor) to `book-schema.ts:133–142` — inherited by
  both `Surface` and `Connector`.
- Rendering: when `labelOffset` is set, the label renders through the **masked
  free-label path** (the `LabelBox … masked` box) positioned at
  `defaultAnchor + offset`, so — per the requirement — the shape's stroke/border
  never draws a line *through* the text wherever it lands. When unset, today's
  pinned centre/midpoint is used unchanged.
- Editor: dragging the label (a drag handle on the label box in
  `PreviewAnnotations.tsx`) writes `labelOffset` via `updateAnnotation`; releasing
  near the default anchor (within a small snap radius) clears it back to `undefined`.
- Pure geometry helper (e.g. `labelRectWithOffset` / extend `labelRect`) computes
  the offset rect and is unit-tested; the `TextEditor` overlay reuses the same
  rect so editing tracks the moved label.

**Tests.** Label-rect-with-offset helper in `annotations.test.ts` (offset applied,
clamped in-bounds, clear-on-snap-to-centre). Manual: drag a box's label off the
box, confirm no stroke crosses the text, edit it, print it; drag back to centre
and confirm the offset clears.

---

# Wave 3 — renderer/print additions (ADR-001 + ADR-005 amend)

## 5 — Chapter cover image

**Problem.** The chapter-intro page (`ChapterIntro.tsx`) is mostly centred
whitespace and supports no image. Authors want to place an image anywhere on it.

**Design.** Add an optional, freely-placed chapter image rendered on the
chapter-intro page (prints).

- Schema: `Chapter.coverImage?: { image: string; x: number; y: number; w: number;
  h: number; fit?: ImageFit }` — bare filename (resolved via `backgroundImageSrc`
  like watermark/background so it survives download/re-import), normalized 0–1
  rect on the page, reusing the existing `ImageFit` model (default `contain`).
- Render: `ChapterIntro` draws an absolutely-positioned `<img>` at the normalized
  rect, behind the text furniture but above `PageBackground`/`Watermark`. A4Book
  resolves the filename to a URL and passes it down (mirrors the `bg`/`wm`
  resolution `A4Book.tsx:44–51`).
- Editor: pick a file in chapter settings (reuse `uploadImage` +
  `ImagePicker`-style flow); once set it appears on the chapter-intro preview with
  move + resize handles (drag anywhere, clamped to the page). New immutable
  mutation `setChapterCoverImage(ci, patch)` + a small editor overlay for the
  chapter-intro page.

**Tests.** `setChapterCoverImage` in `book-mutations.test.ts` (set, clear, clamp,
immutability). A `book-render` resolution test for the filename→URL path. Manual:
place + drag + resize on a chapter intro, confirm it prints.

## 6 — Per-page background + font contrast

**Problem.** `book.background` and `book.pageTextColor` are **book-level** — one
background and one ink override for the whole document (`A4Book.tsx:49–61`, ink
applied once at the `BookCanvas` root and cascaded to every page). No per-page
control, and a per-page background needs its own legible text colour.

**Design.** Opt-in per-page background + ink override on the three non-step page
types, with book-level values as the fallback and no-background pages unchanged.

- Schema (additive):
  - `Chapter.background?: Background` + `Chapter.pageTextColor?: string` (its
    intro page).
  - `Ending.background?: Background` + `Ending.pageTextColor?: string` (back cover).
  - `Book.coverBackground?: Background` + `Book.coverTextColor?: string` (front
    cover).
- Render:
  - A4Book resolves each of the three pages' own background filename→URL
    (fallback to the book background) and passes the resolved `Background` to
    `CoverPage` / `ChapterIntro` / `BackCover` instead of the shared `bg`.
  - Per-page ink: each of those three page components applies
    `style={pageInkVars(pageTextColor ?? book.pageTextColor)}` on its own `.page`
    `<section>`, overriding the root cascade for that page only. Step pages keep
    the root cascade untouched.
- **Steps and no-background pages are byte-identical to today** (they resolve to
  the book-level background + the root ink).
- Editor: a background/ink control block per chapter (chapter settings), plus the
  cover and ending settings — reuse the existing `BackgroundSettings` pattern
  (file pick + fit + opacity + text-colour), scoped to each container.

**Tests.** `pageInkVars` already covered; add resolution/fallback tests for the
per-page background source (page value wins, else book, else none) in
`book-render.test.ts`. Manual: set distinct backgrounds + text colours on cover,
a chapter intro, and back cover; confirm each page overrides independently, steps
unchanged, and all print correctly.

---

## Task breakdown (for the plan)

Ordered by wave, smallest-risk first within each:

**Wave 1**
1. **#4** — swap the two strokes + mirrored tokens; `swatch-tokens.test.ts` green.
2. **#3a** — `innerText` capture + `white-space: pre-wrap` + centering verify.
3. **#1** — draggable popover offset (per-id state, re-clamp).

**Wave 2** (ADR-004 amended first)
4. **#2 reorder** — `raiseAnnotation`/`lowerAnnotation` mutations + store actions
   + popover buttons.
5. **#2 opacity** — `Surface.fillOpacity` + SVG `fill-opacity` / rgba text bg +
   context-row slider.
6. **#3b** — `TextLabel.labelOffset` + masked-offset render + label drag/snap-clear
   + rect helper.

**Wave 3** (ADR-001 + ADR-005 amended first)
7. **#5** — `Chapter.coverImage` + `ChapterIntro` render + resolution +
   `setChapterCoverImage` + editor overlay.
8. **#6** — per-page `background`/`pageTextColor` fields + per-page resolution +
   per-page `pageInkVars` + settings blocks.

**Docs**
9. Amend **ADR-004** (label offset, fill opacity, z-order reorder), **ADR-001**
   (chapter cover image), **ADR-005** (per-page background/ink); update `ROADMAP.md`
   backlog markers + `README` if user-facing.

## Out of scope (deferred)

- Per-**step** background images (Wave 3 is intro/cover/back only — "smaller for
  now").
- Connector/line participation in z-order beyond the surface stack (connectors
  stay above surfaces).
- Auto light/dark contrast picking from the image (manual per-page text colour
  chosen).
- Persisting the popover offset to `Book` (editor-only, session-scoped).
- ISO-32000 annotation standardization (still user-deferred).

## Success criteria

- The selection popover can be dragged aside and stays put while its shape is
  focused; auto-placement is the default until dragged; nothing persists to `Book`.
- Multi-line labels survive typing → blur → reopen → print; labels match their
  `align` while typing and rendered.
- Blue + violet annotation strokes are `#1A5FB4` / `#6740B8`; info callouts pick
  up the new blue; ink unchanged; drift test green.
- Overlapping filled shapes can be reordered (forward/back) and the top's fill
  opacity lowered so the one beneath shows through — in preview and print.
- A shape's label can be dragged off the shape with no stroke crossing the text,
  and dragged back to clear the offset; default unset = today.
- A chapter image can be placed/dragged/resized on the chapter-intro page and
  prints.
- Cover, chapter-intro, and back-cover pages each take an independent background +
  text colour; steps and no-background pages are identical to today.
- `pnpm typecheck` / `lint` / `test` / `build` green; new pure helpers covered.
- All schema additions optional; no `schemaVersion` bump, no migration. ADR-004 /
  ADR-001 / ADR-005 amended before their wave's code.
