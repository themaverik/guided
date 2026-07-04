# Annotation text labels + text-box frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the text-box annotation an opt-in border + independent background, and let any shape carry a double-click centered text label.

**Architecture:** Reuse every `Surface`'s existing `text`/`color`/`fontSize`/`fontFamily`/`align` (text), `stroke`/`width` (border), and `fill` (background) fields in three roles. A pure `labelRect(s)` helper places labels (closed shapes fill their bounds; open shapes get a box centered on the midpoint). Rendering and the inline `TextEditor` both consume `labelRect`. Additive — no schema change.

**Tech Stack:** Next.js 15 / React 19 / TypeScript; SVG renderer (`<foreignObject>` for text); Zustand; vitest for `lib/**`.

## Global Constraints

- **Additive only:** no `schemaVersion` bump, no migration. Existing books unchanged (their text boxes have no `fill` and `width:0`; no shapes have `text`).
- **Three independent colors on a text box:** text = `color`, border = `stroke`, background = `fill`. The text-box fill is an INDEPENDENT color (own picker), NOT the stroke-paired tint used by closed-shape fill.
- **In-shape text is auto-centered**, never nudged. Closed shapes center in bounds; open shapes (line/bracket) center at the midpoint with the stroke masked by the label pill so text never crosses the shape.
- **Border + fill on the text box are opt-in** (off by default): `width:0` = no border; no `fill` = no background.
- **WYSIWYG:** labels, borders, fills render identically in preview and PDF via the shared `AnnotationLayer` — no `@media print` branch.
- **Editor-only affordances never print**, but the label text/border/fill and the mask are data-driven and DO render in `/print` (intended).
- **Immutability** via `updateAnnotation`. **No new Zustand selector that returns a fresh array/object** (crashes the editor).
- Gates each task: `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run`, `pnpm build` green; no unused imports. LSP "cannot find module / not exported / Next 71007" diagnostics are STALE false alarms — trust the real commands.

---

### Task 1: ADR-004 amendment (docs)

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`

**Interfaces:** Consumes/Produces: nothing (docs).

- [ ] **Step 1: Read the ADR** and its existing amendments (esp. the 2026-07-04 ellipse/fill one) to match heading style.

- [ ] **Step 2: Append a dated amendment** (`## Amendment (2026-07-04): text labels + text-box frame`) recording, in the ADR's style:
  - The **three-role model**: every `Surface` reuses `text`/`color`/`fontSize`/`fontFamily`/`align` (text), `stroke`/`width` (border), `fill` (background). No new fields.
  - **Text-box frame** (Piece A): opt-in border (`width>0`) + independent background (`fill`, its own color, not the stroke-paired tint). Three independent colors.
  - **In-shape labels** (Piece B): double-click any shape to add a `text` label; closed shapes center it in bounds; open shapes (line/bracket) center it at the midpoint via `labelRect`, with the label pill masking the stroke so text never crosses the shape. Auto-centered (no nudge).
  - Additive (no schemaVersion bump / migration).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md
