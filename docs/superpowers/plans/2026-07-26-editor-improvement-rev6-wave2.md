# Editor Improvement rev6 — Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per-task review by **staff-engineer + frontend-developer** agents (in parallel) before moving on, under **karpathy-guidelines** discipline.

**Goal:** Add annotation z-ordering + fill transparency, and draggable text labels — the two additive annotation-model features.

**Architecture:** Two optional `Book` fields (`Surface.fillOpacity`, `TextLabel.labelOffset`), immutable mutations for reordering, pure geometry helpers for the offset rect + rgba conversion, and data-driven render in `AnnotationLayer` (prints). Editor controls live in the selection popover (z-order buttons) and the context row (opacity slider), plus a label drag handle in `PreviewAnnotations`. **ADR-004 is amended before any code (schema/model change).**

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, Vitest.

## Global Constraints

- **Schema changes are additive + optional.** `Surface.fillOpacity?` and
  `TextLabel.labelOffset?`; absent = today's behavior. **No `schemaVersion` bump,
  no migration.**
- **ADR-first:** amend `docs/adr/ADR-004-annotation-canvas.md` before code.
- **Immutability:** all edits via `lib/book-mutations.ts` (structuredClone).
- **Data-driven render runs in print too** (`components/renderer/AnnotationLayer.tsx`).
  Editor overlays (`PreviewAnnotations.tsx`, popover, context row) never print.
- The editable annotation container in this flow is **`step.annotations`**
  (`updateAnnotation`/`removeAnnotation` operate there — `book-mutations.ts:431,447`).
  Reorder mirrors that exactly.
- Base branch `feature/improvement-rev6` (continues after Wave 1).
- Gate every task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.

---

## File Structure

- `docs/adr/ADR-004-annotation-canvas.md` — amendment (Task 1).
- `lib/book-schema.ts` — `Surface.fillOpacity?`, `TextLabel.labelOffset?`.
- `lib/book-mutations.ts` — `raiseAnnotation`, `lowerAnnotation`.
- `lib/store.tsx` — `bringAnnotationForward`, `sendAnnotationBackward` actions.
- `lib/annotation-palette.ts` — `rgbaFromHex` helper.
- `lib/annotations.ts` — `labelAnchor`, `labelRectFor`, `connectorLabelRect`.
- `components/renderer/AnnotationLayer.tsx` — `fillOpacity` + offset/masked labels.
- `components/editor/AnnotationSelectionPopover.tsx` — forward/back buttons.
- `components/editor/AnnotationContext.tsx` — opacity slider.
- `components/editor/PreviewAnnotations.tsx` — label drag handle + editor rect.
- `lib/book-mutations.test.ts`, `lib/annotations.test.ts`, `lib/annotation-palette.test.ts` — tests.

---

## Task 1: Amend ADR-004 (model change gate)

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`

- [ ] **Step 1: Append an amendment section**

Add a dated amendment documenting: (a) `Surface.fillOpacity?` (0–1, default 1) applied as SVG `fill-opacity`, (b) `TextLabel.labelOffset?` (normalized offset from the label anchor, rendered through the masked free-label path so no stroke crosses the text), and (c) z-order = array-order reorder within `step.annotations` (connectors still paint above surfaces — a deliberate scope limit). Match the file's existing amendment/heading style.

- [ ] **Step 2: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md
git commit -m "docs: amend ADR-004 for fill opacity, label offset, z-order"
```

---

## Task 2: Reorder mutations

**Files:**
- Modify: `lib/book-schema.ts` (`Surface.fillOpacity?`) — add now so later tasks type-check
- Modify: `lib/book-mutations.ts` (after `removeAnnotation`, `:459`)
- Test: `lib/book-mutations.test.ts`

**Interfaces:**
- Produces: `raiseAnnotation(book, ci, si, id): Book`, `lowerAnnotation(book, ci, si, id): Book` — swap the target with its next/previous sibling in `step.annotations`; no-op at the ends or when absent.

