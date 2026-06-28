# Grid-view Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three grid-view polish features — per-text-block alignment, per-image border/shadow that hugs the screenshot, and a transient hide-grid toggle for a clean preview.

**Architecture:** Two additive optional `StackedObject` fields (`align?`, `border?`) authored through the existing cell-mutation + CellEditor machinery and rendered in `GridStep`; one transient Zustand UI flag (`hideGridChrome`) that conditionally unmounts the grid editor overlays. No schema migration; callouts and the legacy render path are untouched.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind v4 / Zustand (vanilla) / Vitest.

## Global Constraints

- **Base:** branch `feature/improvement-rev3`, base commit `c5ce00b`. Do NOT merge to `main`.
- **Immutability:** every `Book` edit returns a NEW book via the `clone` (structuredClone) helper in `lib/book-mutations.ts`. A no-op (bad index / wrong kind / no image) returns the SAME `book` reference.
- **Additive schema, no migration:** `align?` and `border?` are optional; absence is valid. Do NOT touch `CURRENT_SCHEMA_VERSION` or any migrate code.
- **Callouts and the legacy (non-grid) render path stay byte-for-byte unchanged.** `ImageSlot`'s behaviour outside `.grid-cell` is untouched.
- **Editor-only vs render:** the `align` class and the image `border` are data-driven render that PRINTS. The hide-grid toggle, grid guides, and overlays are editor-only — never appear in `components/renderer/**` or the print path.
- **Hide-grid is transient UI state** (`hideGridChrome`) — never written to the `Book`.
- **Commits:** Conventional Commits. NO AI attribution, NO `Co-Authored-By` trailer.
- **Green gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test --run` pass before a task is done; UI tasks also `pnpm build`.

---

### Task 1: Schema fields + mutations + store + ADR

**Files:**
- Modify: `lib/book-schema.ts` (add `align?` + `border?` to `StackedObject`, ~line 224)
- Modify: `lib/book-mutations.ts` (add `setCellTextAlign`, `setCellImageBorder`; import `Border`)
- Modify: `lib/store.tsx` (two action types ~line 134 + impls ~line 413; import `Border`)
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` (append Plan 11 amendment)
- Test: `lib/book-mutations.test.ts` (extend the cell-mutation describe block; uses existing `gridBookCell` / `cellObjs` helpers)

**Interfaces:**
- Consumes: existing `clone`, `cellOf` helpers; `StackedObject`, `Border`, `BorderStyle` types; test helpers `gridBookCell(objects)` and `cellObjs(b)`.
- Produces:
  - `StackedObject.align?: "left" | "center" | "right"` (text blocks; absent = left).
  - `StackedObject.border?: Border` (image objects; absent = ImageSlot default frame).
  - `setCellTextAlign(book, ci, si, ri, cellIndex, objIndex, align): Book` — sets `obj.align`; kind-guarded to `"text"`; bad index / non-text → same `book` ref.
  - `setCellImageBorder(book, ci, si, ri, cellIndex, border): Book` — sets the primary image object's `border`; no image → same `book` ref.
  - Store actions `setCellTextAlign(ci, si, ri, cellIndex, objIndex, align)` and `setCellImageBorder(ci, si, ri, cellIndex, border)`.

- [ ] **Step 1: Write the failing tests**

In `lib/book-mutations.test.ts`, add `setCellTextAlign, setCellImageBorder` to the import on line 2, and `setCellImage` is already imported. Add these tests inside the existing cell-mutation `describe` block (near the `addCellText` tests):

