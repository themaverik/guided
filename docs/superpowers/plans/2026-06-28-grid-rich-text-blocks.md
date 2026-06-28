# Rich-text Blocks in Grid Cells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author add a rich-text block (paragraph + headings/strike/bold/italic/lists) to a grid cell — authored in `CellEditor` like a callout, rendered in `GridStep` (preview + print), fit-aware under `fitGrid`.

**Architecture:** Rides entirely on existing patterns. `StackedObject.kind` already includes `"text"`; add one optional `text?: string` field to carry content. Extend the markdown subset with headings + strike. Render text blocks in the cell flow layer via the existing `RichText` (block mode). Author them through the same cell-mutation + `RichTextArea` machinery callouts use. No new renderer subsystem, no schema migration.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind v4 / Zustand (vanilla) / Vitest. Pure markdown→HTML is dependency-free (`lib/markdown.ts`).

## Global Constraints

- **Base:** branch `feature/improvement-rev3`, base commit `391439a`. Do NOT merge to `main` (deferred until after Plan 10).
- **Immutability:** every `Book` edit returns a NEW book via the `clone` (structuredClone) helper in `lib/book-mutations.ts`. Never mutate book state in place. A no-op mutation returns the SAME `book` reference.
- **Markdown safety:** `lib/markdown.ts` is safe-by-construction — HTML-escape input first, then emit ONLY a fixed tag set. New marks may add `<h2>`, `<h3>`, `<del>` to that set; never pass raw input HTML through.
- **Grid affordances are editor-only** EXCEPT data-driven render (`fitGrid`, and the text block itself, which is document data and prints). Never add editor-only chrome to `components/renderer/**` or the `/print` path.
- **Callouts and the legacy (non-grid) render path are unchanged** — byte-for-byte. A text block is a distinct object (rich text only; no type, no icon).
- **No floating text:** text blocks are flow-stacked only. The Plan 9 float system (`positioned`, `PreviewCellFloat`, `updateCellObjectPlacement`) stays callout-guarded.
- **No `schemaVersion` bump / no migration:** `text?` is additive and optional; absence is valid.
- **Commits:** Conventional Commits. NO AI attribution, NO `Co-Authored-By` trailer.
- **Green gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test --run` all pass before a task is done.

---

### Task 1: Markdown headings + strikethrough

**Files:**
- Modify: `lib/markdown.ts` (the `LineKind` type, `inline()`, `classify()`, `renderMarkdownBlocks()` loop, header comment)
- Test: `lib/markdown.test.ts` (CREATE — no test exists yet)

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderMarkdownBlocks(src: string): string` and `renderMarkdownInline(src: string): string` (signatures UNCHANGED) now also support: `## ` at line start → `<h2>`, `### ` at line start → `<h3>`, and inline `~~text~~` → `<del>text</del>`. A single `# ` is intentionally NOT a heading. Inline marks still run inside heading text. All input stays HTML-escaped.

- [ ] **Step 1: Write the failing tests**