- [ ] **Step 1: Add the optional schema field**

In `lib/book-schema.ts`, add to `interface Surface` (near `fill?`):

```ts
  /** Fill alpha 0–1 (default 1). Applied as SVG fill-opacity so a shape beneath
   *  shows through; stroke + label stay fully opaque. */
  fillOpacity?: number;
```

- [ ] **Step 2: Write the failing tests**

In `lib/book-mutations.test.ts`, add:

```ts
import { raiseAnnotation, lowerAnnotation } from "./book-mutations";

function bookWith(ids: string[]) {
  return {
    ...structuredClone(SAMPLE_BOOK), // reuse the file's existing sample/base
    chapters: [{ id: "c", title: "", description: "", steps: [{
      annotations: ids.map((id) => ({ id, kind: "box", x: 0, y: 0, w: 0.1, h: 0.1, stroke: "#000", width: 2 })),
    }] }],
  };
}

describe("raise/lowerAnnotation", () => {
  it("raise swaps with the next sibling (paints later/on top)", () => {
    const out = raiseAnnotation(bookWith(["a", "b", "c"]), 0, 0, "b");
    expect(out.chapters[0].steps[0].annotations!.map((a) => a.id)).toEqual(["a", "c", "b"]);
  });
  it("lower swaps with the previous sibling", () => {
    const out = lowerAnnotation(bookWith(["a", "b", "c"]), 0, 0, "b");
    expect(out.chapters[0].steps[0].annotations!.map((a) => a.id)).toEqual(["b", "a", "c"]);
  });
  it("raise is a no-op at the top", () => {
    const book = bookWith(["a", "b"]);
    expect(raiseAnnotation(book, 0, 0, "b")).toBe(book);
  });
  it("lower is a no-op at the bottom", () => {
    const book = bookWith(["a", "b"]);
    expect(lowerAnnotation(book, 0, 0, "a")).toBe(book);
  });
  it("does not mutate the input", () => {
    const book = bookWith(["a", "b"]);
    raiseAnnotation(book, 0, 0, "a");
    expect(book.chapters[0].steps[0].annotations!.map((a) => a.id)).toEqual(["a", "b"]);
  });
});
```