```ts
  it("setCellTextAlign sets the alignment on a text block", () => {
    const start = addCellText(gridBookCell([]), 0, 0, 0, 0);
    const out = setCellTextAlign(start, 0, 0, 0, 0, 0, "center");
    expect(cellObjs(out)[0].align).toBe("center");
  });
  it("setCellTextAlign no-ops on a non-text object (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(setCellTextAlign(start, 0, 0, 0, 0, 0, "right")).toBe(start);
  });
  it("setCellImageBorder sets the primary image's border", () => {
    const start = setCellImage(gridBookCell([]), 0, 0, 0, 0, "a.jpg");
    const out = setCellImageBorder(start, 0, 0, 0, 0, { color: "#ff0000", shadow: false });
    const img = cellObjs(out).find((o) => o.kind === "image" && o.role === "primary");
    expect(img?.border).toEqual({ color: "#ff0000", shadow: false });
  });
  it("setCellImageBorder no-ops when the cell has no image (same reference)", () => {
    const start = gridBookCell([]);
    expect(setCellImageBorder(start, 0, 0, 0, 0, false)).toBe(start);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — `setCellTextAlign` / `setCellImageBorder` are not exported (import error).

- [ ] **Step 3: Add the schema fields**

In `lib/book-schema.ts`, inside `StackedObject`, add after the `text?` field (added in Plan 10, ~line 226):

```ts
  /** Text block content (markdown subset) when kind === "text". */
  text?: string;
  /** Text block alignment when kind === "text"; absent = left. Applies to the
   *  whole block (paragraphs + lists). */
  align?: "left" | "center" | "right";
  /** Per-image frame when kind === "image" (reuses the Border model); absent =
   *  ImageSlot's default frame. */
  border?: Border;
  /** Cell-anchored annotations (0–1 of the cell). */
  annotations?: Annotation[];
```

(`Border` is already declared earlier in this file — no import needed here.)

- [ ] **Step 4: Add the mutations**

In `lib/book-mutations.ts`, add `Border` to the type import from `./book-schema`. Then add after `updateCellText` (~line 615):

```ts
/** Set a text block's alignment. Kind-guarded to "text"; bad index / non-text → same book ref. */
export function setCellTextAlign(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, align: "left" | "center" | "right"): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "text") return book;
  obj.align = align;
  return next;
}

/** Set the cell's primary image border. No image in the cell → same book ref. */
export function setCellImageBorder(book: Book, ci: number, si: number, ri: number, cellIndex: number, border: Border): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx < 0) return book;
  cell.objects[idx] = { ...cell.objects[idx], border };
  return next;
}
```

- [ ] **Step 5: Run the mutation tests to verify they pass**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the store actions**

In `lib/store.tsx`, add `Border` to the type import from `./book-schema`. Add the action types after `updateCellObjectPlacement` (~line 134):

```ts
  updateCellObjectPlacement: (ci: number, si: number, ri: number, cellIndex: number, objectId: string, patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>) => void;
  setCellTextAlign: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, align: "left" | "center" | "right") => void;
  setCellImageBorder: (ci: number, si: number, ri: number, cellIndex: number, border: Border) => void;
```

And the implementations after the `updateCellObjectPlacement` impl (find it near the other cell-object actions, ~line 414):

```ts
    setCellTextAlign: (ci, si, ri, cellIndex, objIndex, align) =>
      set((s) => ({ book: M.setCellTextAlign(s.book, ci, si, ri, cellIndex, objIndex, align) })),
    setCellImageBorder: (ci, si, ri, cellIndex, border) =>
      set((s) => ({ book: M.setCellImageBorder(s.book, ci, si, ri, cellIndex, border) })),
```

- [ ] **Step 7: Append the ADR-006 amendment**

Append to the end of `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`:

```markdown

## Amendment (Plan 11, 2026-06-28): text alignment + per-image border

`StackedObject` gains two optional fields:
- `align?: "left" | "center" | "right"` — text-block (`kind:"text"`) alignment; absent = left. Applies to the whole block: paragraphs via `text-align`, lists via a shrink-wrapped block (`width: fit-content` + auto margins) so a centred list centres as a unit and a right-aligned list aligns to its longest item. Renders (prints) via a `.grid-text.align-*` modifier class.
- `border?: Border` — per-image (`kind:"image"`) frame, reusing the existing `Border`/`BorderStyle` model (colour/width/radius/shadow). Absent = `ImageSlot`'s default frame, so existing grid images are unchanged. In `contain` mode the framed slot shrink-wraps the displayed image so border + shadow hug the screenshot, not the cell; crop modes fill the cell.

