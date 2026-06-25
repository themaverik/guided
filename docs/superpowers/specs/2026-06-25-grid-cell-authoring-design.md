# Grid Cell Authoring — Design Spec (Plan 7)

- Status: Approved (brainstorm complete; feeds writing-plans)
- Date: 2026-06-25
- Branch: `feature/improvement-rev3` (BASE = Plan 6 HEAD `cc84299`)
- Relates to: ADR-006 (flexible grid / cell object stacks), Plan 6 spec (`2026-06-25-grid-cell-objects-design.md`).
- No `Book` schema change → no ADR amendment (the cell object model + `callout`/`fit` fields already shipped in Plan 6; cell selection is editor state).

## Context and Problem

Plan 6 made grid cells *render* images + callouts and migrated legacy callouts in, but there is **no way to author cell content in grid mode**. The left panel shows only structure controls (`GridStructure`: rows/columns); there is no "Choose image" or "Add callout" per cell (the panel even says "Callouts and drag-resize are coming in a later update"). So a freshly-toggled grid step, or any empty cell created via add-row/add-column, cannot be filled.

This plan makes a grid cell authorable: **click a cell to select it, then add/edit/remove its image and callouts from the left panel**, with an image fit (crop) control. It builds on Plan 6's rendering and keeps Plan 6's `overflow: hidden` clip baseline (the `fitGrid` auto-shrink engine is **Plan 8**).

## Scope — author-first slice

