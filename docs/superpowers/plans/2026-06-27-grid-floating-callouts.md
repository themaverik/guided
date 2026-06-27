# On-Canvas Drag + Absolute Callout Positioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author drag a grid-cell callout off the vertical flow stack so it floats at an absolute position within its cell, rendering identically in preview and print.

**Architecture:** One opt-in `StackedObject.positioned?` flag. The renderer (`GridStep`) splits each cell's objects into a flow layer (`.grid-cell-content`, unchanged, the only layer `fitGrid` scales) and an absolute floating layer (`.grid-cell-floats`). A new editor-only overlay (`PreviewCellFloat`) drags/resizes callouts via the store; the callout *position* is document data (renders in print), only the *handles* are editor-only.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Zustand vanilla store, Tailwind v4 + plain CSS, vitest (node env, `lib/**/*.test.ts`, `@/*` alias), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-27-grid-floating-callouts-design.md`. **BASE:** branch `feature/improvement-rev3`; record HEAD before Task 1 (do not use `HEAD~1` for review ranges). Plans 6–8 (cell stacks, cell authoring, `fitGrid`) are the substrate.

## Global Constraints

- **Immutability:** every `Book` edit returns a NEW book via `lib/book-mutations.ts` (`clone = structuredClone`); never mutate document state in place. Bad index / wrong kind → return the SAME `book` reference (no clone), matching the existing cell mutations.
- **`Book` JSON is the single source of truth;** HTML/PDF are derived. Never store derived output.
- **Pixel parity / zero regression:** a cell with NO floating callouts must render byte-identical to today (legacy + migrated books stay pixel-identical). `positioned` absent/false ⇒ flowed; x/y/w ignored.
- **Renderer print-accuracy:** editor-only affordances (drag handles, hit targets, guides) must NEVER appear in export. The floating-callout POSITION is data and DOES render in print; `data-obj-id` is a harmless attribute (like `data-screen-label`). The drag overlay lives only in `components/editor/**`.
- **Schema/grid-model change → MADR ADR:** Task 1 amends `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`.
- **TDD for pure logic** (`lib/**`); component/CSS/overlay changes are typecheck + build + manual verified (no DOM test harness in this project — do NOT add one).
- **Callouts only.** No image floating, no cross-cell drag, no on-canvas flow reordering (reorder stays in the panel).
- **Commits:** Conventional Commits; **NO AI attribution, NO `Co-Authored-By` trailer.**
- **Commands:** `pnpm test --run` (unit), `pnpm typecheck`, `pnpm build`. Run from repo root.

---

### Task 1: Schema flag + ADR amendment + grid-render partition helpers

**Files:**
- Modify: `lib/book-schema.ts` (add `StackedObject.positioned?`)
- Modify: `lib/grid-render.ts` (add `isFloatingCallout`, `flowObjects`, `floatingCallouts`)
- Test: `lib/grid-render.test.ts` (exists — append a describe block)
- Modify: `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md` (append a Plan 9 amendment)

**Interfaces:**
- Consumes: `GridCell`, `StackedObject` from `lib/book-schema.ts`.
- Produces:
  - `StackedObject.positioned?: boolean`
  - `isFloatingCallout(obj: StackedObject): boolean`
  - `flowObjects(cell: GridCell): StackedObject[]`
  - `floatingCallouts(cell: GridCell): StackedObject[]`

- [ ] **Step 1: Add the schema field.** In `lib/book-schema.ts`, inside `interface StackedObject`, immediately after the `fit?: ImageFit;` line (currently line 220), add:

```ts
  /** Callout only: true = floats at absolute x/y/w within the cell (out of the
   *  flow stack). Absent/false = flowed (x/y/w ignored). Height is content-driven. */
  positioned?: boolean;
```

- [ ] **Step 2: Write the failing test.** In `lib/grid-render.test.ts`, append:

```ts
import { isFloatingCallout, flowObjects, floatingCallouts } from "./grid-render";
import type { GridCell, StackedObject } from "./book-schema";

const img = (id: string): StackedObject => ({ id, role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.png" });
const flowCo = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const floatCo = (id: string): StackedObject => ({ ...flowCo(id), positioned: true, x: 0.2, y: 0.3, w: 0.4 });
const cellWith = (objects: StackedObject[]): GridCell => ({ widthFr: 1, objects });

describe("grid-render floating partition", () => {
  it("isFloatingCallout: only positioned callouts", () => {
    expect(isFloatingCallout(floatCo("a"))).toBe(true);
    expect(isFloatingCallout(flowCo("b"))).toBe(false);
    // a positioned IMAGE is NOT a floating callout (kind guard)
    expect(isFloatingCallout({ ...img("c"), positioned: true })).toBe(false);
  });

  it("flowed-only cell: all flow, none floating", () => {
    const cell = cellWith([img("i"), flowCo("c")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i", "c"]);
    expect(floatingCallouts(cell)).toEqual([]);
  });

  it("floating-only callout: not in flow", () => {
    const cell = cellWith([img("i"), floatCo("f")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i"]);
    expect(floatingCallouts(cell).map((o) => o.id)).toEqual(["f"]);
  });

  it("mixed cell: partitions flow vs floating, preserves order", () => {
    const cell = cellWith([img("i"), flowCo("c"), floatCo("f")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i", "c"]);
    expect(floatingCallouts(cell).map((o) => o.id)).toEqual(["f"]);
  });

  it("empty cell: both empty", () => {
    const cell = cellWith([]);
    expect(flowObjects(cell)).toEqual([]);
    expect(floatingCallouts(cell)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

Run: `pnpm test --run lib/grid-render.test.ts`
Expected: FAIL — `isFloatingCallout`/`flowObjects`/`floatingCallouts` are not exported.

- [ ] **Step 4: Implement the helpers.** Append to `lib/grid-render.ts`:

```ts
/** A callout that floats at an absolute x/y/w within its cell (out of flow). */
export function isFloatingCallout(obj: StackedObject): boolean {
  return obj.kind === "callout" && obj.positioned === true;
}

/** Objects that render in the cell's flow stack — everything except floating callouts. */
export function flowObjects(cell: GridCell): StackedObject[] {
  return cell.objects.filter((o) => !isFloatingCallout(o));
}

/** Callouts that float at absolute x/y/w (positioned === true && kind === "callout"). */
export function floatingCallouts(cell: GridCell): StackedObject[] {
  return cell.objects.filter(isFloatingCallout);
}
```

The existing import line is `import type { GridCell, ImageFit, StackedObject } from "./book-schema";` — already has the needed types; no import change required.

- [ ] **Step 5: Run the test to verify it passes.**

Run: `pnpm test --run lib/grid-render.test.ts`
Expected: PASS (all new cases green).

- [ ] **Step 6: Amend ADR-006.** Append to `docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md`:

```markdown
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
```

- [ ] **Step 7: Typecheck + full suite.**

Run: `pnpm typecheck && pnpm test --run`
Expected: typecheck 0 errors; all prior tests still pass plus the 5 new grid-render cases.

- [ ] **Step 8: Commit.**

```bash
git add lib/book-schema.ts lib/grid-render.ts lib/grid-render.test.ts docs/adr/ADR-006-flexible-grid-cell-stacks-and-shape-standardization.md
git commit -m "feat: add positioned flag + cell flow/floating partition helpers (ADR-006)"
```

---

### Task 2: `updateCellObjectPlacement` mutation

**Files:**
- Modify: `lib/book-mutations.ts` (add `updateCellObjectPlacement`; add `StackedObject` to the schema import)
- Test: `lib/book-mutations.test.ts` (exists — append a describe block)

**Interfaces:**
- Consumes: `cellOf` (module-private helper, `lib/book-mutations.ts:515`), `clone`, `Book`, `StackedObject`.
- Produces:
  - `updateCellObjectPlacement(book: Book, ci: number, si: number, ri: number, cellIndex: number, objectId: string, patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>): Book`

- [ ] **Step 1: Write the failing test.** In `lib/book-mutations.test.ts`, append:

```ts
import { updateCellObjectPlacement } from "./book-mutations";
import type { Book, StackedObject } from "./book-schema";