Both are additive/optional — no `schemaVersion` bump, no migration. Mutations `setCellTextAlign` / `setCellImageBorder` (immutable; kind/none-guarded; same-`book` ref on no-op).
```

- [ ] **Step 8: Typecheck + full test run**

Run: `pnpm typecheck && pnpm test --run`
Expected: no type errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/book-schema.ts lib/book-mutations.ts lib/store.tsx lib/book-mutations.test.ts docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md
git commit -m "feat: text-align + per-image border schema, mutations, store actions"
```

---

### Task 2: Text-block alignment — render + authoring

**Files:**
- Modify: `components/renderer/GridStep.tsx` (text branch: add align class)
- Modify: `components/renderer/renderer.css` (`.grid-text.align-*` rules, after the `.grid-text` block from Plan 10)
- Modify: `components/editor/CellEditor.tsx` (align buttons in the text block row)

**Interfaces:**
- Consumes: `StackedObject.align` (Task 1); store action `setCellTextAlign` (Task 1); existing `.seg` / `.seg-btn` editor classes (used by the Fit control).
- Produces: a text block renders with `align-center` / `align-right` modifier classes; CellEditor exposes L/C/R buttons per text block.

- [ ] **Step 1: Add the align class in GridStep**

In `components/renderer/GridStep.tsx`, replace the text branch:

```tsx
                    if (obj.kind === "text") {
                      return (
                        <RichText
                          key={obj.id}
                          as="div"
                          block
                          className="grid-text"
                          text={obj.text}
                        />
                      );
                    }
```

with the align-aware version:

```tsx
                    if (obj.kind === "text") {
                      const alignCls =
                        obj.align && obj.align !== "left" ? ` align-${obj.align}` : "";
                      return (
                        <RichText
                          key={obj.id}
                          as="div"
                          block
                          className={`grid-text${alignCls}`}
                          text={obj.text}
                        />
                      );
                    }
```

- [ ] **Step 2: Add the alignment CSS**

In `components/renderer/renderer.css`, add after the `.grid-text` block (the Plan 10 rules ending with `.grid-text del`):

```css
/* Text-block alignment (Plan 11). Paragraphs follow text-align; lists become a
   shrink-wrapped block so a centred list centres as a unit and a right-aligned
   list aligns to its longest item. */
.grid-text.align-center { text-align: center; }
.grid-text.align-right { text-align: right; }
.grid-text.align-center ul,
.grid-text.align-center ol {
  width: fit-content;
  margin: 1mm auto;
}
.grid-text.align-right ul,
.grid-text.align-right ol {
  width: fit-content;
  margin: 1mm 0 1mm auto;
}
```

- [ ] **Step 3: Add align buttons to the text block in CellEditor**

In `components/editor/CellEditor.tsx`, add the store selector alongside the other cell actions (after `updateCellText`, ~line 39):

```tsx
  const updateCellText = useEditor((s) => s.updateCellText);
  const setCellTextAlign = useEditor((s) => s.setCellTextAlign);
```

In the text block branch (the `else` of the blocks `.map`, added in Plan 10), add an align segment inside `callout-item-head`, between the `block-label` span and the `mini-btns` div:

```tsx
              <div className="callout-item-head">
                <span className="block-label">Text</span>
                <div className="seg align-seg">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      className={`seg-btn${(o.align ?? "left") === a ? " active" : ""}`}
                      onClick={() => setCellTextAlign(ci, si, ri, cellIndex, i, a)}
                      aria-label={`Align ${a}`}
                      title={`Align ${a}`}
                    >
                      {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
                    </button>
                  ))}
                </div>
                <div className="mini-btns">
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                  <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
                </div>
              </div>
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/renderer.css components/editor/CellEditor.tsx
git commit -m "feat: text-block alignment (center/right) in grid cells"
```