- **In:** cell selection (click a cell); per-cell **image** assign/replace/remove via the existing `ImagePicker`; image **fit** control (Contain / Crop-width / Crop-height) with an inline crop prompt on misfit; per-cell **callout** add/edit (type/title/body)/remove/reorder; the left-panel `CellEditor`; an editor-only cell-select overlay.
- **Out (→ Plan 8):** the `fitGrid` per-cell auto-shrink engine + its ADR-006 amendment (overflow keeps Plan 6's clip baseline here). **Out (→ Plan 9):** on-canvas drag + absolute positioning of callouts. **Out (→ Plan 10):** rich-text (`kind:"text"`) block objects. **Out (later):** file-drop-onto-cell image upload; cross-cell object move.
- Callouts stay **flow-stacked** in the cell (Plan 6 render); this plan adds no positioning model.

## Interaction Model

Click a cell in the preview → it highlights and the left panel shows that cell's `CellEditor`. Authoring is **panel-based** (the "A" model): the picker + buttons live in the panel, mirroring legacy per-row authoring but per-cell. No dragging (Plan 9). Images are **assigned** (they fill the cell); callouts are **added** (they flow-stack).

## Cell Selection (`lib/store.tsx`)

- Add `cellIndex: number | null` to `Selection` (alongside the existing `rowIndex`, which doubles as the grid row in grid mode).
- New action `selectCell(ci, si, ri, cellIndex)` → sets `selection = { chapterIndex: ci, stepIndex: si, rowIndex: ri, cellIndex, slotIndex: null }`, clears `selectedAnnotation`.
- `selectChapter`/`selectStep`/`selectRow` set `cellIndex: null`; initial state `cellIndex: null`.

## Editor-only Cell-Select Overlay (`components/editor/PreviewGridSelect.tsx`)

New editor-only overlay, modelled on `PreviewGridResize` (same unscaled box-measurement technique). For a grid-mode step it:
- measures each `.grid-cell` box relative to the scaler (the `(rect - base) / scale` pattern);
- renders a transparent `pointer-events: all` click target per cell that calls `selectCell(ci, si, ri, cellIndex)`;
- draws a highlight (outline) on the currently-selected cell.

Mounted in `PreviewPane` for grid-mode steps **below** `PreviewGridResize` in stacking order, so resize dividers / +/× buttons (top layer, `PreviewGridResize` is `pointer-events: none` except those) win over a cell-interior click, while a click on cell interior passes through to the select target. Renderer/print untouched.

## Cell Mutations (`lib/book-mutations.ts`, immutable via `clone`)

Accessor: `gridCellAt(step, ri, cellIndex): GridCell | null`. The primary image is `cell.objects.find(o => o.kind === "image" && o.role === "primary")`.

- `setCellImage(book, ci, si, ri, cellIndex, filename)` — if a primary image object exists, set its `ref`; else **unshift** a new one `{ id: annotationId(), role:"primary", kind:"image", x:0,y:0,w:1,h:1, ref: filename }` (image first → renders as cell base under flow-stacked callouts).
- `removeCellImage(book, ci, si, ri, cellIndex)` — drop the primary image object.
- `setCellImageFit(book, ci, si, ri, cellIndex, fit: ImageFit)` — set the primary image object's `fit`.
- `addCellCallout(book, ci, si, ri, cellIndex)` — push `{ id: annotationId(), role:"secondary", kind:"callout", x:0,y:0,w:1,h:1, callout: blankCallout() }` (`blankCallout()` already exists).
- `updateCellCallout(book, ci, si, ri, cellIndex, objIndex, patch: Partial<Callout>)` — patch `objects[objIndex].callout`.
- `removeCellObject(book, ci, si, ri, cellIndex, objIndex)` — splice the object.
- `moveCellObject(book, ci, si, ri, cellIndex, objIndex, dir: -1 | 1)` — reorder within `cell.objects` (changes flow-stack order).

All guard missing chapter/step/grid/row/cell/object and return the input book unchanged on a bad index; never mutate the input. Store actions wrap each, plus `selectCell`.

## Cell Editor (`components/editor/CellEditor.tsx`, left panel)

Rendered for the selected cell (`{ ci, si, ri, cellIndex, cell }`); reads `chapterId` from `book.chapters[ci].id`.

- **Image:**
  - `ImagePicker` (`chapterId`, `value = primaryImage?.ref`, `onChange = setCellImage(...)`, `label="Image"`) — reused as-is (handles upload).
  - When an image is set: a **Fit** segmented control — Contain (default) / Crop width / Crop height → `setCellImageFit`; and a **Remove image** button.
- **Crop-confirm (inline):** after an image is assigned, compute the cell aspect (`cell.widthFr * bodyRegion(cfg).w` / `row.heightFr * bodyRegion(cfg).h`) and the image's natural aspect (load via `new Image()`); if they differ beyond ~10% **and** `fit` is still `contain`, show a one-line prompt — *"This image doesn't fill the cell"* — with the three Fit choices (sets `fit`). Non-blocking, dismissed once a choice is made or the aspects match.
- **Callouts:** a list of the cell's callout objects, each with a type `<select>`, a title `<input>`, a body `RichTextArea`, ↑/↓ reorder, and × remove (reusing the legacy callout-type pattern + `RichTextArea`, but operating on cell objects — *not* the legacy `CalloutEditor`, which is row/side/below-bound). A **+ Add callout** button (`addCellCallout`).
- An empty cell shows the picker + "+ Add callout" directly.

`StepEditor` (grid branch) keeps `GridStructure` (rows/columns) and renders `CellEditor` below it when a cell is selected; otherwise a hint: *"Select a cell on the page to add an image or callouts."*

## Guarantees

- **Editor-only / print-clean:** `PreviewGridSelect`, the highlight, and `CellEditor` live in `components/editor/**`; `components/renderer/**` and `/print` are untouched. Plan 6's `.grid-cell { overflow: hidden }` clip baseline is retained (overflow clips until `fitGrid`, Plan 8).
- **Immutability:** every mutation returns a new `Book` via `clone`; inputs never mutated.
- **No regression to legacy:** legacy steps still render/author through the existing `RowCard` path; `selectCell`/`CellEditor`/the overlay are inert outside grid mode.

## Testing

- **Unit (vitest, `lib/**`):** the seven cell mutations — `setCellImage` (creates vs updates the primary; image-first ordering), `removeCellImage`, `setCellImageFit`, `addCellCallout`, `updateCellCallout`, `removeCellObject`, `moveCellObject` — asserting object shapes, ordering, null-index guards, and input immutability; `selectCell` store action sets `cellIndex` and clears annotation (`store.test.ts`).
- **Manual / build:** click a cell → it highlights + `CellEditor` appears; assign an image → it fills the cell; add a callout → it appears in the cell; Fit control crops; resize dividers still work over the select overlay; `/print` clean. (`CellEditor`/`PreviewGridSelect` are client components — build- + manual-verified, per the codebase's renderer/editor pattern; the mutations carry the automated coverage.)
- Suite grows ~60 → ~70.

## Deferred (explicitly not in Plan 7)

- `fitGrid` per-cell auto-shrink engine + ADR-006 amendment (Plan 8) — overflow clips here.
- On-canvas drag + absolute (`x/y`) callout positioning (Plan 9).
- Rich-text `kind:"text"` block objects + markdown extension (Plan 10).
- File-drop-onto-cell image upload; cross-cell object move; a blocking crop modal (the inline prompt covers it).
