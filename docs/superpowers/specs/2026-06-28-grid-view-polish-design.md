# Plan 11 — Grid-view polish (design)

**Date:** 2026-06-28
**Branch:** `feature/improvement-rev3` (base `c5ce00b`)
**Status:** Approved — proceeding to implementation plan.

## Goal

Three independent grid-view polish improvements surfaced by the Plan 10 smoke
test:

1. **Text-block alignment** — center / right alignment for a rich-text block
   (paragraphs and lists).
2. **Image border + drop shadow in grid** — expose border colour / width /
   radius / shadow controls for a cell's image, with the frame hugging the
   actual screenshot (not the cell box).
3. **Hide-grid toggle** — a transient toolbar toggle that hides the grid editor
   chrome for a clean layout preview, keeping content and annotations.

Each is small and self-contained. Features 1 & 2 add optional schema fields
(ADR-006 amendment, no migration). Feature 3 is pure editor state.

## Scope decisions (locked during brainstorming)

- **Text alignment is per text block** (one alignment for the whole block —
  paragraphs and lists together), not per paragraph. Default left.
- **Image frame hugs the actual image:** in `contain` (Maintain ratio) mode the
  framed image shrink-wraps so the border + shadow outline the real screenshot;
  in crop modes (Crop height / Crop width) the image fills the cell and the
  frame hugs the cell (correct there).
- **Full image border controls:** on/off, colour, width, radius, drop shadow —
  reusing the existing `Border` / `BorderStyle` model.
- **Hide-grid hides editor chrome only** (cell guides, add/resize handles,
  cell-select highlight, floating-callout handles); content + annotations stay.
  Transient (session-only, not saved to the book), default shown.
- **Annotations in hide-grid mode:** annotation shapes stay visible and
  interactive; their handles already render only for the focused annotation, so
  they appear on focus and disappear on deselect. Hide-grid must keep that
  working (you can still focus an annotation to edit it, and click blank to
  defocus).

## Out of scope

Per-paragraph alignment; underline; changes to the legacy (non-grid) render
path; persisting the hide-grid preference; changes to callout or annotation
data models.

## Architecture

### Feature 1 — Text-block alignment

- **Model (`lib/book-schema.ts`):** `StackedObject.align?: "left" | "center" |
  "right"` — text-block semantics; absent = left. Mirrors the existing
  `Surface.align` field name/type.
- **Mutation (`lib/book-mutations.ts`):** `setCellTextAlign(book, ci, si, ri,
  cellIndex, objIndex, align): Book` — immutable, kind-guarded to `"text"`,
  same-`book` ref on bad index / non-text. Store action wrapper.
- **Render (`components/renderer/GridStep.tsx`, `renderer.css`):** GridStep adds
  an `align-center` / `align-right` modifier class to the text block's
  `.grid-text` element (omitted for left). CSS:
  - paragraphs: `.grid-text.align-center { text-align: center }` /
    `.align-right { text-align: right }`.
  - lists: `.grid-text.align-center ul, .grid-text.align-center ol { width:
    fit-content; margin: 1mm auto }` centers the list block; `.align-right ul,
    .align-right ol { width: fit-content; margin: 1mm 0 1mm auto }` shrink-wraps
    the list to its longest item and shifts it as a unit to the right (the
    "align all list items to the longest" behaviour).
  Prints (data-driven render).
- **Authoring (`components/editor/CellEditor.tsx`):** three align buttons
  (L / C / R) in the text block's editor row (next to move/remove), calling
  `setCellTextAlign`; the active alignment is highlighted.

### Feature 2 — Image border + shadow in grid (frame hugs the image)

- **Model (`lib/book-schema.ts`):** `StackedObject.border?: Border` on the image
  object (reuses `Border` = `boolean | BorderStyle`: colour, width, radius,
  shadow). Absent → `ImageSlot`'s existing default frame (so existing grid
  images are unchanged in their framing controls).
- **Mutation (`lib/book-mutations.ts`):** `setCellImageBorder(book, ci, si, ri,
  cellIndex, border): Book` — sets the primary image object's `border`;
  immutable, no-op same-`book` ref when there is no image. Store action wrapper.