---

### Task 3: Image border + shadow that hugs the screenshot

**Files:**
- Modify: `components/renderer/GridStep.tsx` (pass `border` to `ImageSlot`)
- Modify: `components/renderer/renderer.css` (grid contain shrink-wrap + shadow gutter; keep crop fill)
- Modify: `components/editor/CellEditor.tsx` (Border controls in the image section)

**Interfaces:**
- Consumes: `StackedObject.border` (Task 1); store action `setCellImageBorder` (Task 1); `resolveBorder`, `Border`, `BorderStyle` from `@/lib/book-schema`; `ImageSlot`'s existing `border` prop; existing `.ctrl-row` / `.ctrl-label` editor classes.
- Produces: grid images render their `border` (frame hugs the image in contain mode); CellEditor exposes border on/off + colour + width + radius + shadow.

- [ ] **Step 1: Pass the image border in GridStep**

In `components/renderer/GridStep.tsx`, in the image branch, add `border={obj.border}` to the `ImageSlot`:

```tsx
                      return (
                        <ImageSlot
                          key={obj.id}
                          src={imageSrc(assetBase, chapter.id, obj.ref)}
                          label="Screen"
                          path={displayPath(chapter.id, obj.ref)}
                          fit={obj.fit}
                          border={obj.border}
                        />
                      );
```