Create `lib/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdownBlocks, renderMarkdownInline } from "@/lib/markdown";

describe("renderMarkdownBlocks — headings", () => {
  it("renders ## as <h2>", () => {
    expect(renderMarkdownBlocks("## Title")).toBe("<h2>Title</h2>");
  });
  it("renders ### as <h3>", () => {
    expect(renderMarkdownBlocks("### Sub")).toBe("<h3>Sub</h3>");
  });
  it("runs inline marks inside a heading", () => {
    expect(renderMarkdownBlocks("## **Bold** head")).toBe(
      "<h2><strong>Bold</strong> head</h2>",
    );
  });
  it("does not treat a single # as a heading", () => {
    expect(renderMarkdownBlocks("# Title")).toBe("<p># Title</p>");
  });
  it("escapes HTML inside a heading", () => {
    expect(renderMarkdownBlocks("## <script>x</script>")).toBe(
      "<h2>&lt;script&gt;x&lt;/script&gt;</h2>",
    );
  });
  it("separates a heading from a following paragraph", () => {
    expect(renderMarkdownBlocks("## H\nbody")).toBe("<h2>H</h2><p>body</p>");
  });
});

describe("strikethrough", () => {
  it("renders ~~x~~ as <del> inline", () => {
    expect(renderMarkdownInline("a ~~b~~ c")).toBe("a <del>b</del> c");
  });
  it("renders ~~x~~ in block mode", () => {
    expect(renderMarkdownBlocks("~~gone~~")).toBe("<p><del>gone</del></p>");
  });
  it("escapes HTML inside strike", () => {
    expect(renderMarkdownInline("~~<b>~~")).toBe("<del>&lt;b&gt;</del>");
  });
});

describe("existing marks still work", () => {
  it("renders bold + a bullet list", () => {
    expect(renderMarkdownBlocks("**hi**\n- a\n- b")).toBe(
      "<p><strong>hi</strong></p><ul><li>a</li><li>b</li></ul>",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run lib/markdown.test.ts`
Expected: FAIL — the heading and strike tests fail (e.g. `## Title` currently renders `<p>## Title</p>`).

- [ ] **Step 3: Add strike to `inline()`**

In `lib/markdown.ts`, add the strike replacement to `inline()` (after the bold rules, before the italic rules — the `~` marker does not collide with `*`/`_`):

```ts
/** Inline marks on already-escaped text. Bold before italic to avoid overlap. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
}
```

- [ ] **Step 4: Add headings to the `LineKind` type and `classify()`**

Extend `LineKind` and add heading detection to `classify()` (check `###` before `##`; both require a space after the hashes):

```ts
type LineKind = "h2" | "h3" | "ul" | "ol" | "p" | "blank";

function classify(line: string): { kind: LineKind; text: string } {
  if (/^\s*$/.test(line)) return { kind: "blank", text: "" };
  const h3 = line.match(/^###\s+(.*)$/);
  if (h3) return { kind: "h3", text: h3[1] };
  const h2 = line.match(/^##\s+(.*)$/);
  if (h2) return { kind: "h2", text: h2[1] };
  const ul = line.match(/^\s*[-*]\s+(.*)$/);
  if (ul) return { kind: "ul", text: ul[1] };
  const ol = line.match(/^\s*\d+\.\s+(.*)$/);
  if (ol) return { kind: "ol", text: ol[1] };
  return { kind: "p", text: line };
}
```

- [ ] **Step 5: Emit headings in `renderMarkdownBlocks()`**

In the `for (const line of lines)` loop of `renderMarkdownBlocks()`, add a heading branch right after the `blank` branch (a heading is its own block — flush any open paragraph and list first):

```ts
  for (const line of lines) {
    const { kind, text } = classify(line);
    if (kind === "blank") {
      flushPara();
      flushList();
      continue;
    }
    if (kind === "h2" || kind === "h3") {
      flushPara();
      flushList();
      out.push(`<${kind}>${inline(escapeHtml(text))}</${kind}>`);
      continue;
    }
    if (kind === "ul" || kind === "ol") {
      flushPara();
      if (listTag !== kind) {
        flushList();
        listTag = kind;
        out.push(`<${kind}>`);
      }
      out.push(`<li>${inline(escapeHtml(text))}</li>`);
    } else {
      flushList();
      para.push(text);
    }
  }
```

- [ ] **Step 6: Update the file header comment**

Update the top-of-file doc comment so the supported set and emitted tags are accurate. Replace the "Supported" block and add the new tags to the emitted-set sentence:

```ts
/*
 * Tiny, dependency-free markdown subset → HTML. SAFE BY CONSTRUCTION: the input
 * is HTML-escaped first, then only a fixed set of tags is emitted
 * (<strong>, <em>, <del>, <h2>, <h3>, <p>, <ul>/<ol>/<li>). No raw HTML from the
 * input is ever passed through, so there is no XSS surface and no sanitizer is
 * needed.
 *
 * Supported:
 *   **bold** / __bold__        → <strong>
 *   *italic* / _italic_        → <em>
 *   ~~strike~~                 → <del>
 *   ## heading                 → <h2>
 *   ### subheading             → <h3>
 *   - item / * item            → <ul><li>
 *   1. item                    → <ol><li>
 *   blank line                 → paragraph break
 */
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test --run lib/markdown.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/markdown.ts lib/markdown.test.ts
git commit -m "feat: markdown headings (h2/h3) and strikethrough"
```

---

### Task 2: `text` field, cell mutations, store actions, ADR

**Files:**
- Modify: `lib/book-schema.ts:206-227` (add `text?` to `StackedObject`)
- Modify: `lib/book-mutations.ts` (add `addCellText`, `updateCellText` near the other cell mutations, ~line 595)
- Modify: `lib/store.tsx` (add the two action types ~line 131 and impls ~line 413)
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` (append a Plan 10 amendment)
- Test: `lib/book-mutations.test.ts` (extend the existing cell-mutation describe block, ~line 205)

**Interfaces:**
- Consumes: existing `clone`, `cellOf`, `annotationId` helpers in `lib/book-mutations.ts`; existing `StackedObject` type; the test helpers `gridBookCell(objects: StackedObject[]): Book` and `cellObjs(b: Book)` already defined in `lib/book-mutations.test.ts`.
- Produces:
  - `StackedObject.text?: string` — text-block content (markdown subset), present when `kind === "text"`.
  - `addCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book` — pushes `{ id, role:"secondary", kind:"text", x:0, y:0, w:1, h:1, text:"" }`. Bad cell index → same `book` ref.
  - `updateCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, text: string): Book` — sets `obj.text`; kind-guarded (non-text or bad index → same `book` ref).
  - Store actions `addCellText(ci, si, ri, cellIndex)` and `updateCellText(ci, si, ri, cellIndex, objIndex, text)`.

- [ ] **Step 1: Write the failing tests**

In `lib/book-mutations.test.ts`, add `addCellText` and `updateCellText` to the existing import on line 2:

```ts
import { resizeGridRow, resizeGridColumn, addGridRow, removeGridRow, addGridColumn, removeGridColumn, setStepLayoutMode, setCellImage, removeCellImage, setCellImageFit, addCellCallout, updateCellCallout, removeCellObject, moveCellObject, updateCellObjectPlacement, addCellText, updateCellText } from "@/lib/book-mutations";
```

Add these tests inside the existing cell-mutation `describe` block (the one that already uses `gridBookCell` and `cellObjs`, near the `addCellCallout` tests at ~line 205):

```ts
  it("addCellText appends a secondary text object with empty text", () => {
    const out = addCellText(gridBookCell([]), 0, 0, 0, 0);
    expect(cellObjs(out)[0]).toMatchObject({ role: "secondary", kind: "text", text: "" });
  });
  it("updateCellText sets the text content", () => {
    const start = addCellText(gridBookCell([]), 0, 0, 0, 0);
    const out = updateCellText(start, 0, 0, 0, 0, 0, "## Hello");
    expect(cellObjs(out)[0].text).toBe("## Hello");
  });
  it("updateCellText no-ops on a non-text object (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(updateCellText(start, 0, 0, 0, 0, 0, "x")).toBe(start);
  });
  it("addCellText no-ops on a bad cell index (same reference)", () => {
    const start = gridBookCell([]);
    expect(addCellText(start, 0, 0, 9, 0)).toBe(start);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — `addCellText` / `updateCellText` are not exported (TS/import error).

- [ ] **Step 3: Add the `text` field to the schema**

In `lib/book-schema.ts`, inside the `StackedObject` interface, add the `text` field after `positioned?` (around line 224):

```ts
  /** Callout only: true = floats at absolute x/y/w within the cell (out of the
   *  flow stack). Absent/false = flowed (x/y/w ignored). Height is content-driven. */
  positioned?: boolean;
  /** Text block content (markdown subset) when kind === "text". */
  text?: string;
  /** Cell-anchored annotations (0–1 of the cell). */
  annotations?: Annotation[];
```

- [ ] **Step 4: Add the mutations**

In `lib/book-mutations.ts`, add after `updateCellObjectPlacement` (after line 595):

```ts
/** Append an empty text block to a cell's object stack (flow-stacked). */
export function addCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects.push({ id: annotationId(), role: "secondary", kind: "text", x: 0, y: 0, w: 1, h: 1, text: "" });
  return next;
}

/** Set a text block's content. Kind-guarded; bad index or non-text returns the same book ref. */
export function updateCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, text: string): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "text") return book;
  obj.text = text;
  return next;
}
```

- [ ] **Step 5: Run the mutation tests to verify they pass**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the store actions**

In `lib/store.tsx`, add the two action types after `moveCellObject` (line 131):

```ts
  moveCellObject: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, dir: -1 | 1) => void;
  addCellText: (ci: number, si: number, ri: number, cellIndex: number) => void;
  updateCellText: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, text: string) => void;
```

And the implementations after the `moveCellObject` impl (line 413):

```ts
    moveCellObject: (ci, si, ri, cellIndex, objIndex, dir) =>
      set((s) => ({ book: M.moveCellObject(s.book, ci, si, ri, cellIndex, objIndex, dir) })),
    addCellText: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.addCellText(s.book, ci, si, ri, cellIndex) })),
    updateCellText: (ci, si, ri, cellIndex, objIndex, text) =>
      set((s) => ({ book: M.updateCellText(s.book, ci, si, ri, cellIndex, objIndex, text) })),
```

- [ ] **Step 7: Append the ADR-006 amendment**

Append to the end of `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`:

```markdown

## Amendment (Plan 10, 2026-06-28): rich-text blocks in cells

`StackedObject` gains `text?: string`, used when `kind === "text"` (the kind was
already reserved in the union). A text block is a flow-stacked content object —
rich text only (markdown subset: bold/italic/lists + new `## `/`### ` headings and
`~~strike~~`), distinct from a callout (no type, no icon). It is NOT floatable: the
Plan 9 `positioned` path stays callout-guarded.

`GridStep` renders a text block in the flow layer (`.grid-cell-content`) via
`<RichText block>`, so it prints and participates in stack order. It is fit-aware:
`fitGrid`'s overflow filter widens from `.grid-cell-content .callout` to also match
`.grid-cell-content .grid-text`, so a text-bearing cell shrinks under the same
grid-uniform factor (floor 0.5); image-only cells stay exempt.

The field is additive and optional — existing books carry no text objects, so there
is **no `schemaVersion` bump and no migration** (absence of `text` is valid).
```

- [ ] **Step 8: Typecheck and full test run**

Run: `pnpm typecheck && pnpm test --run`
Expected: no type errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/book-schema.ts lib/book-mutations.ts lib/store.tsx lib/book-mutations.test.ts docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md
git commit -m "feat: text block schema field, cell mutations, store actions"
```

---

### Task 3: Render text blocks in the grid (preview + print) + fit-aware

**Files:**
- Modify: `components/renderer/GridStep.tsx:33-53` (add a `kind === "text"` branch in the flow map; import `RichText`)
- Modify: `components/renderer/renderer.css` (add `.grid-text` styles after the `.grid-cell-float` block, ~line 871)
- Modify: `lib/use-auto-fit.ts:137-139` (widen the fitGrid overflow selector to include `.grid-text`)
- Test: `lib/grid-render.test.ts` (add a text-object flow test)

**Interfaces:**
- Consumes: `StackedObject.text` (Task 2); `renderMarkdownBlocks` headings/strike (Task 1); the existing `RichText` component (`components/renderer/RichText.tsx`, props `{ text?, block?, className?, as? }`); existing `flowObjects` / `floatingCallouts` from `lib/grid-render.ts`.
- Produces: a text `StackedObject` renders as `<div class="grid-text">…</div>` in the cell flow; `fitGrid` treats a `.grid-text` cell as overflow-eligible.

- [ ] **Step 1: Write the failing test**

In `lib/grid-render.test.ts`, add a text-object factory and a flow test (the file already imports `flowObjects`, `floatingCallouts`, `GridCell`, `StackedObject`). Add near the existing `flowObjects` / `floatingCallouts` tests:

```ts
const textObj = (id: string): StackedObject => ({ id, role: "secondary", kind: "text", x: 0, y: 0, w: 1, h: 1, text: "hi" });

describe("text objects in the flow", () => {
  it("includes a text object in flowObjects (never floats)", () => {
    const cell: GridCell = { widthFr: 1, objects: [textObj("t1")] };
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["t1"]);
    expect(floatingCallouts(cell)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes (and is meaningful)**

Run: `pnpm test --run lib/grid-render.test.ts`
Expected: PASS — `flowObjects` already returns every non-floating object, and a text object is never floating. (This test locks in that behavior; it is the regression guard for Task 3's render assumption. It passes immediately because `grid-render.ts` is kind-agnostic for flow — no code change needed there.)

- [ ] **Step 3: Render the text block in `GridStep`**

In `components/renderer/GridStep.tsx`, add the `RichText` import:

```ts
import { flowObjects, floatingCallouts } from "@/lib/grid-render";
import Callout from "./Callout";
import ImageSlot from "./ImageSlot";
import RichText from "./RichText";
```

Replace the final `return null; // text objects: Plan 10` (line 52) inside the flow `.map` with a text branch:

```tsx
                    if (obj.kind === "callout" && obj.callout) {
                      return <Callout key={obj.id} data={obj.callout} domId={obj.id} />;
                    }
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
                    return null;
```

- [ ] **Step 4: Add `.grid-text` styles**

In `components/renderer/renderer.css`, add after the `.grid-cell-float` rule (after line 871, before `.grid-cell .img-slot`):

```css
/* Rich-text block in a grid cell (Plan 10). Flow-stacked; reuses the body type
   scale. Lists keep indentation; headings + strike are sized for in-cell use. */
.grid-text {
  font-family: var(--font-body);
  font-size: 10.5pt;
  line-height: 1.6;
  color: var(--ink-text);
  text-wrap: pretty;
}
.grid-text h2 {
  font-family: var(--font-heading);
  font-size: 13pt;
  font-weight: 600;
  margin: 0 0 1.5mm;
  color: var(--ink);
}
.grid-text h3 {
  font-family: var(--font-heading);
  font-size: 11pt;
  font-weight: 600;
  margin: 0 0 1mm;
  color: var(--ink);
}
.grid-text p {
  margin: 0 0 1.5mm;
}
.grid-text p:last-child {
  margin-bottom: 0;
}
.grid-text ul,
.grid-text ol {
  margin: 1mm 0;
  padding-left: 5mm;
}
.grid-text ul {
  list-style: disc outside;
}
.grid-text ol {
  list-style: decimal outside;
}
.grid-text li {
  margin: 0.5mm 0;
}
.grid-text del {
  text-decoration: line-through;
}
```

- [ ] **Step 5: Make `fitGrid` text-aware**

In `lib/use-auto-fit.ts`, widen the overflow filter (line 138) so a text-bearing cell is eligible for shrink:

```ts
    const contents = [...gridStep.querySelectorAll<HTMLElement>(".grid-cell")]
      .filter((cell) => cell.querySelector(":scope > .grid-cell-content .callout, :scope > .grid-cell-content .grid-text"))
      .map((cell) => cell.querySelector<HTMLElement>(":scope > .grid-cell-content"))
```

- [ ] **Step 6: Verify build, types, lint, and the grid-render test**

Run: `pnpm typecheck && pnpm lint && pnpm test --run lib/grid-render.test.ts`
Expected: no type/lint errors; the grid-render test passes.

- [ ] **Step 7: Build (renderer + print path compile clean)**

Run: `pnpm build`
Expected: build succeeds (the `/print` route and `GridStep` compile with the new branch).

- [ ] **Step 8: Commit**

```bash
git add components/renderer/GridStep.tsx components/renderer/renderer.css lib/use-auto-fit.ts lib/grid-render.test.ts
git commit -m "feat: render rich-text blocks in grid cells, fit-aware"
```

---

### Task 4: Authoring — toolbar + CellEditor text blocks

**Files:**
- Modify: `components/editor/RichTextArea.tsx` (add opt-in `showHeadings` / `showStrike` props + buttons)
- Modify: `components/editor/CellEditor.tsx` (unified content-blocks list + "Add text" button + text-block item)
- Modify: `components/editor/editor.css` (add a small `.block-label` rule)

**Interfaces:**
- Consumes: store actions `addCellText` / `updateCellText` (Task 2); existing store actions `removeCellObject`, `moveCellObject`, `updateCellCallout`, `updateCellObjectPlacement`, `addCellCallout`; existing `RichTextArea` `wrap` / `prefixLines` helpers.
- Produces: a `RichTextArea` that, when `showHeadings`/`showStrike` are set, shows Heading (`## `), Subheading (`### `), and Strike (`~~`) buttons. `CellEditor` shows callouts and text blocks in one ordered list with per-block move/remove, plus "+ Add callout" and "+ Add text".

- [ ] **Step 1: Extend `RichTextArea` with opt-in heading + strike buttons**

In `components/editor/RichTextArea.tsx`, add the two props (default `false` so existing callers — callout bodies — are unchanged):

```tsx
export default function RichTextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
  showHeadings = false,
  showStrike = false,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  showHeadings?: boolean;
  showStrike?: boolean;
}) {
```

In the `.rta-toolbar`, add the new buttons after the Italic button and before the Bullet button:

```tsx
        <button type="button" onClick={() => apply(wrap("*"))} title="Italic">
          <i>I</i>
        </button>
        {showStrike ? (
          <button type="button" onClick={() => apply(wrap("~~"))} title="Strikethrough">
            <s>S</s>
          </button>
        ) : null}
        {showHeadings ? (
          <>
            <button type="button" onClick={() => apply(prefixLines(() => "## "))} title="Heading">
              H2
            </button>
            <button type="button" onClick={() => apply(prefixLines(() => "### "))} title="Subheading">
              H3
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => apply(prefixLines(() => "- "))}
          title="Bullet list"
        >
          •
        </button>
```

(`prefixLines((n) => string)` ignores `n` here — a constant `"## "` prefix per selected line. This matches the non-toggling behavior of the existing bullet/number buttons.)

- [ ] **Step 2: Verify the toolbar change compiles**

Run: `pnpm typecheck`
Expected: no errors (callout bodies still call `RichTextArea` with the old props; defaults keep their toolbar unchanged).

- [ ] **Step 3: Wire the new store actions into `CellEditor`**

In `components/editor/CellEditor.tsx`, add ONLY these two new store selectors immediately after the existing `moveCellObject` selector (line 37). Do NOT re-declare `updateCellObjectPlacement` — it is already a selector on line 38.

```tsx
  const moveCellObject = useEditor((s) => s.moveCellObject); // existing — anchor, do not duplicate
  const addCellText = useEditor((s) => s.addCellText);
  const updateCellText = useEditor((s) => s.updateCellText);
```

- [ ] **Step 4: Build one ordered content-blocks list (callouts + text)**

In `components/editor/CellEditor.tsx`, replace the `callouts` derivation (line 61) with a unified blocks list that keeps the absolute object index (so `moveCellObject` / `removeCellObject` get the right index):

```tsx
  const blocks = cell.objects
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.kind === "callout" || o.kind === "text");
```

- [ ] **Step 5: Render both block kinds in the list and add the "Add text" button**

In `components/editor/CellEditor.tsx`, replace the existing `.callout-list` block AND the single `+ Add callout` button (lines 102-144) with:

```tsx
      <div className="callout-list">
        {blocks.map(({ o, i }) =>
          o.kind === "callout" ? (
            <div className={`callout-item${selectedObjId === o.id ? " selected" : ""}`} key={o.id}>
              <div className="callout-item-head">
                <select
                  value={normalizeCalloutType(o.callout?.type)}
                  onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { type: e.target.value as Callout["type"] })}
                >
                  {CALLOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="mini-btns">
                  {o.positioned ? (
                    <button
                      className="mini-btn"
                      onClick={() => updateCellObjectPlacement(ci, si, ri, cellIndex, o.id, { positioned: false })}
                      aria-label="Dock to flow"
                      title="Dock to flow"
                    >
                      ⤓
                    </button>
                  ) : null}
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                  <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
                </div>
              </div>
              <input
                placeholder="Title"
                value={o.callout?.title ?? ""}
                onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { title: e.target.value })}
              />
              <RichTextArea
                rows={2}
                placeholder="Body"
                value={o.callout?.body ?? ""}
                onChange={(v) => updateCellCallout(ci, si, ri, cellIndex, i, { body: v })}
              />
            </div>
          ) : (
            <div className={`callout-item${selectedObjId === o.id ? " selected" : ""}`} key={o.id}>
              <div className="callout-item-head">
                <span className="block-label">Text</span>
                <div className="mini-btns">
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                  <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
                </div>
              </div>
              <RichTextArea
                rows={4}
                placeholder="Text…"
                value={o.text ?? ""}
                onChange={(v) => updateCellText(ci, si, ri, cellIndex, i, v)}
                showHeadings
                showStrike
              />
            </div>
          ),
        )}
      </div>
      <div className="cell-add-row">
        <button className="add-btn" onClick={() => addCellCallout(ci, si, ri, cellIndex)}>
          + Add callout
        </button>
        <button className="add-btn" onClick={() => addCellText(ci, si, ri, cellIndex)}>
          + Add text
        </button>
      </div>
```

- [ ] **Step 6: Add minimal CSS for the text-block label and the add-button row**

In `components/editor/editor.css`, add near the other `.cell-editor` rules (e.g. after the `.cell-editor .callout-item.selected` rule, line ~1208):

```css
.cell-editor .block-label {
  font-family: var(--font-heading, inherit);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink, inherit);
}
.cell-editor .cell-add-row {
  display: flex;
  gap: 8px;
}
.cell-editor .cell-add-row .add-btn {
  flex: 1;
}
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 8: Full test suite**

Run: `pnpm test --run`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/editor/RichTextArea.tsx components/editor/CellEditor.tsx components/editor/editor.css
git commit -m "feat: author rich-text blocks in the cell editor"
```

---

## Manual verification (after Task 4, before final review)

Run `pnpm dev`, open a project, select a step, switch it to grid mode, select a cell, and confirm:
1. "+ Add text" adds a text block; typing renders live in the preview cell.
2. Heading / Subheading / Strike / Bold / Italic / Bullet / Number buttons all produce the right rendering (`## ` → larger heading, `~~x~~` → struck text, lists indented).
3. Move up/down reorders the block relative to image + callouts; remove deletes it.
4. A long text block in a small cell shrinks (fitGrid) rather than overflowing the page.
5. Open `/print` (and Export PDF) for the same step — the text block renders identically, with no editor chrome.
6. A legacy (non-grid) step and an existing callout are visually unchanged.
```
