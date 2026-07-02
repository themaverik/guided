# Floating Annotation Palette — SP1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move annotation creation off the left panel onto a floating bottom-center tool palette over the page canvas, where shapes are drawn directly on the page (drag-to-size), colored by a single current-color control.

**Architecture:** A pure `boundsFromDrag` helper in `lib/annotations.ts`; transient `activeTool` + `drawColor` state in the Zustand store; a new `AnnotationPalette` bar mounted over the preview viewport; a `useAnnotationDraw` hook that adds a draw branch to the existing `PreviewAnnotations` SVG overlay (reusing its screen→normalized pointer mapping). Editor-only — no `Book` schema change, no renderer/print change.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (unit), manual/in-browser (visual).

## Global Constraints

- **Editor-only:** all changes in the store, `PreviewAnnotations.tsx`, a new hook, a new palette component, `AnnotationEditor.tsx`, `PreviewPane.tsx`, `editor.css`, and a pure helper. The renderer (`components/renderer/**`) and print path are **untouched**; nothing new renders in `/print`.
- **No `Book` schema change** — `activeTool`/`drawColor` are transient editor state, never persisted. No `CURRENT_SCHEMA_VERSION` bump, no migration.
- **Create gesture = drag-to-size:** box/diamond/text/bracket rubber-band to bounds; line/connector drag start→end. Direction-agnostic (up-left drag == down-right drag) for rubber-band kinds.
- **One-shot tools:** after a shape is created, `activeTool` reverts to `"select"` and the new shape is selected.
- **Color is plain-hex** (today's model); the full OKLCH swatch palette is a separate next item — do NOT build it here.
- **Keep** the left-panel per-shape property cards; only the six `+ Shape` add-buttons are removed.
- Immutable store updates via existing mutations. Commit type `feat` for code, `docs` for ADR/ROADMAP. **No AI attribution** in commit messages. **Do not `git push`.**
- Pre-existing `lib/use-auto-fit.ts` lint warning is acceptable; introduce no new warnings.

---

### Task 1: Pure `boundsFromDrag` helper

**Files:**
- Modify: `lib/annotations.ts` (add `DrawKind` type + `boundsFromDrag`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Produces:
  - `type DrawKind = "box" | "diamond" | "text" | "bracket" | "line"`
  - `function boundsFromDrag(start: Point, end: Point, kind: DrawKind): { x: number; y: number; w: number; h: number }` — normalizes a drag into shape geometry. Rubber-band kinds (`box`/`diamond`/`text`/`bracket`) return a min/max rect (direction-agnostic); `line` returns a **signed** vector (`w`/`h` may be negative) anchored at `start`. A sub-floor drag / bare click returns a per-kind default size anchored at `start`.

- [ ] **Step 1: Write the failing tests**

In `lib/annotations.test.ts`, add `boundsFromDrag` to the existing `@/lib/annotations` import, then add:

```ts
describe("boundsFromDrag", () => {
  it("normalizes a down-right rubber-band drag to a rect", () => {
    const b = boundsFromDrag({ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.6 }, "box");
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.3);
    expect(b.h).toBeCloseTo(0.4);
  });
  it("gives the same rect for an up-left drag (direction-agnostic)", () => {
    const b = boundsFromDrag({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.2 }, "box");
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.3);
    expect(b.h).toBeCloseTo(0.4);
  });
  it("returns a per-kind default for a sub-floor drag / bare click", () => {
    const b = boundsFromDrag({ x: 0.4, y: 0.4 }, { x: 0.404, y: 0.403 }, "box");
    expect(b).toEqual({ x: 0.4, y: 0.4, w: 0.4, h: 0.3 });
  });
  it("keeps a signed vector for a line", () => {
    const b = boundsFromDrag({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, "line");
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.5);
    expect(b.w).toBeCloseTo(0.6);
    expect(b.h).toBeCloseTo(0);
  });
  it("preserves a negative line vector (drawn right→left)", () => {
    const b = boundsFromDrag({ x: 0.8, y: 0.5 }, { x: 0.2, y: 0.5 }, "line");
    expect(b.w).toBeCloseTo(-0.6);
  });
  it("returns the line default for a bare click", () => {
    const b = boundsFromDrag({ x: 0.3, y: 0.5 }, { x: 0.305, y: 0.5 }, "line");
    expect(b).toEqual({ x: 0.3, y: 0.5, w: 0.4, h: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "boundsFromDrag"`
Expected: FAIL — `boundsFromDrag is not a function`.

- [ ] **Step 3: Implement `DrawKind` + `boundsFromDrag`**

In `lib/annotations.ts`, near the other pure geometry helpers (e.g. after `compassDir`), add:

```ts
/** Surface kinds that are created by a rubber-band / signed-vector drag. */
export type DrawKind = "box" | "diamond" | "text" | "bracket" | "line";

/** Minimum normalized extent below which a drag is treated as a bare click. */
const MIN_DRAW = 0.015;

/** Per-kind default size (normalized) used for a bare click, mirroring newSurface. */
const DRAW_DEFAULTS: Record<DrawKind, { w: number; h: number }> = {
  box: { w: 0.4, h: 0.3 },
  diamond: { w: 0.3, h: 0.3 },
  text: { w: 0.3, h: 0.1 },
  bracket: { w: 0.05, h: 0.4 },
  line: { w: 0.4, h: 0 },
};

/** Turn a press→release drag into shape geometry (normalized 0–1). Rubber-band
 *  kinds return a direction-agnostic min/max rect; `line` keeps a signed vector
 *  anchored at `start`. A sub-floor drag / bare click yields the kind's default
 *  size anchored at `start`. */
export function boundsFromDrag(
  start: Point,
  end: Point,
  kind: DrawKind,
): { x: number; y: number; w: number; h: number } {
  if (kind === "line") {
    const w = end.x - start.x;
    const h = end.y - start.y;
    if (Math.abs(w) < MIN_DRAW && Math.abs(h) < MIN_DRAW) {
      return { x: start.x, y: start.y, ...DRAW_DEFAULTS.line };
    }
    return { x: start.x, y: start.y, w, h };
  }
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < MIN_DRAW && h < MIN_DRAW) {
    return { x: start.x, y: start.y, ...DRAW_DEFAULTS[kind] };
  }
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h };
}
```

(`Point` is already defined/exported in `lib/annotations.ts`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "boundsFromDrag"`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: boundsFromDrag — normalize a draw drag into shape geometry"
```

---

### Task 2: Store — `activeTool` + `drawColor` state

**Files:**
- Modify: `lib/book-mutations.ts:334` (export `ANNO_STROKE`)
- Modify: `lib/store.tsx` (type fields, initial state, actions)

**Interfaces:**
- Consumes: `ANNO_STROKE` (now exported).
- Produces:
  - `export type AnnotationTool = "select" | "box" | "line" | "bracket" | "diamond" | "text" | "connector"`
  - store state `activeTool: AnnotationTool` (default `"select"`), `drawColor: string` (default `ANNO_STROKE`)
  - store actions `setActiveTool(tool: AnnotationTool): void`, `setDrawColor(color: string): void`

- [ ] **Step 1: Export `ANNO_STROKE`**

In `lib/book-mutations.ts`, change line 334 from:

```ts
const ANNO_STROKE = "#658995";
```

to:

```ts
export const ANNO_STROKE = "#658995";
```

- [ ] **Step 2: Add the `AnnotationTool` type + state fields to the store interface**

In `lib/store.tsx`, the mutations are imported as `import * as M from "@/lib/book-mutations";`. Add a separate named import beside it:

```ts
import { ANNO_STROKE } from "@/lib/book-mutations";
```

Above `export interface EditorState {` add:

```ts
export type AnnotationTool =
  | "select"
  | "box"
  | "line"
  | "bracket"
  | "diamond"
  | "text"
  | "connector";
```

Inside `EditorState`, after the `hideGridChrome: boolean;` field (line 59), add:

```ts
  /** Transient: the active annotation tool (drives on-canvas drawing). */
  activeTool: AnnotationTool;
  /** Transient: stroke color applied to newly-drawn shapes. */
  drawColor: string;
```

In the actions section, after `selectAnnotation: (id: string | null) => void;` (line 169), add:

```ts
  setActiveTool: (tool: AnnotationTool) => void;
  setDrawColor: (color: string) => void;
```

- [ ] **Step 3: Add the initial state + actions**

In `createEditorStore` (line 206+), after `hideGridChrome: false,` (line 217) add:

```ts
    activeTool: "select",
    drawColor: ANNO_STROKE,
```

After the `selectAnnotation: (id) => set({ selectedAnnotation: id }),` line (line 455) add:

```ts
    setActiveTool: (tool) => set({ activeTool: tool }),
    setDrawColor: (color) => set({ drawColor: color }),
```

- [ ] **Step 4: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/book-mutations.ts lib/store.tsx
git commit -m "feat: activeTool + drawColor editor state for the annotation palette"
```

---

### Task 3: `AnnotationPalette` component + mount + styles

**Files:**
- Create: `components/editor/AnnotationPalette.tsx`
- Modify: `components/editor/PreviewPane.tsx` (import + mount)
- Modify: `components/editor/editor.css` (`.editor-right` position; `.annotation-palette` styles)

**Interfaces:**
- Consumes: store `activeTool`/`setActiveTool`/`drawColor`/`setDrawColor`/`selectedAnnotation`/`updateAnnotation` (Task 2); `AnnotationTool`.
- Produces: `export default function AnnotationPalette({ ci, si }: { ci: number; si: number })`.

- [ ] **Step 1: Create the palette component**

Create `components/editor/AnnotationPalette.tsx`:

```tsx
"use client";

/*
 * Floating tool palette over the page canvas (SP1). Sets the active annotation
 * tool for on-canvas drawing and the current draw color. Editor-only; nothing
 * here persists to the Book. The per-shape numeric properties still live in the
 * left panel (AnnotationEditor) until a later slice.
 */
import { useEffect } from "react";
import { useEditor, type AnnotationTool } from "@/lib/store";

const TOOLS: { tool: AnnotationTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", icon: <path d="M3 2l8 4-3 1-1 3-4-8z" /> },
  { tool: "box", label: "Box", icon: <rect x="2.5" y="3.5" width="9" height="7" rx="1" /> },
  { tool: "line", label: "Line", icon: <line x1="3" y1="11" x2="11" y2="3" /> },
  { tool: "bracket", label: "Bracket", icon: <path d="M9 2H5v10h4" /> },
  { tool: "diamond", label: "Diamond", icon: <path d="M7 2l5 5-5 5-5-5z" /> },
  { tool: "text", label: "Text", icon: <path d="M3 3h8M7 3v9" /> },
  { tool: "connector", label: "Connector", icon: <path d="M3 3v6h6M7 9l2 0 0-2" /> },
];

const PRESETS = ["#658995", "#024450", "#d64545", "#e08a00", "#2e7d46", "#2f6df6"];

export default function AnnotationPalette({ ci, si }: { ci: number; si: number }) {
  const activeTool = useEditor((s) => s.activeTool);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const drawColor = useEditor((s) => s.drawColor);
  const setDrawColor = useEditor((s) => s.setDrawColor);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);

  // Switching steps starts fresh on Select.
  useEffect(() => {
    setActiveTool("select");
  }, [ci, si, setActiveTool]);

  const applyColor = (c: string) => {
    setDrawColor(c);
    if (selectedAnnotation) updateAnnotation(ci, si, selectedAnnotation, { stroke: c });
  };

  return (
    <div className="annotation-palette" role="toolbar" aria-label="Annotation tools">
      {TOOLS.map(({ tool, label, icon }) => (
        <button
          key={tool}
          type="button"
          className={`ap-tool${activeTool === tool ? " active" : ""}`}
          aria-pressed={activeTool === tool}
          title={label}
          onClick={() => setActiveTool(tool)}
        >
          <svg viewBox="0 0 14 14" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            {icon}
          </svg>
        </button>
      ))}
      <span className="ap-div" />
      <label className="ap-color" title="Draw color">
        <span className="ap-chip" style={{ background: drawColor }} />
        <input
          type="color"
          value={drawColor}
          onChange={(e) => applyColor(e.target.value)}
          aria-label="Pick draw color"
        />
      </label>
      {PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          className={`ap-swatch${drawColor === c ? " active" : ""}`}
          style={{ background: c }}
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => applyColor(c)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount the palette in `PreviewPane`**

In `components/editor/PreviewPane.tsx`, add the import after the other editor imports (near line 20):

```tsx
import AnnotationPalette from "./AnnotationPalette";
```

Then, inside the `.editor-right` container, immediately **after** the closing `</div>` of `.preview-scroll` (after line 256, before the closing `</div>` of `.editor-right`), add:

```tsx
      {selection.stepIndex != null ? (
        <AnnotationPalette ci={selection.chapterIndex} si={selection.stepIndex} />
      ) : null}
```

- [ ] **Step 3: Add the palette styles**

In `components/editor/editor.css`, change the `.editor-right` rule (lines 160–166) to add positioning context — add this line inside the block:

```css
  position: relative;
```

Then, after the `.preview-anno-dir-stem` rule (ends ~line 692), add:

```css
/* Floating annotation tool palette (SP1) — over the preview viewport. */
.annotation-palette {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #d7dede;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(2, 68, 80, 0.18);
}
.ap-tool {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: #f2f4f4;
  color: #024450;
  cursor: pointer;
}
.ap-tool:hover {
  background: #e6ecec;
}
.ap-tool.active {
  background: #024450;
  color: #fff;
}
.ap-div {
  width: 1px;
  height: 26px;
  background: #dbe3e3;
  margin: 0 2px;
}
.ap-color {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  display: inline-flex;
}
.ap-color .ap-chip {
  position: absolute;
  inset: 6px;
  border-radius: 6px;
  box-shadow: 0 0 0 1.5px #cdd6d6 inset;
}
.ap-color input[type="color"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
.ap-swatch {
  width: 24px;
  height: 24px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px #cdd6d6;
  cursor: pointer;
  padding: 0;
}
.ap-swatch.active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #024450;
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: In-browser sanity check**

Start `pnpm dev`. Select a step. Confirm the bar floats at the bottom-center of the preview and stays put while scrolling. Click tool buttons → the active one highlights. With an existing shape selected (create one via the still-present left-panel `+ Box`), click a preset / the color chip → the shape's stroke recolors and the chip updates. (Drawing is wired in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add components/editor/AnnotationPalette.tsx components/editor/PreviewPane.tsx components/editor/editor.css
git commit -m "feat: floating annotation tool palette over the preview canvas"
```

---

### Task 4: `useAnnotationDraw` hook + on-canvas drawing

**Files:**
- Create: `components/editor/use-annotation-draw.ts`
- Modify: `components/editor/PreviewAnnotations.tsx`
- Modify: `components/editor/editor.css` (`.preview-anno-draft` style)

**Interfaces:**
- Consumes: `boundsFromDrag`/`DrawKind`/`Point` (Task 1); store `activeTool`/`drawColor`/`addAnnotation`/`selectAnnotation`/`setActiveTool` (Task 2); `newSurface`/`newConnector`; `Annotation`.
- Produces: `export function useAnnotationDraw(ci: number, si: number)` returning `{ activeTool, preview, drawing, begin, move, end }` where `preview` is a `DrawPreview | null` and `begin(p)`/`move(p)`/`end(p)` take a normalized `Point`; `drawing()` returns whether a draw is in progress.

- [ ] **Step 1: Create the draw hook**

Create `components/editor/use-annotation-draw.ts`:

```ts
"use client";

/*
 * On-canvas annotation drawing (SP1). Turns a press→drag→release on the page
 * into a new shape, driven by the store's activeTool + drawColor. Pure geometry
 * lives in lib/annotations (boundsFromDrag); this hook owns the transient draw
 * state and commits the finished shape via addAnnotation. Editor-only.
 */
import { useEffect, useRef, useState } from "react";
import type { Annotation } from "@/lib/book-schema";
import type { Point } from "@/lib/annotations";
import { boundsFromDrag } from "@/lib/annotations";
import { newConnector, newSurface } from "@/lib/book-mutations";
import { useEditor, type AnnotationTool } from "@/lib/store";

export type DrawPreview =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

function previewFor(tool: AnnotationTool, a: Point, b: Point): DrawPreview | null {
  if (tool === "select") return null;
  if (tool === "connector") return { kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const bd = boundsFromDrag(a, b, tool);
  if (tool === "line") return { kind: "line", x1: bd.x, y1: bd.y, x2: bd.x + bd.w, y2: bd.y + bd.h };
  return { kind: "rect", x: bd.x, y: bd.y, w: bd.w, h: bd.h };
}

function buildShape(
  tool: AnnotationTool,
  a: Point,
  b: Point,
  color: string,
): Annotation | null {
  if (tool === "select") return null;
  if (tool === "connector") {
    const nc = newConnector();
    return {
      ...nc,
      from: { ...nc.from, x: a.x, y: a.y },
      to: { ...nc.to, x: b.x, y: b.y },
      stroke: color,
    };
  }
  const bd = boundsFromDrag(a, b, tool);
  const s = newSurface(tool);
  // For text the visible color is `color`; every other surface uses `stroke`.
  if (tool === "text") return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, color };
  return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, stroke: color };
}

export function useAnnotationDraw(ci: number, si: number) {
  const activeTool = useEditor((s) => s.activeTool);
  const drawColor = useEditor((s) => s.drawColor);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const start = useRef<Point | null>(null);
  const [preview, setPreview] = useState<DrawPreview | null>(null);

  // Escape cancels an in-progress draw and returns to Select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      start.current = null;
      setPreview(null);
      setActiveTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveTool]);

  const begin = (p: Point): boolean => {
    if (activeTool === "select") return false;
    start.current = p;
    setPreview(previewFor(activeTool, p, p));
    return true;
  };
  const move = (p: Point) => {
    if (!start.current) return;
    setPreview(previewFor(activeTool, start.current, p));
  };
  const end = (p: Point) => {
    const s0 = start.current;
    start.current = null;
    setPreview(null);
    if (!s0) return;
    const ann = buildShape(activeTool, s0, p, drawColor);
    if (ann) {
      addAnnotation(ci, si, ann);
      selectAnnotation(ann.id);
    }
    setActiveTool("select");
  };

  return {
    activeTool,
    preview,
    drawing: () => start.current != null,
    begin,
    move,
    end,
  };
}
```

- [ ] **Step 2: Wire the hook into `PreviewAnnotations`**

In `components/editor/PreviewAnnotations.tsx`:

Add the import after the existing `./` / `@/lib` imports (near line 37):

```ts
import { useAnnotationDraw } from "./use-annotation-draw";
```

Immediately after `const svgRef = useRef<SVGSVGElement>(null);` (line 120) add:

```ts
  const draw = useAnnotationDraw(ci, si);
```

- [ ] **Step 3: Route pointer events to the draw hook**

Still in `PreviewAnnotations.tsx`, at the **top** of `onMove` (line 336), before `if (!drag.current) return;`, add:

```ts
    if (draw.drawing()) {
      draw.move(toN(e));
      return;
    }
```

At the **top** of `onUp` (line 345), before `drag.current = null;`, add:

```ts
    if (draw.drawing()) {
      draw.end(toN(e));
      svgRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
```

Replace the SVG's existing `onPointerDown` handler (lines 377–380) with:

```tsx
      onPointerDown={(e) => {
        if (draw.activeTool !== "select" && e.target === svgRef.current) {
          e.preventDefault();
          if (draw.begin(toN(e))) svgRef.current?.setPointerCapture(e.pointerId);
          return;
        }
        // Click on empty canvas (the SVG itself, not a shape) clears focus.
        if (e.target === svgRef.current) selectAnnotation(null);
      }}
```

- [ ] **Step 4: Enable pointer capture + crosshair while a tool is active**

In the SVG `style` object (lines 367–372), replace the `pointerEvents` line and add a `cursor` line so it reads:

```tsx
      style={{
        position: "absolute",
        left: rect.l,
        top: rect.t,
        pointerEvents: gridMode && draw.activeTool === "select" ? "none" : undefined,
        cursor: draw.activeTool !== "select" ? "crosshair" : undefined,
      }}
```

- [ ] **Step 5: Render the live draft preview**

In the SVG children, immediately after the `activeGuides.map(...)` block (ends ~line 388), add:

```tsx
      {draw.preview ? (
        draw.preview.kind === "rect" ? (
          <rect
            x={draw.preview.x * W}
            y={draw.preview.y * H}
            width={draw.preview.w * W}
            height={draw.preview.h * H}
            className="preview-anno-draft"
          />
        ) : (
          <line
            x1={draw.preview.x1 * W}
            y1={draw.preview.y1 * H}
            x2={draw.preview.x2 * W}
            y2={draw.preview.y2 * H}
            className="preview-anno-draft"
          />
        )
      ) : null}
```

- [ ] **Step 6: Add the draft style**

In `components/editor/editor.css`, after the `.annotation-palette` block from Task 3 (or near `.preview-anno-guide`), add:

```css
.preview-anno-draft {
  fill: rgba(2, 68, 80, 0.06);
  stroke: #024450;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  pointer-events: none;
}
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors (no unused imports).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 8: In-browser verification**

Start `pnpm dev`. Select a step. From the palette pick **Box** → drag on the page → a dashed preview follows the drag and, on release, a box in the current color appears and is selected, and the tool reverts to **Select**. Repeat for Diamond, Text, Bracket (rubber-band, any drag direction) and Line / Connector (start→end). Confirm a bare click drops a default-sized shape. Press a tool then **Esc** → back to Select. On a **grid** step, confirm you can draw over cells. Open `/print` → shapes render, no palette/handles/preview.

- [ ] **Step 9: Commit**

```bash
git add components/editor/use-annotation-draw.ts components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "feat: on-canvas drag-to-size annotation drawing"
```

---

### Task 5: Remove the left-panel add-buttons

**Files:**
- Modify: `components/editor/AnnotationEditor.tsx`

**Interfaces:**
- Consumes: nothing new. Removes now-dead creation UI; the per-shape property cards stay.

- [ ] **Step 1: Remove the toolbar + unused bindings, update the hint**

In `components/editor/AnnotationEditor.tsx`:

- Delete the import on line 19: `import { newConnector, newSurface } from "@/lib/book-mutations";`
- Delete the `addAnnotation` binding on line 76: `const addAnnotation = useEditor((s) => s.addAnnotation);`
- Delete the entire `.anno-toolbar` block (lines 215–234).
- Replace the hint text (lines 211–214) with:

```tsx
      <p className="anno-hint">
        Pick a tool from the palette on the canvas and draw directly on the page.
        Snap a connector end to a box/line/bracket to anchor it.
      </p>
```

- [ ] **Step 2: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors, no unused-variable warnings for `addAnnotation` / `newSurface` / `newConnector`.

- [ ] **Step 3: In-browser check**

Start `pnpm dev`. The left panel no longer shows the six `+ Shape` buttons; the hint points to the palette; existing shapes still list with their property cards, and editing a card still works.

- [ ] **Step 4: Commit**

```bash
git add components/editor/AnnotationEditor.tsx
git commit -m "feat: remove left-panel annotation add-buttons (creation moved to palette)"
```

---

### Task 6: ADR-004 amendment, ROADMAP, full verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–5. No code.

- [ ] **Step 1: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green (pre-existing `use-auto-fit.ts` warning only).

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-02): floating annotation palette — SP1 (palette + on-canvas creation)

First slice of the hybrid inspector (`DESIGN.md` §7 / `PRD.md` P0). Annotation
creation moves off the left panel onto a floating bottom-center tool palette over
the page canvas; shapes are drawn directly on the page.

- **Transient store state:** `activeTool` (`select | box | line | bracket | diamond |
  text | connector`) + `drawColor` — editor-only, never persisted (no schema change).
- **`AnnotationPalette.tsx`:** floating bar, fixed to the preview viewport; tool
  buttons + one plain-hex current-color control (chip + presets + picker). The full
  OKLCH swatch palette is the next slice; this control is its swap-in point.
- **On-canvas drawing (`useAnnotationDraw` + `PreviewAnnotations.tsx`):** press→drag→
  release creates a shape via the pure `boundsFromDrag` helper (`lib/annotations.ts`) —
  rubber-band for box/diamond/text/bracket, signed start→end for line/connector; a
  bare click drops a default-sized shape. One-shot tools (revert to Select + select
  the new shape); `Esc` cancels. In grid mode the overlay captures pointer events only
  while a tool is active, else it stays `pointer-events:none` for the grid overlays.
- **Editor-only:** renderer + `/print` untouched; the palette/preview/handles never
  render in export. The left-panel per-shape property cards remain (trimming them is a
  later slice); only the six add-buttons were removed.
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, under **Backlog / next up**, update the **Floating annotation palette** item: mark SP1 (floating tool palette + on-canvas drag-to-size creation + current-color control) **done** on `feat/floating-annotation-palette`; note the remaining slices — **SP2** (selection popover) and **SP3** (left-panel cleanup) — and that the **full OKLCH swatch palette is the immediate next item**.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 floating palette SP1 amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- Bottom-center floating bar, tools + current-color control → Task 3.
- `activeTool`/`drawColor` transient store state → Task 2.
- Drag-to-size (rubber-band + line/connector start→end), min-floor/bare-click default → Task 1 (`boundsFromDrag`) + Task 4 (`useAnnotationDraw`).
- One-shot tools + auto-select + `Esc` cancel → Task 4.
- Grid-mode pointer-events toggle → Task 4 Step 4.
- Crosshair cursor → Task 4 Step 4.
- Remove left-panel add-buttons, keep property cards, update hint → Task 5.
- Editor-only, no schema/renderer/print change → Global Constraints + Tasks (no renderer files touched).
- Pure helper unit-tested; suite stays green → Task 1 + Task 6.
- ADR + ROADMAP → Task 6. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; tests show exact expected values. ✓

**3. Type consistency:** `AnnotationTool` (Task 2) is used identically in the palette (Task 3) and hook (Task 4). `DrawKind` / `boundsFromDrag(start, end, kind)` (Task 1) match their call sites in `previewFor`/`buildShape` (Task 4). `useAnnotationDraw(ci, si)` returns `{ activeTool, preview, drawing, begin, move, end }`, all consumed as defined in `PreviewAnnotations` (Task 4). `DrawPreview` discriminant `kind: "rect" | "line"` matches the render branch. `ANNO_STROKE` exported (Task 2) and consumed as the `drawColor` default. ✓