(When `obj.border` is undefined, `ImageSlot`'s `border = true` default keeps the current framed look — back-compatible.)

- [ ] **Step 2: Grid contain shrink-wrap + crop fill CSS**

In `components/renderer/renderer.css`, REPLACE the existing grid image-slot rules (the block starting `.grid-cell .img-slot {` through the `.fit-height img` rule, ~lines 872–895) with:

```css
/* Contain (default, no fit class): the framed slot shrink-wraps its displayed
   image so border + shadow hug the screenshot, not the cell. The img is laid
   out statically (overriding the base absolute fill) and constrained to the
   cell minus a small gutter so .grid-cell{overflow:hidden} (fitGrid) doesn't
   clip the shadow. */
.grid-cell .img-slot {
  width: auto;
  height: auto;
  max-width: calc(100% - 12px);
  max-height: calc(100% - 12px);
  align-self: center;  /* centre the shrink-wrapped slot on the cross axis;
                          stays in vertical flow so a sibling callout/text below
                          is not pushed (no main-axis margin:auto) */
}
.grid-cell .img-slot img {
  position: static;
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
/* Crop modes fill the cell (frame hugs the cell, which is correct when cropping). */
.grid-cell .img-slot.fit-width,
.grid-cell .img-slot.fit-height {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
}
.grid-cell .img-slot.fit-width img {
  position: absolute;
  inset: 0 0 auto 0; /* top-anchored: crop overflow at the bottom */
  width: 100%;
  height: auto;
  object-fit: fill;
}
.grid-cell .img-slot.fit-height img {
  position: absolute;
  inset: 0 auto 0 0; /* left-anchored: crop overflow at the right */
  width: auto;
  height: 100%;
  object-fit: fill;
}
```

- [ ] **Step 3: Add the Border controls in CellEditor**

In `components/editor/CellEditor.tsx`, add to the `@/lib/book-schema` import: `resolveBorder` and the types `Border, BorderStyle`. Add the store selector with the other cell actions:

```tsx
  const setCellImageBorder = useEditor((s) => s.setCellImageBorder);
```

Then, in the image controls — inside the `imageRef ? (...)` block, AFTER the Fit `ctrl-row` + crop hint and BEFORE the "Remove image" button — insert the Border section:

```tsx
            {(() => {
              const rb = resolveBorder(image?.border);
              const colorHex = /^#[0-9a-fA-F]{6}$/.test(rb.color) ? rb.color : "#cfd6e4";
              const widthPx = parseInt(rb.width, 10) || 6;
              const radiusPx = parseInt(rb.radius, 10) || 20;
              const full: BorderStyle = { color: colorHex, width: `${widthPx}px`, radius: `${radiusPx}px`, shadow: rb.shadow };
              const patch = (p: Partial<BorderStyle>) => setCellImageBorder(ci, si, ri, cellIndex, { ...full, ...p });
              return (
                <div className="border-controls">
                  <label className="ctrl-row">
                    <span className="ctrl-label">Border</span>
                    <input
                      type="checkbox"
                      checked={rb.show}
                      onChange={(e) => setCellImageBorder(ci, si, ri, cellIndex, e.target.checked ? full : false)}
                    />
                  </label>
                  {rb.show ? (
                    <>
                      <label className="ctrl-row">
                        <span className="ctrl-label">Colour</span>
                        <input type="color" value={colorHex} onChange={(e) => patch({ color: e.target.value })} />
                      </label>
                      <label className="ctrl-row">
                        <span className="ctrl-label">Width</span>
                        <input type="number" min={0} max={24} value={widthPx} onChange={(e) => patch({ width: `${e.target.value}px` })} />
                      </label>
                      <label className="ctrl-row">
                        <span className="ctrl-label">Radius</span>
                        <input type="number" min={0} max={60} value={radiusPx} onChange={(e) => patch({ radius: `${e.target.value}px` })} />
                      </label>
                      <label className="ctrl-row">
                        <span className="ctrl-label">Shadow</span>
                        <input type="checkbox" checked={rb.shadow} onChange={(e) => patch({ shadow: e.target.checked })} />
                      </label>
                    </>
                  ) : null}
                </div>
              );
            })()}
```

(`image` is the existing `const image = cell.objects.find((o) => o.kind === "image" && o.role === "primary")` already in scope.)

- [ ] **Step 4: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Manual in-browser check (visual — no DOM test)**

Run `pnpm dev`, open a grid step with an image cell. Confirm: the border + drop shadow hug the screenshot (not the cell) in "Maintain ratio"; colour / width / radius / shadow controls take effect; the shadow is not clipped; crop modes still fill and crop; `/print` and Export PDF match. Note any issue for review.

- [ ] **Step 6: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/renderer.css components/editor/CellEditor.tsx
git commit -m "feat: per-image border and shadow in grid cells (frame hugs the image)"
```

---

### Task 4: Hide-grid toggle

**Files:**
- Modify: `lib/store.tsx` (add `hideGridChrome` state + `toggleGridChrome` action)
- Modify: `components/editor/PreviewPane.tsx` (toolbar toggle + conditional overlay mount + `gridMode` + scaler class)
- Modify: `components/editor/editor.css` (suppress grid guides under `.chrome-hidden`)

**Interfaces:**
- Consumes: existing `stepLayoutMode`; the overlay components `PreviewGridSelect` / `PreviewGridResize` / `PreviewCellFloat` / `PreviewAnnotations`.
- Produces: `hideGridChrome: boolean` + `toggleGridChrome()` in the store; a toolbar toggle that hides grid editor chrome while keeping content + interactive annotations.

- [ ] **Step 1: Add the store flag + toggle**

In `lib/store.tsx`, add to the `EditorState` interface (after `overflows: string[];`, ~line 56):

```ts
  /** data-screen-labels of pages that still overflow after the last fit pass. */
  overflows: string[];
  /** Transient: hide grid editor chrome (guides + handles) for a clean preview. */
  hideGridChrome: boolean;
```

Add the action type near the selection actions (after `selectCellObject`, ~line 63):

```ts
  toggleGridChrome: () => void;
```

In the initial state object (where `overflows: [],` is set, ~line 210), add:

```ts
    overflows: [],
    hideGridChrome: false,
```

And the action impl (near `setOverflows`, ~line 293):

```ts
    toggleGridChrome: () => set((s) => ({ hideGridChrome: !s.hideGridChrome })),
```

- [ ] **Step 2: Wire the toggle + conditional chrome in PreviewPane**

In `components/editor/PreviewPane.tsx`, read the new state near the other `useEditor` selectors (~line 38):

```tsx
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const hideGridChrome = useEditor((s) => s.hideGridChrome);
  const toggleGridChrome = useEditor((s) => s.toggleGridChrome);
```

Compute whether the selected step is a grid step (place it just before the `return (`):

```tsx
  const selStep =
    selection.stepIndex != null
      ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
      : null;
  const isGridStep = selStep ? stepLayoutMode(selStep) === "grid" : false;
```

Add the toggle button to the toolbar — after the `overflow-warn` span, before the `spacer`:

```tsx
        {isGridStep ? (
          <button onClick={toggleGridChrome}>
            {hideGridChrome ? "Show grid" : "Hide grid"}
          </button>
        ) : null}
        <span className="spacer" />
```

Add the `chrome-hidden` class on the scaler:

```tsx
          <div
            className={`preview-scaler${hideGridChrome ? " chrome-hidden" : ""}`}
            ref={scalerRef}
            style={{ transform: `scale(${scale})` }}
          >
```

- [ ] **Step 3: Gate the overlays + annotation gridMode on `!hideGridChrome`**

In `components/editor/PreviewPane.tsx`, in each of the three grid-overlay mount expressions (`PreviewGridSelect`, `PreviewGridResize`, `PreviewCellFloat`), add `&& !hideGridChrome` to the guard. For `PreviewGridSelect`:

```tsx
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 && !hideGridChrome ? (
                <PreviewGridSelect
```

Apply the identical `&& !hideGridChrome` addition to the `PreviewGridResize` and `PreviewCellFloat` guards.

For the `PreviewAnnotations` `gridMode` prop, AND in `!hideGridChrome` so the annotation layer becomes fully interactive (blank-click deselects) when chrome is hidden:

```tsx
                gridMode={(() => {
                  const s =
                    book.chapters[selection.chapterIndex]?.steps[selection.stepIndex];
                  return s ? stepLayoutMode(s) === "grid" && !hideGridChrome : false;
                })()}
```

- [ ] **Step 4: Suppress the grid guides under `.chrome-hidden`**

In `components/editor/editor.css`, add after the `.preview-scaler .grid-cell` guide rule (~line 1128):

```css
/* Hide-grid preview (Plan 11): suppress the editor-only cell guides. The
   add/resize/select/float overlays are unmounted by PreviewPane, so this only
   needs to clear the dashed outline + tint. */
.preview-scaler.chrome-hidden .grid-cell {
  outline: none;
  background: none;
}
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 6: Manual in-browser check (visual — no DOM test)**

Run `pnpm dev`, select a grid step. Confirm: "Hide grid" removes the dashed guides + all add/resize/select/float handles; content + annotation shapes stay; clicking an annotation still shows its handles and clicking blank hides them; "Show grid" restores everything. The toggle does not appear for legacy steps.

- [ ] **Step 7: Commit**

```bash
git add lib/store.tsx components/editor/PreviewPane.tsx components/editor/editor.css
git commit -m "feat: hide-grid toggle for a clean grid preview"
```

---

## Manual verification (after Task 4, before final review)

1. Text block: set left/center/right; paragraphs follow; a centered list centers as a block; a right list aligns to its longest item; `/print` + PDF match.
2. Image: border on/off + colour + width + radius + shadow; frame hugs the screenshot in Maintain ratio; crop modes fill + crop; shadow not clipped; PDF matches.
3. Hide grid: removes all editor chrome; annotations stay and remain focus-editable; restores on toggle; absent for legacy steps.
4. Regression: callouts and a legacy step look unchanged.