(Match the file's actual base-book helper — reuse whatever `book-mutations.test.ts` already imports instead of `SAMPLE_BOOK` if named differently.)

- [ ] **Step 3: Run tests to verify they FAIL**

Run: `pnpm test -- book-mutations`
Expected: FAIL — `raiseAnnotation`/`lowerAnnotation` not exported.

- [ ] **Step 4: Implement the mutations**

In `lib/book-mutations.ts` after `removeAnnotation`:

```ts
/** Move an annotation one step later in `step.annotations` (paints on top). */
export function raiseAnnotation(book: Book, ci: number, si: number, id: string): Book {
  return reorderAnnotation(book, ci, si, id, +1);
}
/** Move an annotation one step earlier in `step.annotations` (paints beneath). */
export function lowerAnnotation(book: Book, ci: number, si: number, id: string): Book {
  return reorderAnnotation(book, ci, si, id, -1);
}
function reorderAnnotation(book: Book, ci: number, si: number, id: string, dir: 1 | -1): Book {
  const list = book.chapters[ci]?.steps[si]?.annotations;
  if (!list) return book;
  const i = list.findIndex((a) => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return book;
  const next = clone(book);
  const arr = next.chapters[ci].steps[si].annotations!;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return next;
}
```

(Use the file's existing `clone` helper — the same one `updateAnnotation` uses.)

- [ ] **Step 5: Run tests to verify PASS**

Run: `pnpm test -- book-mutations`
Expected: PASS.

- [ ] **Step 6: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/book-schema.ts lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: raise/lower annotation reorder mutations + fillOpacity field"
```

---

## Task 3: Z-order store actions + popover buttons

**Files:**
- Modify: `lib/store.tsx` (interface near `:205`; impl near `:506`)
- Modify: `components/editor/AnnotationSelectionPopover.tsx`

**Interfaces:**
- Consumes: `M.raiseAnnotation`, `M.lowerAnnotation`.
- Produces: store actions `bringAnnotationForward(ci, si, id)`, `sendAnnotationBackward(ci, si, id)`.

- [ ] **Step 1: Add the actions to the store interface + impl**

In `lib/store.tsx`, add to the actions interface:

```ts
  bringAnnotationForward: (ci: number, si: number, id: string) => void;
  sendAnnotationBackward: (ci: number, si: number, id: string) => void;
```

and to the store body (near `updateAnnotation`, `:492`):

```ts
  bringAnnotationForward: (ci, si, id) =>
    set((s) => ({ book: M.raiseAnnotation(s.book, ci, si, id) })),
  sendAnnotationBackward: (ci, si, id) =>
    set((s) => ({ book: M.lowerAnnotation(s.book, ci, si, id) })),
```

- [ ] **Step 2: Add forward/back buttons to the popover**

In `AnnotationSelectionPopover.tsx`, read the two actions
(`const bringForward = useEditor((s) => s.bringAnnotationForward)` etc.) and add
two `mini-btn` buttons in `.anno-popover-row`, before the delete button:

```tsx
<button type="button" className="mini-btn" title="Send backward"
  aria-label="Send backward" onClick={() => sendBackward(ci, si, shape.id)}>⤓</button>
<button type="button" className="mini-btn" title="Bring forward"
  aria-label="Bring forward" onClick={() => bringForward(ci, si, shape.id)}>⤒</button>
<span className="ap-div" />
```

- [ ] **Step 3: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/store.tsx components/editor/AnnotationSelectionPopover.tsx
git commit -m "feat: bring-forward / send-backward buttons in the selection popover"
```

**Manual verify:** two overlapping filled boxes; forward/back reorders which paints on top.

---

## Task 4: Fill transparency (render + slider)

**Files:**
- Modify: `lib/annotation-palette.ts` (`rgbaFromHex`)
- Test: `lib/annotation-palette.test.ts`
- Modify: `components/renderer/AnnotationLayer.tsx` (`SurfaceShape`)
- Modify: `components/editor/AnnotationContext.tsx`

**Interfaces:**
- Produces: `rgbaFromHex(hex: string, alpha: number): string` — `#rrggbb` → `rgba(r,g,b,alpha)`; malformed hex returned unchanged.

- [ ] **Step 1: Write the failing test**

In `lib/annotation-palette.test.ts`:

```ts
import { rgbaFromHex } from "./annotation-palette";

describe("rgbaFromHex", () => {
  it("converts a hex + alpha to rgba", () => {
    expect(rgbaFromHex("#1A5FB4", 0.5)).toBe("rgba(26, 95, 180, 0.5)");
  });
  it("passes a malformed hex through unchanged", () => {
    expect(rgbaFromHex("nope", 0.5)).toBe("nope");
  });
  it("handles alpha 0 and 1", () => {
    expect(rgbaFromHex("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
    expect(rgbaFromHex("#ffffff", 0)).toBe("rgba(255, 255, 255, 0)");
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm test -- annotation-palette`
Expected: FAIL — `rgbaFromHex` not exported.

- [ ] **Step 3: Implement `rgbaFromHex`**

In `lib/annotation-palette.ts` (near `mixToWhite`):

```ts
/** `#rrggbb` → `rgba(r,g,b,alpha)`. A malformed hex is returned unchanged. */
export function rgbaFromHex(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm test -- annotation-palette`
Expected: PASS.

- [ ] **Step 5: Apply `fill-opacity` in the renderer**

In `components/renderer/AnnotationLayer.tsx`, `SurfaceShape`, add `fillOpacity={s.fillOpacity ?? 1}` to the `<rect>` (box), `<ellipse>`, and diamond `<path>` fill elements (SVG `fill-opacity` fades only the fill, not stroke or label). For the `text` kind div (`:173-184`), replace `background: s.fill ?? undefined` with:

```tsx
background: s.fill != null ? rgbaFromHex(s.fill, s.fillOpacity ?? 1) : undefined,
```

Import `rgbaFromHex` from `@/lib/annotation-palette`.

- [ ] **Step 6: Add the opacity slider to the context row**

In `components/editor/AnnotationContext.tsx`, in the closed-shape Fill block
(`:169-183`) — when `shape.fill != null` — add a range input:

```tsx
{shape.fill != null ? (
  <label className="anno-num">opacity
    <input type="range" min={0} max={1} step={0.05}
      value={shape.fillOpacity ?? 1}
      onChange={(e) => updateAnnotation(ci, si, shape.id, { fillOpacity: Number(e.target.value) })} />
  </label>
) : null}
```

Do the same in the `text`-kind Fill block (`:282-302`) so text-block fills fade too.

- [ ] **Step 7: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/annotation-palette.ts lib/annotation-palette.test.ts components/renderer/AnnotationLayer.tsx components/editor/AnnotationContext.tsx
git commit -m "feat: annotation fill opacity (slider + fill-opacity render)"
```

**Manual verify:** two overlapping filled boxes; lower the top's opacity and confirm the one beneath shows through — in preview and `/print`.

---

## Task 5: Draggable text labels

**Files:**
- Modify: `lib/book-schema.ts` (`TextLabel.labelOffset?`)
- Modify: `lib/annotations.ts` (`labelAnchor`, `labelRectFor`, `connectorLabelRect`)
- Test: `lib/annotations.test.ts`
- Modify: `components/renderer/AnnotationLayer.tsx` (`ShapeLabel`, `ConnectorLine` label)
- Modify: `components/editor/PreviewAnnotations.tsx` (`TextEditor` rect + label drag handle)

**Interfaces:**
- Produces:
  - `labelAnchor(s: Surface): Point` — `{ x: s.x + s.w/2, y: s.y + s.h/2 }`.
  - `labelRectFor(s: Surface): { x, y, w, h }` — offset masked box when `s.labelOffset`, else `labelRect(s)`.
  - `connectorLabelRect(annotations: Annotation[], c: Connector): { x, y, w, h }` — midpoint + `c.labelOffset`.

- [ ] **Step 1: Add the optional schema field**

In `lib/book-schema.ts`, add to `interface TextLabel` (`:133-142`):

```ts
  /** Normalized offset from the label's default anchor (shape centre / connector
   *  midpoint). Set by dragging the label; renders through the masked free-label
   *  box so no stroke crosses the text. Unset = pinned default. */
  labelOffset?: { x: number; y: number };
```

- [ ] **Step 2: Write the failing tests**

In `lib/annotations.test.ts`:

```ts
import { labelAnchor, labelRectFor, connectorLabelRect, LABEL_W, LABEL_H } from "./annotations";

const box = { id: "b", kind: "box", x: 0.4, y: 0.4, w: 0.2, h: 0.2, stroke: "#000", width: 2 } as const;

describe("labelRectFor", () => {
  it("no offset falls back to labelRect (fills closed-shape bounds)", () => {
    expect(labelRectFor(box)).toEqual({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
  });
  it("with offset returns a fixed masked box centred at anchor+offset", () => {
    const a = labelAnchor(box); // { x: 0.5, y: 0.5 }
    const r = labelRectFor({ ...box, labelOffset: { x: 0.2, y: 0 } });
    expect(r.w).toBe(LABEL_W);
    expect(r.h).toBe(LABEL_H);
    expect(r.x).toBeCloseTo(a.x + 0.2 - LABEL_W / 2);
  });
  it("clamps the offset box inside the page", () => {
    const r = labelRectFor({ ...box, labelOffset: { x: 5, y: 5 } });
    expect(r.x).toBeLessThanOrEqual(1 - LABEL_W);
    expect(r.y).toBeLessThanOrEqual(1 - LABEL_H);
  });
});
```

- [ ] **Step 3: Run to verify FAIL**

Run: `pnpm test -- annotations`
Expected: FAIL — helpers not exported.

- [ ] **Step 4: Implement the helpers**

In `lib/annotations.ts` (near `labelRect`):

```ts
/** Default label anchor: shape centre (open shapes' midpoint is the same). */
export function labelAnchor(s: Surface): Point {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}
/** Label rect honoring an optional offset; offset ⇒ fixed masked box. */
export function labelRectFor(s: Surface): { x: number; y: number; w: number; h: number } {
  if (s.labelOffset) {
    const a = labelAnchor(s);
    return labelRectAt(a.x + s.labelOffset.x, a.y + s.labelOffset.y);
  }
  return labelRect(s);
}
/** Connector label rect: midpoint + optional offset (always a masked box). */
export function connectorLabelRect(annotations: Annotation[], c: Connector): { x: number; y: number; w: number; h: number } {
  const m = connectorMidpoint(annotations, c);
  const o = c.labelOffset ?? { x: 0, y: 0 };
  return labelRectAt(m.x + o.x, m.y + o.y);
}
```

- [ ] **Step 5: Run to verify PASS**

Run: `pnpm test -- annotations`
Expected: PASS.

- [ ] **Step 6: Render through the offset/masked path**

In `components/renderer/AnnotationLayer.tsx`:
- `ShapeLabel`: `rect={labelRectFor(s)}` and `masked={s.kind === "line" || s.kind === "bracket" || s.labelOffset != null}`.
- `ConnectorLine` label block (`:321-330`): `rect={connectorLabelRect(annotations, c)}` (keep `masked`).
- Import `labelRectFor`, `connectorLabelRect`.

- [ ] **Step 7: Editor overlay uses the same rect + add a label drag handle**

In `components/editor/PreviewAnnotations.tsx`:
- In `TextEditor`, compute `r` via `connectorLabelRect(annotations, a)` for connectors and `labelRectFor(a as Surface)` otherwise (replaces the `labelRect`/`labelRectAt` call at `:788-791`).
- When a non-`text` shape (or connector) with non-empty `text` is focused, render a small drag `Handle` at the label rect centre (reuse the existing `Handle` + a `startDrag`-style pointer handler). On drag, set `labelOffset = base + (deltaPx / {W,H})` via `updateAnnotation`; on release within a small radius of `labelAnchor` (e.g. `< 0.03`), clear it (`updateAnnotation(..., { labelOffset: undefined })`). Reuse the pointer-capture pattern already in the file's `startDrag`.

- [ ] **Step 8: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/book-schema.ts lib/annotations.ts lib/annotations.test.ts components/renderer/AnnotationLayer.tsx components/editor/PreviewAnnotations.tsx
git commit -m "feat: draggable annotation text labels via labelOffset"
```

**Manual verify:** drag a box's label off the box — no stroke crosses the text; edit it; `/print` matches; drag back to centre clears the offset (default pinned label returns).

---

## Self-Review

- **Spec coverage:** #2 reorder → Tasks 2–3; #2 opacity → Task 4; #3b label drag → Task 5; ADR-004 gate → Task 1. Covered.
- **Placeholders:** none — real test + impl code in each step; manual-verify steps explicit.
- **Type consistency:** `raiseAnnotation`/`lowerAnnotation`/`reorderAnnotation` names consistent; `bringAnnotationForward`/`sendAnnotationBackward` used identically in store + popover; `rgbaFromHex(hex, alpha)`, `labelRectFor(s)`, `connectorLabelRect(annotations, c)` signatures match their call sites; `fillOpacity`/`labelOffset` field names consistent across schema, render, and controls.

## Execution Handoff

Subagent-driven development; staff-engineer + frontend-developer review per task under karpathy discipline.