const co = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const im = (id: string): StackedObject => ({ id, role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.png" });
const bookWith = (objects: StackedObject[]): Book => ({
  title: "", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c1", title: "", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});
const objOf = (b: Book, id: string) =>
  b.chapters[0].steps[0].grid![0].cells[0].objects.find((o) => o.id === id)!;

describe("updateCellObjectPlacement", () => {
  it("float: sets positioned + x/y/w", () => {
    const book = bookWith([co("a")]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: true, x: 0.2, y: 0.3, w: 0.4 });
    const o = objOf(out, "a");
    expect(o.positioned).toBe(true);
    expect([o.x, o.y, o.w]).toEqual([0.2, 0.3, 0.4]);
  });

  it("move: patches x/y only, leaves positioned", () => {
    const book = bookWith([{ ...co("a"), positioned: true, x: 0.1, y: 0.1, w: 0.5 }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { x: 0.6, y: 0.7 });
    const o = objOf(out, "a");
    expect([o.x, o.y, o.w, o.positioned]).toEqual([0.6, 0.7, 0.5, true]);
  });

  it("resize: patches w only", () => {
    const book = bookWith([{ ...co("a"), positioned: true, w: 0.5 }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { w: 0.3 });
    expect(objOf(out, "a").w).toBe(0.3);
  });

  it("dock: clears positioned", () => {
    const book = bookWith([{ ...co("a"), positioned: true }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: false });
    expect(objOf(out, "a").positioned).toBe(false);
  });

  it("kind-guard: non-callout object returns the same book ref", () => {
    const book = bookWith([im("img")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 0, "img", { positioned: true })).toBe(book);
  });

  it("bad cell index returns the same book ref", () => {
    const book = bookWith([co("a")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 9, "a", { x: 0.5 })).toBe(book);
  });

  it("unknown objectId returns the same book ref", () => {
    const book = bookWith([co("a")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 0, "nope", { x: 0.5 })).toBe(book);
  });

  it("immutable: input book is unchanged", () => {
    const book = bookWith([co("a")]);
    updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: true, x: 0.9 });
    expect(objOf(book, "a").positioned).toBeUndefined();
    expect(objOf(book, "a").x).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: FAIL — `updateCellObjectPlacement` is not exported.

- [ ] **Step 3: Implement the mutation.** In `lib/book-mutations.ts`, add `StackedObject` to the type import from `./book-schema` (the block at lines 12–27). Then, at the end of the `// ── Cell objects (Plan 7) ──` section (after `moveCellObject`, currently ending line 580), add:

```ts
/** Patch a cell callout's placement (float / move / resize / dock). Immutable;
 *  kind-guarded to callouts; bad index or non-callout returns the same book ref. */
export function updateCellObjectPlacement(
  book: Book, ci: number, si: number, ri: number, cellIndex: number,
  objectId: string,
  patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>,
): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects.find((o) => o.id === objectId);
  if (!obj || obj.kind !== "callout") return book;
  Object.assign(obj, patch);
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `pnpm test --run lib/book-mutations.test.ts`
Expected: PASS (all 8 new cases green).

- [ ] **Step 5: Typecheck + full suite.**

Run: `pnpm typecheck && pnpm test --run`
Expected: typecheck 0 errors; all prior + new tests pass.

- [ ] **Step 6: Commit.**

```bash
git add lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: add updateCellObjectPlacement cell-callout placement mutation"
```

---

### Task 3: Renderer — flow + floating layers, `data-obj-id`, CSS, fitGrid scope

**Files:**
- Modify: `components/renderer/GridStep.tsx` (split flow/floating layers, set `data-obj-id`)
- Modify: `components/renderer/Callout.tsx` (optional `domId` prop → `data-obj-id`)
- Modify: `components/renderer/renderer.css` (`.grid-cell{position:relative}` + `.grid-cell-floats` + `.grid-cell-float`)
- Modify: `lib/use-auto-fit.ts` (scope `fitGrid` callout filter to `.grid-cell-content .callout`)

**Interfaces:**
- Consumes: `flowObjects`, `floatingCallouts` (Task 1); `Callout`, `ImageSlot`, `imageSrc`, `displayPath`.
- Produces (DOM contract the editor overlay + fitGrid rely on):
  - flow callout DOM node carries `data-obj-id="<id>"` on its `.callout` root
  - floating callout wrapper `<div class="grid-cell-float" data-obj-id="<id>">` inside `<div class="grid-cell-floats">`, both under `.grid-cell`
  - `fitGrid` only counts `.grid-cell-content .callout` as overflow-capable

- [ ] **Step 1: Add the optional `domId` prop to `Callout`.** In `components/renderer/Callout.tsx`, add `domId` to the props and emit it as `data-obj-id` on the root `.callout` div. Example (adapt to the file's existing prop signature):

```tsx
// in the component's props type, add:  domId?: string;
// on the root element (currently: <div className={`callout callout--${type}`} style={style}>):
<div className={`callout callout--${type}`} style={style} data-obj-id={domId}>
```

When `domId` is undefined React omits the attribute, so all existing (legacy + non-grid) Callout usages are unchanged.

- [ ] **Step 2: Rewrite `GridStep` cell rendering.** Replace the body of `components/renderer/GridStep.tsx` with:

```tsx
/*
 * Renderer for a step's flexible grid (Plans 3, 6, 9): rows distribute by
 * heightFr, cells by widthFr (flex-grow). Each cell renders a FLOW layer
 * (.grid-cell-content — image + docked callouts, the only layer fitGrid scales)
 * and, when present, an absolute FLOATING layer (.grid-cell-floats) of callouts
 * positioned x/y/w (cell-relative). Print-safe: positions are document data.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import { flowObjects, floatingCallouts } from "@/lib/grid-render";
import Callout from "./Callout";
import ImageSlot from "./ImageSlot";

export default function GridStep({
  grid,
  chapter,
  assetBase,
}: {
  grid: GridRow[];
  chapter: Chapter;
  assetBase: string;
}) {
  return (
    <div className="grid-step">
      {grid.map((row, ri) => (
        <div className="grid-row" key={ri} style={{ flexGrow: row.heightFr }}>
          {row.cells.map((cell, ci) => {
            const flow = flowObjects(cell);
            const floats = floatingCallouts(cell);
            return (
              <div className="grid-cell" key={ci} style={{ flexGrow: cell.widthFr }}>
                <div className="grid-cell-content">
                  {flow.map((obj) => {
                    if (obj.kind === "image") {
                      return (
                        <ImageSlot
                          key={obj.id}
                          src={imageSrc(assetBase, chapter.id, obj.ref)}
                          label="Screen"
                          path={displayPath(chapter.id, obj.ref)}
                          fit={obj.fit}
                        />
                      );
                    }
                    if (obj.kind === "callout" && obj.callout) {
                      return <Callout key={obj.id} data={obj.callout} domId={obj.id} />;
                    }
                    return null; // text objects: Plan 10
                  })}
                </div>
                {floats.length > 0 ? (
                  <div className="grid-cell-floats">
                    {floats.map((obj) =>
                      obj.callout ? (
                        <div
                          key={obj.id}
                          className="grid-cell-float"
                          data-obj-id={obj.id}
                          style={{
                            left: `${obj.x * 100}%`,
                            top: `${obj.y * 100}%`,
                            width: `${obj.w * 100}%`,
                          }}
                        >
                          <Callout data={obj.callout} />
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

Note the pixel-parity invariant: when `floats.length === 0`, `flow` equals all objects and no `.grid-cell-floats` div is emitted, so the cell markup matches the previous renderer exactly (the only difference is `data-obj-id` on flow callouts, which is an inert attribute).

- [ ] **Step 3: Add the CSS.** In `components/renderer/renderer.css`, add `position: relative;` to the `.grid-cell` rule (currently lines 846–851), then add two new rules after the `.grid-cell-content` block (after line 862):

```css
.grid-cell {
  position: relative; /* anchor for the absolute .grid-cell-floats layer (Plan 9) */
  /* existing: flex 1 1 0; min-width:0; display:flex; overflow:hidden; */
}
.grid-cell-floats {
  position: absolute;
  inset: 0;
  pointer-events: none; /* renderer layer is display-only; editor overlay drives interaction */
}
.grid-cell-float {
  position: absolute; /* left/top/width set inline from x/y/w; height auto from content */
}
```

(Edit the existing `.grid-cell` block to include `position: relative;` rather than duplicating the selector.)

- [ ] **Step 4: Scope the `fitGrid` callout filter.** In `lib/use-auto-fit.ts`, in `fitGrid` (line ~137), change the filter so floating callouts don't count as flow overflow:

```ts
    const contents = [...gridStep.querySelectorAll<HTMLElement>(".grid-cell")]
      .filter((cell) => cell.querySelector(":scope > .grid-cell-content .callout"))
      .map((cell) => cell.querySelector<HTMLElement>(":scope > .grid-cell-content"))
      .filter((c): c is HTMLElement => c != null);
```

Only the `.filter(...)` selector changes (`.callout` → `:scope > .grid-cell-content .callout`). The rest of `fitGrid` is unchanged.

- [ ] **Step 5: Typecheck + build + suite (no regressions).**

Run: `pnpm typecheck && pnpm test --run && pnpm build`
Expected: typecheck 0 errors; full unit suite still green (no DOM tests touched); `pnpm build` succeeds.

- [ ] **Step 6: Record manual-verification checklist (deferred to human).** No automated visual test exists. The reviewer/human must confirm in-browser: (a) a grid step with only flowed callouts renders pixel-identical to before; (b) hand-setting `positioned:true` + x/y/w on a cell callout in `book.json` floats it at that position in BOTH the editor preview and `/<slug>/print` (+ PDF); (c) a cell whose only callout is floated is NOT shrunk by `fitGrid`; (d) a floating callout past the cell edge clips. Note these in the report; do not block the task on them.

- [ ] **Step 7: Commit.**

```bash
git add components/renderer/GridStep.tsx components/renderer/Callout.tsx components/renderer/renderer.css lib/use-auto-fit.ts
git commit -m "feat: render floating cell callouts in an absolute layer (preview + print)"
```

---

### Task 4: Store — `Selection.objectId`, `selectCellObject`, placement action

**Files:**
- Modify: `lib/store.tsx` (add `Selection.objectId?`, `selectCellObject`, `updateCellObjectPlacement` action; add `StackedObject` import)
- Test: `lib/store.test.ts` (exists — append cases)

**Interfaces:**
- Consumes: `M.updateCellObjectPlacement` (Task 2); `createEditorStore` (exists).
- Produces (store API the editor overlay + panel consume):
  - `Selection.objectId?: string | null`
  - `selectCellObject(ci: number, si: number, ri: number, cellIndex: number, objectId: string): void`
  - `updateCellObjectPlacement(ci: number, si: number, ri: number, cellIndex: number, objectId: string, patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>): void`

- [ ] **Step 1: Write the failing test.** In `lib/store.test.ts`, append (adapt the fixture import to whatever the file already uses to build a store):

```ts
import { createEditorStore } from "./store";
import type { Book, StackedObject } from "./book-schema";

const co = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const gridBook = (objects: StackedObject[]): Book => ({
  title: "", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c1", title: "", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});

describe("store: floating cell callouts", () => {
  it("selectCellObject sets cellIndex + objectId and clears selectedAnnotation", () => {
    const store = createEditorStore(gridBook([co("a")]), "demo");
    store.getState().selectAnnotation("x");
    store.getState().selectCellObject(0, 0, 0, 0, "a");
    const sel = store.getState().selection;
    expect(sel.cellIndex).toBe(0);
    expect(sel.objectId).toBe("a");
    expect(store.getState().selectedAnnotation).toBe(null);
  });

  it("updateCellObjectPlacement action floats the callout in the book", () => {
    const store = createEditorStore(gridBook([co("a")]), "demo");
    store.getState().updateCellObjectPlacement(0, 0, 0, 0, "a", { positioned: true, x: 0.25, y: 0.5, w: 0.4 });
    const o = store.getState().book.chapters[0].steps[0].grid![0].cells[0].objects[0];
    expect(o.positioned).toBe(true);
    expect([o.x, o.y, o.w]).toEqual([0.25, 0.5, 0.4]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — `selectCellObject` / `updateCellObjectPlacement` are not on the store.

- [ ] **Step 3: Add the field, action types, and implementations.** In `lib/store.tsx`:

(a) Add `StackedObject` to the `book-schema` type import (the block at lines 14–31).

(b) In `interface Selection` (after `cellIndex?` at line 42), add:

```ts
  /** Selected cell object id (a floating callout), grid mode only. */
  objectId?: string | null;
```

(c) In `interface EditorState`, in the selection group (after `selectCell`, line 59), add:

```ts
  selectCellObject: (ci: number, si: number, ri: number, cellIndex: number, objectId: string) => void;
```

and in the cell-objects group (after `moveCellObject`, line 127), add:

```ts
  updateCellObjectPlacement: (ci: number, si: number, ri: number, cellIndex: number, objectId: string, patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>) => void;
```

(d) In `createEditorStore`, after the `selectCell` implementation (line 235–239), add:

```ts
    selectCellObject: (chapterIndex, stepIndex, rowIndex, cellIndex, objectId) =>
      set({
        selection: { chapterIndex, stepIndex, rowIndex, slotIndex: null, cellIndex, objectId },
        selectedAnnotation: null,
      }),
```

(e) In the `// ── cell objects ──` action group (after `moveCellObject`, line 402–403), add:

```ts
    updateCellObjectPlacement: (ci, si, ri, cellIndex, objectId, patch) =>
      set((s) => ({ book: M.updateCellObjectPlacement(s.book, ci, si, ri, cellIndex, objectId, patch) })),
```

Note: the existing `selectCell`/`selectStep`/`selectChapter`/`selectRow` build fresh selection literals without `objectId`, so they already clear it — no change needed there. The `reconcile*` helpers spread `...sel`, leaving a stale `objectId` after a row/column removal; that is harmless (the panel and overlay only act on an object found in the currently-selected cell) — leave as-is (a known accepted Minor, consistent with the deferred stale-`rowIndex` note from Plan 8).

- [ ] **Step 4: Run the test to verify it passes.**

Run: `pnpm test --run lib/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite.**

Run: `pnpm typecheck && pnpm test --run`
Expected: typecheck 0 errors; all prior + new tests pass.

- [ ] **Step 6: Commit.**

```bash
git add lib/store.tsx lib/store.test.ts
git commit -m "feat: store selectCellObject + updateCellObjectPlacement actions"
```

---

### Task 5: Editor overlay — `PreviewCellFloat` (drag / resize / select) + mount

**Files:**
- Create: `components/editor/PreviewCellFloat.tsx`
- Modify: `components/editor/PreviewPane.tsx` (mount it for grid steps, top-most editor overlay)
- Modify: `components/editor/editor.css` (overlay handle + hit-target styles)

**Interfaces:**
- Consumes: `selectCellObject`, `updateCellObjectPlacement` (Task 4); the DOM contract from Task 3 (`[data-obj-id]` on callout nodes, `.grid-cell-float` wrappers); `bookFitKey`, `stepLayoutMode`.
- Produces: an editor-only overlay; no exported API beyond the default component.

- [ ] **Step 1: Create the overlay component.** Create `components/editor/PreviewCellFloat.tsx`:

```tsx
"use client";

/*
 * Editor-only overlay (Plan 9): drag grid-cell callouts to absolute positions.
 * Mirrors PreviewAnnotations' pointer-capture drag. Mounted ABOVE PreviewGridSelect
 * so callout drags win over cell-select clicks; its small hit targets cover only
 * callouts, so clicks elsewhere fall through. Never touches the renderer/print path.
 *
 * Coordinates are cell-relative (0–1). Pointer→cell-relative uses the cell's client
 * rect (scale-independent — pointer and rect are both client-space). A press that
 * moves < DRAG_PX is a click (selects the callout); past it, a drag. The first drag
 * of a FLOWED callout detaches it (positioned:true, x/y from pointer, w from its
 * measured width); a floating callout's drag patches x/y, its side handle patches w.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => clamp(n, 0, 1);
const DRAG_PX = 3;          // screen px before a press becomes a drag
const MIN_W = 0.1;          // min floating width (cell-relative)
const DETACH_MIN_W = 0.2;   // floor for width captured on detach

interface Box { l: number; t: number; w: number; h: number }
interface Target {
  ri: number; cellIndex: number; objId: string; positioned: boolean;
  box: Box;                 // callout box, unscaled, relative to scaler (for hit target + handle)
  rel: { x: number; y: number; w: number }; // callout position relative to its cell (0–1)
}

export default function PreviewCellFloat({
  scalerRef, pageIndex, ci, si, grid, fitKey, scale, selectedObjId,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number; si: number;
  grid: GridRow[];
  fitKey: string;
  scale: number;
  selectedObjId: string | null;
}) {
  const selectCellObject = useEditor((s) => s.selectCellObject);
  const updatePlacement = useEditor((s) => s.updateCellObjectPlacement);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const drag = useRef<{
    t: Target; mode: "move" | "resize"; cellRect: DOMRect;
    grabDX: number; grabDY: number; detachW: number;
    started: boolean; startX: number; startY: number; positioned: boolean;
  } | null>(null);
  const raf = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Measure each cell + the callout boxes inside it (both flowed and floating).
  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setTargets(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: (r.left - base.left) / scale, t: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const out: Target[] = [];
    [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")].forEach((re, ri) => {
      [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].forEach((ce, cellIndex) => {
        const cellBox = toBox(ce);
        ce.querySelectorAll<HTMLElement>("[data-obj-id]").forEach((el) => {
          const objId = el.dataset.objId!;
          const positioned = el.closest(".grid-cell-floats") != null;
          const box = toBox(el);
          out.push({
            ri, cellIndex, objId, positioned, box,
            rel: {
              x: cellBox.w ? (box.l - cellBox.l) / cellBox.w : 0,
              y: cellBox.h ? (box.t - cellBox.t) / cellBox.h : 0,
              w: cellBox.w ? box.w / cellBox.w : 0.3,
            },
          });
        });
      });
    });
    setTargets(out);
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!targets) return null;

  const cellRectOf = (ri: number, cellIndex: number): DOMRect | null => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    const re = gridEl?.querySelectorAll<HTMLElement>(":scope > .grid-row")[ri];
    const ce = re?.querySelectorAll<HTMLElement>(":scope > .grid-cell")[cellIndex];
    return ce ? ce.getBoundingClientRect() : null;
  };

  const pointerRel = (cellRect: DOMRect, e: { clientX: number; clientY: number }) => ({
    x: clamp01((e.clientX - cellRect.left) / cellRect.width),
    y: clamp01((e.clientY - cellRect.top) / cellRect.height),
  });

  const startDrag = (t: Target, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cellRect = cellRectOf(t.ri, t.cellIndex);
    if (!cellRect) return;
    const p = pointerRel(cellRect, e);
    drag.current = {
      t, mode, cellRect,
      grabDX: p.x - t.rel.x, grabDY: p.y - t.rel.y,
      detachW: clamp(t.rel.w, DETACH_MIN_W, 1),
      started: mode === "resize", startX: e.clientX, startY: e.clientY,
      positioned: t.positioned,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const apply = (e: { clientX: number; clientY: number }) => {
    const d = drag.current;
    if (!d) return;
    const p = pointerRel(d.cellRect, e);
    if (d.mode === "resize") {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { w: clamp(p.x - d.t.rel.x, MIN_W, 1) });
      return;
    }
    const x = clamp01(p.x - d.grabDX);
    const y = clamp01(p.y - d.grabDY);
    if (!d.positioned) {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { positioned: true, x, y, w: d.detachW });
      d.positioned = true; // subsequent moves only patch x/y
    } else {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { x, y });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_PX) return;
      d.started = true;
    }
    const ev = { clientX: e.clientX, clientY: e.clientY };
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(ev));
  };

  const onUp = (t: Target) => (e: React.PointerEvent) => {
    const d = drag.current;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (d && !d.started) selectCellObject(ci, si, t.ri, t.cellIndex, t.objId); // a click, not a drag
    drag.current = null;
  };

  return (
    <div ref={rootRef} className="preview-cell-float" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {targets.map((t) => {
        const isSel = selectedObjId === t.objId;
        return (
          <div key={`${t.ri}-${t.cellIndex}-${t.objId}`}>
            <div
              className={`cell-float-hit${t.positioned ? " floating" : ""}${isSel ? " selected" : ""}`}
              style={{ position: "absolute", left: t.box.l, top: t.box.t, width: t.box.w, height: t.box.h, pointerEvents: "all" }}
              onPointerDown={startDrag(t, "move")}
              onPointerMove={onMove}
              onPointerUp={onUp(t)}
            />
            {isSel && t.positioned ? (
              <div
                className="cell-float-resize"
                style={{ position: "absolute", left: t.box.l + t.box.w - 6, top: t.box.t + t.box.h / 2 - 6, pointerEvents: "all" }}
                onPointerDown={startDrag(t, "resize")}
                onPointerMove={onMove}
                onPointerUp={onUp(t)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add overlay styles.** In `components/editor/editor.css`, append:

```css
/* Floating callout drag overlay (Plan 9, editor-only) */
.preview-cell-float .cell-float-hit {
  cursor: grab;
  border-radius: 4px;
}
.preview-cell-float .cell-float-hit.floating {
  outline: 1.5px dashed rgba(37, 99, 235, 0.5);
  outline-offset: 1px;
}
.preview-cell-float .cell-float-hit.selected {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
  background: rgba(37, 99, 235, 0.06);
}
.preview-cell-float .cell-float-resize {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #2563eb;
  cursor: ew-resize;
}
```

- [ ] **Step 3: Mount the overlay in `PreviewPane`.** In `components/editor/PreviewPane.tsx`, import the component and render it as the LAST child of `.preview-scaler` (top-most editor overlay), guarded to grid steps. Add the import:

```tsx
import PreviewCellFloat from "./PreviewCellFloat";
```

Then, after the `PreviewGridResize` IIFE block (the one ending at line 216, just before the closing `</div>` of `.preview-scaler`), add:

```tsx
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 ? (
                <PreviewCellFloat
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                  selectedObjId={selection.objectId ?? null}
                />
              ) : null;
            })()}
```

- [ ] **Step 4: Typecheck + build + suite (no regressions).**

Run: `pnpm typecheck && pnpm test --run && pnpm build`
Expected: typecheck 0 errors; unit suite green; build succeeds.

- [ ] **Step 5: Record manual-verification checklist (deferred to human).** In-browser, grid step: (a) drag a flowed callout → it detaches and follows the cursor, persists at drop; (b) drag a floating callout → moves, clamped within the cell; (c) selected floating callout shows a side handle → drag resizes width, height re-wraps; (d) a click (no drag) selects the callout (panel reflects it); (e) cell-select / divider-resize / annotation handles still work where they don't overlap a callout; (f) `/print` shows the callout at its position with NO handles. Note in the report; do not block on them.

- [ ] **Step 6: Commit.**

```bash
git add components/editor/PreviewCellFloat.tsx components/editor/PreviewPane.tsx components/editor/editor.css
git commit -m "feat: on-canvas drag/resize overlay for floating cell callouts"
```

---

### Task 6: CellEditor — "Dock to flow" button + selected-callout highlight

**Files:**
- Modify: `components/editor/CellEditor.tsx` (per-floating-callout dock button; highlight the selected callout)

**Interfaces:**
- Consumes: `updateCellObjectPlacement` action (Task 4); `selection.objectId` (Task 4); the callout list already rendered in `CellEditor` (lines 100–129).
- Produces: panel control to re-flow a floating callout; visual highlight of the canvas-selected callout.

- [ ] **Step 1: Wire the store action + selection.** In `components/editor/CellEditor.tsx`, add to the `useEditor` selector block (near lines 31–37):

```tsx
  const updateCellObjectPlacement = useEditor((s) => s.updateCellObjectPlacement);
  const selectedObjId = useEditor((s) => s.selection.objectId ?? null);
```

- [ ] **Step 2: Add the dock button + highlight in the callout list.** In the callout-item map (lines 101–128), (a) mark the selected item, and (b) for a floating callout (`o.positioned`), render a "Dock to flow" button. Change the item wrapper and head to:

```tsx
        {callouts.map(({ o, i }) => (
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
```

(The `<input>` title field and `<RichTextArea>` body below are unchanged.)

- [ ] **Step 3: Add the highlight style.** In `components/editor/editor.css`, append:

```css
.cell-editor .callout-item.selected {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
  border-radius: 6px;
}
```

- [ ] **Step 4: Typecheck + build + suite (no regressions).**

Run: `pnpm typecheck && pnpm test --run && pnpm build`
Expected: typecheck 0 errors; unit suite green; build succeeds.

- [ ] **Step 5: Record manual-verification checklist (deferred to human).** In-browser: select a floating callout on canvas → its panel item is outlined; the floating callout's item shows a "Dock to flow" (⤓) button; pressing it re-flows the callout into the stack (it leaves `.grid-cell-floats` and re-appears in `.grid-cell-content`); a flowed callout shows NO dock button. Note in the report.

- [ ] **Step 6: Commit.**

```bash
git add components/editor/CellEditor.tsx components/editor/editor.css
git commit -m "feat: dock-to-flow control + selected-callout highlight in CellEditor"
```

---

## Self-Review

**Spec coverage:**
- Schema `positioned?` → Task 1 ✓
- Partition helpers (`flowObjects`/`floatingCallouts`) → Task 1 ✓
- ADR-006 amendment → Task 1 ✓
- `updateCellObjectPlacement` mutation (float/move/resize/dock, guards, immutability) → Task 2 ✓
- Renderer flow + floating layers, preview+print, `.grid-cell{position:relative}` → Task 3 ✓
- `data-obj-id` DOM↔model link → Task 3 (Callout `domId` + float wrapper) ✓
- fitGrid scope fix (`.grid-cell-content .callout`) → Task 3 ✓
- Pixel-parity invariant (no floats ⇒ unchanged markup) → Task 3 note ✓
- `Selection.objectId` + `selectCellObject` + placement action → Task 4 ✓
- Drag-to-detach, move, width-resize, click-to-select overlay → Task 5 ✓
- Mount overlay (grid mode, top-most) → Task 5 ✓
- "Dock to flow" button + edit text in left panel + selection highlight → Task 6 (text editing reuses the existing Plan 7 callout list) ✓
- Move + width resize (height content-driven) → Tasks 2/5 (no `h` patched) ✓
- fitGrid exemption / clip on overflow → Task 3 (separate layer + `overflow:hidden`) ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; manual checks are explicitly deferred-to-human (the project has no DOM test harness — an intentional constraint, not a placeholder).

**Type consistency:** `updateCellObjectPlacement(book, ci, si, ri, cellIndex, objectId, patch)` identical in mutation (Task 2), store type + impl (Task 4), and overlay/panel call sites (Tasks 5/6). `Partial<Pick<StackedObject,"positioned"|"x"|"y"|"w">>` identical across Tasks 2 & 4. `selectCellObject(ci,si,ri,cellIndex,objectId)` identical in Task 4 type/impl and Task 5 call. `flowObjects`/`floatingCallouts`/`isFloatingCallout` signatures identical in Task 1 def and Task 3 use. DOM contract (`[data-obj-id]`, `.grid-cell-float`, `.grid-cell-floats`, `.grid-cell-content .callout`) consistent between Task 3 (producer) and Tasks 3/5 (consumers).

## Execution Notes (carry-over gotchas)

- Harness `<new-diagnostics>` LSP messages during TDD RED are STALE — verify with real `pnpm test --run` + `pnpm typecheck`.
- Implementers sometimes misreport the commit BASE — reconfirm the true range via `git log` before generating each review package.
- `printf` to the SDD ledger breaks on a literal `%` — avoid it (the CSS `100%` strings live in files, not the ledger).
- Models: Task 1/2 (pure, complete code) → cheap tier; Task 4 (store) → mid; Tasks 3/5/6 (component/overlay integration) → mid (sonnet); final whole-branch review → opus.