git commit -m "docs: ADR-004 amendment — annotation text labels + text-box frame"
```

---

### Task 2: `labelRect` placement helper (lib, TDD)

**Files:**
- Modify: `lib/annotations.ts` (add `LABEL_W`, `LABEL_H`, `labelRect`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `Surface`.
- Produces: `export const LABEL_W = 0.3`, `LABEL_H = 0.1`; `export function labelRect(s: Surface): { x: number; y: number; w: number; h: number }`.

- [ ] **Step 1: Write the failing tests** — add to `lib/annotations.test.ts`:

```ts
describe("labelRect", () => {
  const base = { id: "s", stroke: "#000", width: 2 };
  it("returns the bounds unchanged for closed shapes", () => {
    for (const kind of ["box", "diamond", "ellipse"] as const) {
      const s = { ...base, kind, x: 0.2, y: 0.2, w: 0.4, h: 0.3 } as Surface;
      expect(labelRect(s)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
    }
  });
  it("centers a box on the midpoint for a line", () => {
    const s = { ...base, kind: "line", x: 0.2, y: 0.4, w: 0.6, h: 0 } as Surface;
    const r = labelRect(s);
    expect(r.w).toBeCloseTo(0.3);
    expect(r.h).toBeCloseTo(0.1);
    expect(r.x + r.w / 2).toBeCloseTo(0.5); // midpoint x
    expect(r.y + r.h / 2).toBeCloseTo(0.4); // midpoint y
  });
  it("centers on the bbox center for a bracket", () => {
    const s = { ...base, kind: "bracket", x: 0.5, y: 0.3, w: 0.05, h: 0.4 } as Surface;
    const r = labelRect(s);
    expect(r.x + r.w / 2).toBeCloseTo(0.525);
    expect(r.y + r.h / 2).toBeCloseTo(0.5);
  });
  it("clamps the label box inside [0,1]", () => {
    const s = { ...base, kind: "line", x: 0.9, y: 0.0, w: 0.1, h: 0 } as Surface;
    const r = labelRect(s); // midpoint 0.95,0 → clamp
    expect(r.x).toBeCloseTo(0.7); // 1 - LABEL_W
    expect(r.y).toBeCloseTo(0);
  });
});
```

Add `labelRect`, `LABEL_W`, `LABEL_H` to the `@/lib/annotations` import at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: FAIL — `labelRect` not exported.

- [ ] **Step 3: Implement `labelRect`** — add to `lib/annotations.ts` (near `anchorPoint`):

```ts
/** Normalized default box for an open-shape (line/bracket) text label. */
export const LABEL_W = 0.3;
export const LABEL_H = 0.1;

/** The normalized rect an in-shape text label occupies. Closed shapes fill their
 *  bounds; open shapes (line/bracket) get a fixed box centered on the midpoint,
 *  clamped inside the page. */
export function labelRect(s: Surface): { x: number; y: number; w: number; h: number } {
  if (s.kind === "line" || s.kind === "bracket") {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const clamp = (v: number, size: number) => Math.max(0, Math.min(1 - size, v));
    return {
      x: clamp(cx - LABEL_W / 2, LABEL_W),
      y: clamp(cy - LABEL_H / 2, LABEL_H),
      w: LABEL_W,
      h: LABEL_H,
    };
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run lib/annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: labelRect helper for in-shape text label placement"
```

---

### Task 3: Text-box frame — border + independent fill (Piece A)

Render border/fill on the text box and add the controls. No unit tests (component render).

**Files:**
- Modify: `components/renderer/AnnotationLayer.tsx` (the `kind:"text"` case)
- Modify: `components/editor/AnnotationContext.tsx` (the `shape.kind === "text"` branch)

**Interfaces:** Consumes existing `Surface` fields; produces no new exports.

- [ ] **Step 1: Render border + fill on the text box**

In `AnnotationLayer.tsx`, the `kind:"text"` `<div className="anno-text">` style object — add three properties after `textAlign`:

```tsx
            background: s.fill ?? undefined,
            border: s.width ? `${s.width}px solid ${s.stroke}` : undefined,
            padding: s.fill != null || s.width ? "2px 4px" : undefined,
```

(`.anno-text` is already `box-sizing:border-box; width/height:100%`, so border + padding fit the bounds. Existing boxes have `width:0` and no `fill` → unchanged.)

- [ ] **Step 2: Add the frame controls**

In `AnnotationContext.tsx`, inside the `shape.kind === "text"` branch, after the existing `.anno-text-ctrls` row, add a frame row:

```tsx
        <div className="anno-context-row">
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={(shape.width ?? 0) > 0}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, { width: e.target.checked ? 2 : 0 })
              }
            />
            Border
          </label>
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={shape.fill != null}
              onChange={(e) =>
                updateAnnotation(ci, si, shape.id, {
                  fill: e.target.checked ? "#ffffff" : undefined,
                })
              }
            />
            Fill
          </label>
          {shape.fill != null ? (
            <input
              type="color"
              value={shape.fill}
              onChange={(e) => updateAnnotation(ci, si, shape.id, { fill: e.target.value })}
              title="Fill (background) color"
              aria-label="Fill color"
            />
          ) : null}
        </div>
```

(The top-row color input already sets `stroke` = border color and the width input sets `width` = border width. The text row's color input is the text color. So text/border/background are three independent colors.)

- [ ] **Step 3: Gates + manual verification**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`

Manual (`pnpm dev`): select a text box → Border toggle draws an outline in the top-row color; Fill toggle adds a background in the independently-chosen fill color; the text color stays separate. Existing text boxes still render plain. Export PDF → frame renders.

- [ ] **Step 4: Commit**

```bash
git add components/renderer/AnnotationLayer.tsx components/editor/AnnotationContext.tsx
git commit -m "feat: opt-in border + independent background for the text box"
```

---

### Task 4: In-shape label rendering (Piece B — render)

Render a shape's `text` as a centered label (closed) or a masked midpoint pill (open). No unit tests (component render).

**Files:**
- Modify: `components/renderer/AnnotationLayer.tsx` (`SurfaceShape` — add a `ShapeLabel` + wrap non-text kinds)
- Modify: `components/renderer/renderer.css` (add `.anno-shape-label`)

**Interfaces:** Consumes `labelRect` (Task 2), `FONT_STACKS`, `pct`.

- [ ] **Step 1: Add the `ShapeLabel` helper + import `labelRect`**

In `AnnotationLayer.tsx`, add `labelRect` to the `@/lib/annotations` import. Add above `SurfaceShape`:

```tsx
/** A centered text label for a shape (box/diamond/ellipse fill their bounds; open
 *  shapes get a midpoint pill that masks the stroke). Renders nothing when empty. */
function ShapeLabel({ s }: { s: Surface }) {
  if (!s.text || !s.text.trim()) return null;
  const r = labelRect(s);
  const open = s.kind === "line" || s.kind === "bracket";
  const justify =
    s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  return (
    <foreignObject
      x={pct(r.x)}
      y={pct(r.y)}
      width={pct(r.w)}
      height={pct(r.h)}
      overflow="visible"
    >
      <div
        className={`anno-shape-label${open ? " masked" : ""}`}
        style={{ justifyContent: justify }}
      >
        <span
          style={{
            fontFamily: FONT_STACKS[s.fontFamily ?? "sans"],
            fontSize: s.fontSize ?? 16,
            color: s.color ?? s.stroke,
            textAlign: s.align ?? "center",
          }}
        >
          {s.text}
        </span>
      </div>
    </foreignObject>
  );
}
```

- [ ] **Step 2: Wrap non-text shape returns with the label**

In `SurfaceShape`, add a small wrapper and apply it to every non-text `return` (box, line, diamond, ellipse, bracket) so the label overlays the shape:

```tsx
  const withLabel = (el: React.ReactNode) =>
    s.text && s.text.trim() ? (
      <g>
        {el}
        <ShapeLabel s={s} />
      </g>
    ) : (
      el
    );
```

Change each non-text branch's `return <X .../>;` to `return withLabel(<X .../>);` (box, line, diamond, ellipse, and the bracket `<g>` at the end). Leave the `kind:"text"` branch as-is (the text box is its own text; Task 3 handles its frame).

- [ ] **Step 3: Add `.anno-shape-label` CSS**

In `components/renderer/renderer.css`, near `.anno-text`:

```css
.anno-shape-label {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  line-height: 1.2;
  overflow: hidden;
}
.anno-shape-label > span {
  display: inline-block;
  max-width: 100%;
  overflow-wrap: break-word;
}
/* Open-shape (line/bracket) label: an opaque pill that masks the stroke beneath. */
.anno-shape-label.masked > span {
  background: #ffffff;
  padding: 1px 5px;
  border-radius: 3px;
}
```

- [ ] **Step 4: Gates + manual verification**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`

Manual (`pnpm dev`): set a box/diamond/ellipse's `text` (via the editor in Task 5, or a temp `book.json`) → text centers in the shape; a line/bracket with `text` → a pill at the midpoint masks the stroke so text doesn't cross. Export PDF → labels render identically.

- [ ] **Step 5: Commit**

```bash
git add components/renderer/AnnotationLayer.tsx components/renderer/renderer.css
git commit -m "feat: render in-shape centered labels (closed) + masked midpoint labels (open)"
```

---

### Task 5: In-shape label editing + controls (Piece B — edit)

Double-click any shape to edit its label; show text controls for a shape that has one. No unit tests (component/store wiring — **run the app**).

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx` (`editTarget` gate; double-click on hit regions; `TextEditor` via `labelRect`)
- Modify: `components/editor/AnnotationContext.tsx` (show text controls when a shape has a label)

**Interfaces:** Consumes `labelRect` (Task 2).

- [ ] **Step 1: Widen the `editTarget` gate**

In `PreviewAnnotations.tsx`, `editTarget` currently is:
`surfaces.find((s) => s.id === editingId && s.kind === "text") ?? null;`
Change to (surfaces is already connector-free):
```tsx
  const editTarget = surfaces.find((s) => s.id === editingId) ?? null;
```

- [ ] **Step 2: Double-click any shape starts label editing**

Add a shared handler near the hit-region map:
```tsx
  const startTextEdit = (id: string) => {
    selectAnnotation(id);
    setEditingId(id);
  };
```
Add `onDoubleClick={() => startTextEdit(a.id)}` to each shape hit-region element (box, ellipse, diamond, line, bracket). For the existing text hit region, replace its inline `onDoubleClick` body with `startTextEdit(a.id)` (keeping `e.stopPropagation()`).

- [ ] **Step 3: Position the `TextEditor` at `labelRect`**

Import `labelRect` in `PreviewAnnotations.tsx`. In `TextEditor`, compute the rect and use it for the foreignObject, and center the editing div for non-text kinds:

```tsx
  const r = labelRect(s);
  const centered = s.kind !== "text";
  ...
    <foreignObject x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} overflow="visible">
      <div
        ref={ref}
        className={`anno-text editing${centered ? " centered" : ""}`}
        ...
        style={{
          fontFamily: FONT_STACKS[s.fontFamily ?? "sans"],
          fontSize: s.fontSize ?? 16,
          color: s.color ?? s.stroke,
          textAlign: s.align ?? (centered ? "center" : "left"),
        }}
```

Add to `components/editor/editor.css`:
```css
.anno-text.editing.centered {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: Show text controls for a shape with a label**

In `AnnotationContext.tsx`, the text-controls block is currently gated `shape.kind === "text"`. Change that condition to (narrow past `Connector`, which has no `text`):
```tsx
      {shape.kind === "text" || (shape.kind !== "connector" && shape.text != null) ? (
```
so a shape that has a label exposes size/font/align/text-color. (The frame row added in Task 3 stays gated to `shape.kind === "text"` only.)

**Note for the implementer:** inside that widened block, the existing text controls read `shape.fontSize`/`shape.fontFamily`/`shape.align`/`shape.color`. Those are `Surface`-only fields; the `shape.kind === "text" || (shape.kind !== "connector" && ...)` guard narrows `shape` to `Surface` in the consequent, so the reads type-check. If TypeScript still widens `shape` to `Annotation` inside the JSX, add a `const surf = shape as Surface;` alias at the top of the block and read from `surf`. Verify with `pnpm typecheck`.

- [ ] **Step 5: Gates + manual verification (run the app)**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`

Manual (`pnpm dev` — required, store/editor change):
- Double-click a rectangle / circle / diamond → type → text centers; the text controls appear in the context row.
- Double-click a line / bracket → the inline editor sits at the midpoint; typed text renders as a pill masking the stroke.
- Change font/size/align/color → label updates. Clear the text → label disappears.
- No console crash selecting/deselecting shapes (no fresh-array selector added).
- Export PDF → labels render identically to the canvas.

- [ ] **Step 6: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/AnnotationContext.tsx components/editor/editor.css
git commit -m "feat: double-click shapes to add centered text labels; show text controls"
```

---

## Self-Review (completed)

- **Spec coverage:** three-role model (all tasks), text-box frame render+controls (T3), `labelRect` (T2), in-shape render closed+open/masked (T4), editing + controls (T5), ADR (T1), tests (T2). All spec sections mapped.
- **Placeholder scan:** none — every step has concrete code.
- **Type consistency:** `labelRect` defined in T2 before use in T4/T5; `withLabel`/`ShapeLabel` consume `labelRect`; `editTarget` widening keeps `surfaces` connector-free so the found surface is always a `Surface`; `shape.text != null` / `shape.fill != null` accesses are on `Surface`-narrowed branches (the text/frame controls live inside `shape.kind` checks or after the connector `c` handling). No new Zustand selector introduced (only handlers + reads of `shape` props).

## Execution note

Order respects dependencies: T1 (ADR) → T2 (`labelRect`) → T3 (text-box frame, independent) → T4 (in-shape render, needs `labelRect`) → T5 (editing, needs `labelRect` + T4's render for WYSIWYG). T3 is independent of T2/T4.