- **Render (`components/renderer/GridStep.tsx`, `ImageSlot.tsx`,
  `renderer.css`):** GridStep passes `border={imageObj.border}` to `ImageSlot`
  (which already resolves a `Border` to frame + shadow inline styles via
  `resolveBorder`). The grid-only CSS change: in `contain` mode the framed
  `.img-slot` shrink-wraps to its displayed image (`width/height: auto;
  max-width/height: 100%`) and centers in the cell, so border + shadow hug the
  screenshot; crop modes keep `width/height: 100%` (fill the cell). A small
  shadow gutter (inset so the framed image never touches the cell edge) keeps
  `.grid-cell { overflow: hidden }` (required by fitGrid) from clipping the
  shadow. The legacy path and `ImageSlot`'s existing behaviour outside the grid
  are untouched.
- **Authoring (`components/editor/CellEditor.tsx`):** a Border section in the
  image controls — border on/off, colour picker, width, radius, drop-shadow
  toggle — assembling a `Border` value and calling `setCellImageBorder`.

### Feature 3 — Hide-grid toggle

- **State (`lib/store.tsx`):** a transient UI flag `hideGridChrome: boolean`
  (default false) + a `toggleGridChrome` / `setHideGridChrome` action. App/UI
  state only — never written to the `Book`.
- **Toolbar (`components/editor/PreviewPane.tsx`):** a toggle button in the
  preview toolbar (shown when the selected step is in grid mode), e.g.
  "Hide grid" / "Show grid".
- **Behaviour:** when `hideGridChrome` is true and the step is grid mode:
  - do NOT mount `PreviewGridSelect`, `PreviewGridResize`, `PreviewCellFloat`;
  - add a class on `.preview-scaler` (e.g. `chrome-hidden`) that disables the
    dashed cell-guide outlines / guide lines CSS;
  - keep `PreviewAnnotations` mounted, but in its normal interactive mode
    (`gridMode={false}` while chrome is hidden) so the annotation SVG regains
    pointer events: you can focus an annotation (handles appear) and click blank
    to defocus (handles disappear). This yields the clean preview — grid
    scaffolding gone, annotation shapes visible, handles only while focused.
  - Editor-only throughout: nothing here touches `components/renderer/**` or the
    print path.

## Testing

- `lib/book-mutations.test.ts`: `setCellTextAlign` (sets align; kind-guard
  no-op on non-text / bad index, same-ref); `setCellImageBorder` (sets the
  primary image's border; no-op same-ref when no image).
- CSS / overlay / toggle / shrink-wrap framing behaviour is build- and
  manually-verified (no DOM test harness — project convention).

## Files touched

- Modify: `lib/book-schema.ts` (`align?`, `border?` on `StackedObject`)
- Modify: `lib/book-mutations.ts` (`setCellTextAlign`, `setCellImageBorder`)
- Modify: `lib/store.tsx` (two cell action wrappers + `hideGridChrome` flag +
  toggle action)
- Modify: `components/renderer/GridStep.tsx` (align class; pass image border)
- Modify: `components/renderer/ImageSlot.tsx` + `renderer.css` (grid contain
  shrink-wrap + shadow gutter; `.grid-text` align CSS)
- Modify: `components/editor/CellEditor.tsx` (align buttons; image Border
  section)
- Modify: `components/editor/PreviewPane.tsx` (hide-grid toggle + conditional
  overlay mount + `gridMode` wiring) + `components/editor/editor.css`
  (`.preview-scaler.chrome-hidden` guide suppression)
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`
  (amendment: `align` + `border` on `StackedObject`)
- Tests: `lib/book-mutations.test.ts`

## Success criteria

- A text block can be set left / center / right; paragraphs follow, and lists
  center as a block or right-align to their longest item; renders identically in
  preview and `/print` / PDF.
- A grid image exposes border on/off, colour, width, radius, shadow; the frame +
  shadow hug the actual screenshot in contain mode and the cell in crop modes,
  with the shadow not clipped.
- The hide-grid toggle removes all grid editor chrome for a clean preview while
  annotations stay visible and editable (handles only while focused); toggling
  back restores full editing.
- Callouts, the legacy render path, and existing books' data are unchanged; no
  schema migration. `pnpm typecheck`, `pnpm lint`, `pnpm test` green.
