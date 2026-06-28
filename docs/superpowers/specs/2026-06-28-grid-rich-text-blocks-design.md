# Plan 10 — Rich-text blocks in grid cells (design)

**Date:** 2026-06-28
**Branch:** `feature/improvement-rev3` (base `391439a`)
**Status:** Approved — proceeding to implementation plan.

## Goal

Let an author add a **rich-text block** to a grid cell — a paragraph/heading
content object authored in the left-panel `CellEditor` (alongside callouts),
rendered in `GridStep` (preview + print), and fit-aware under the Plan 8
`fitGrid` backstop. This completes the cell content set: image, callout, text.

## Scope decisions (locked during brainstorming)

- **Formatting:** headings (`## `→h2, `### `→h3) + strikethrough (`~~`) added to
  the existing bold / italic / bullet / numbered marks. **Underline dropped**
  (typographically discouraged in print, no standard markdown syntax).
- **Toolbar:** the new Heading / Subheading / Strike buttons appear **only in the
  text-block editor**. Callout-body editors keep their current 4 buttons. The
  markdown parser renders the new marks anywhere; this only governs which
  buttons show.
- **Callouts unchanged:** a text block is a distinct object (rich text only — no
  type, no icon). Callouts keep their title + type icon (info / note / success /
  warning / danger) exactly as today.
- **Flow-stacked only:** text blocks live in the cell's flow stack (stack with
  image + callouts, reorder up/down). No drag-to-float. The Plan 9 float system
  stays callout-guarded. Formatting (lists, indentation, headings) must read
  correctly within the flow layout.

## Out of scope

Underline; floating / `positioned` text blocks; any change to callout behaviour
or the legacy (non-grid) render path.

## Architecture

Rides entirely on existing patterns — no new renderer subsystem, no schema
migration.

### 1. Data model (`lib/book-schema.ts` + ADR-006)

`StackedObject.kind` already includes `"text"`. Add one optional field:

```ts
/** Text block content (markdown subset) when kind === "text". */
text?: string;
```

Purely additive. Existing books carry no text objects, so **no `schemaVersion`
bump and no migration step** — absence of `text` is valid, nothing to transform.
Amend ADR-006 to document the `text` object: flow-only, fit-aware, distinct from
callouts.

### 2. Markdown extensions (`lib/markdown.ts`)

Keep the safe-by-construction property: input is HTML-escaped first, then only a
fixed tag set is emitted (now adding `<h2>`, `<h3>`, `<del>`). No raw HTML passes
through, so there is no XSS surface.

- **Headings** (block-level, in `classify`): `## ` → `<h2>`, `### ` → `<h3>`.
  Flush any open paragraph/list, then emit the heading; inline marks still run on
  the heading text. A single `# ` is intentionally NOT a heading (avoids clashing
  with the page-level H1).
- **Strike** (inline, in `inline()`): `~~text~~` → `<del>text</del>`.
- Bold / italic / bullet / numbered already exist — unchanged.

`RichText` (block mode) needs no change; it calls `renderMarkdownBlocks`.

### 3. Rendering (`components/renderer/GridStep.tsx`, `renderer.css`, `lib/use-auto-fit.ts`)

- **GridStep:** replace `return null; // text objects: Plan 10` in the flow map
  with `<RichText block as="div" className="grid-text" text={obj.text} />`. It
  renders inside `.grid-cell-content`, so it prints and participates in the flow
  stack order.
- **CSS:** add `.grid-text` styles — paragraph spacing, list indentation, h2/h3
  sizes scaled to the guidebook, `del` line-through — so formatting reads
  correctly within the flow and under fit scaling.
- **fitGrid:** extend the callout-cell selector
  (`:scope > .grid-cell-content .callout`) to also match `.grid-text`, so
  text-bearing cells shrink-to-fit under the same grid-uniform factor (floor
  `MIN_GRID_SCALE = 0.5`). Image-only cells remain exempt.

### 4. Authoring (`CellEditor.tsx`, `RichTextArea.tsx`, `book-mutations.ts`, `store.tsx`)

- **Mutations:** `addCellText(book, ci, si, ri, cellIndex)` pushes
  `{ id, role:"secondary", kind:"text", x:0, y:0, w:1, h:1, text:"" }`;
  `updateCellText(book, ci, si, ri, cellIndex, objIndex, text)` sets `obj.text`
  (kind-guarded — no-op on non-text or bad index, returns same book ref).
  Reuse existing kind-agnostic `removeCellObject` / `moveCellObject`.
- **Store:** thin action wrappers `addCellText` / `updateCellText`.
- **CellEditor:** convert the callout-only list into one **ordered content-blocks
  list** (callouts + text, in `cell.objects` array order, primary image excluded
  — it keeps its dedicated section at top). Render each block by kind: callout →
  the existing callout item (unchanged); text → a `RichTextArea` with the
  extended toolbar + move-up/down + remove. Two add buttons: "+ Add callout" /
  "+ Add text". Up/down uses `moveCellObject` on the absolute array index, as the
  callout list already does — so reordering works across types.
- **RichTextArea:** add opt-in props (e.g. `showHeadings`, `showStrike`,
  default `false`) gating the Heading (`## `), Subheading (`### `), and Strike
  (`~~`) buttons. Off by default → callout bodies render the same 4 buttons.
  Text blocks pass them on. Heading buttons use the existing `prefixLines`
  helper; strike uses the existing `wrap` helper.

### 5. Testing

- `lib/markdown.test.ts`: `## ` → h2, `### ` → h3, `~~x~~` → del, bold inside a
  heading, escaping safety (`<script>` still neutralized inside a heading/strike).
- `lib/book-mutations.test.ts`: `addCellText` produces the expected object shape;
  `updateCellText` sets text and no-ops on a non-text object.
- `lib/grid-render.test.ts`: a text object is included by `flowObjects` and
  excluded by `floatingCallouts`.

Component / CSS / print behaviour stays build- and manually-verified (no DOM test
harness — intentional, per project convention).

## Files touched

- Modify: `lib/book-schema.ts` (add `text?` field + doc comment)
- Modify: `lib/markdown.ts` (headings + strike)
- Modify: `lib/book-mutations.ts` (`addCellText`, `updateCellText`)
- Modify: `lib/store.tsx` (action wrappers)
- Modify: `components/renderer/GridStep.tsx` (render text block)
- Modify: `components/renderer/renderer.css` (`.grid-text`)
- Modify: `lib/use-auto-fit.ts` (fitGrid selector includes `.grid-text`)
- Modify: `components/editor/RichTextArea.tsx` (opt-in toolbar buttons)
- Modify: `components/editor/CellEditor.tsx` (unified blocks list + add-text)
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`
- Tests: `lib/markdown.test.ts`, `lib/book-mutations.test.ts`, `lib/grid-render.test.ts`

## Success criteria

- Author can add, edit (bold/italic/lists/heading/subheading/strike), reorder,
  and remove a text block in a grid cell.
- The text block renders identically in preview and `/print` / PDF, with lists
  indented and headings sized within the cell.
- An overflowing text cell shrinks under `fitGrid` (shared grid-uniform factor),
  same as a callout cell.
- Callout authoring and rendering, and the legacy render path, are byte-for-byte
  unchanged.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all green; new marks covered by unit
  tests.
