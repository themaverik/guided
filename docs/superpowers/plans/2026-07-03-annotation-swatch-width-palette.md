# On-canvas Swatch Palette + Width Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SP1 floating palette's ad-hoc color chip with the 8-swatch OKLCH paired-token palette and add 4 predefined stroke-width chips, applied to new draws and the current selection.

**Architecture:** A pure `lib/annotation-palette.ts` holds the tokens (single source for UI + tests). The on-canvas draw builder moves from the hook into a pure `lib/annotation-draw.ts` so it is unit-testable under the `lib/**` vitest include, gaining `width` + `swatchId`. The store gains transient `drawWidth`/`drawSwatch` alongside the existing `drawColor`; `AnnotationPalette` renders swatch + width rows that set those and patch the selection. Editor-only.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Zustand store, vitest (node env), pnpm.

## Global Constraints

- **Editor-only.** No renderer/print change: do not touch `components/renderer/**`, `app/[slug]/print/**`, `lib/book-render.ts`, or `components/editor/PreviewAnnotations.tsx`.
- **No schema change, no migration, no ADR.** `Surface.swatchId?`, `Connector.swatchId?`, `Surface.fill?` already exist in `lib/book-schema.ts`.
- **Immutability:** all `Book` edits go through the existing store `updateAnnotation` / `addAnnotation` (structuredClone-based). Never mutate in place.
- **Pure logic lives in `lib/`.** vitest `include` is `lib/**/*.test.ts`, `environment: "node"` — tests outside `lib/` are NOT run.
- **8 swatches (DESIGN.md §2.2), verbatim** `id fill/stroke`: `ink #e6f1f2/#024450` · `red #ffe8e4/#cb4a47` · `orange #ffecd8/#b56410` · `amber #fef3d2/#957800` · `green #e0f7e4/#369150` · `teal #daf7f6/#188d8d` · `blue #e2f2ff/#217fd0` · `violet #f1edff/#8464cf`.
- **Width presets:** Thin `1` · Medium `2` · Thick `4` · Heavy `6`.
- **Default draw:** `drawSwatch = "ink"`, `drawColor = #024450` (Ink stroke), `drawWidth = 2`.
- **Verify each task:** `pnpm test` green, `pnpm typecheck` 0 errors, `pnpm lint` clean.

---

### Task 1: Palette token module

**Files:**
- Create: `lib/annotation-palette.ts`
- Test: `lib/annotation-palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Swatch { id: string; label: string; fill: string; stroke: string }`
  - `const SWATCHES: Swatch[]` (8 tokens)
  - `interface WidthPreset { label: string; value: number }`
  - `const WIDTH_PRESETS: WidthPreset[]`
  - `const DEFAULT_SWATCH_ID: string` (`"ink"`)
  - `const DEFAULT_STROKE: string` (Ink stroke `#024450`)
  - `function swatchByStroke(hex: string): string | undefined`

- [ ] **Step 1: Write the failing test**

Create `lib/annotation-palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SWATCHES,
  WIDTH_PRESETS,
  DEFAULT_SWATCH_ID,
  DEFAULT_STROKE,
  swatchByStroke,
} from "./annotation-palette";

describe("annotation palette", () => {
  it("has 8 swatches with unique ids and 6-digit hex fill + stroke", () => {
    expect(SWATCHES).toHaveLength(8);
    expect(new Set(SWATCHES.map((s) => s.id)).size).toBe(8);
    for (const s of SWATCHES) {
      expect(s.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.stroke).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("maps every swatch stroke back to its id (case-insensitive)", () => {
    for (const s of SWATCHES) {
      expect(swatchByStroke(s.stroke)).toBe(s.id);
      expect(swatchByStroke(s.stroke.toUpperCase())).toBe(s.id);
    }
  });

  it("returns undefined for an off-palette color", () => {
    expect(swatchByStroke("#123456")).toBeUndefined();
    expect(swatchByStroke("#658995")).toBeUndefined();
  });

  it("width presets are exactly 1 / 2 / 4 / 6", () => {
    expect(WIDTH_PRESETS.map((w) => w.value)).toEqual([1, 2, 4, 6]);
  });

  it("default swatch resolves to a real swatch whose stroke is DEFAULT_STROKE", () => {
    const d = SWATCHES.find((s) => s.id === DEFAULT_SWATCH_ID);
    expect(d).toBeDefined();
    expect(DEFAULT_STROKE).toBe(d!.stroke);
    expect(DEFAULT_STROKE).toBe("#024450");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-palette`
Expected: FAIL — cannot resolve `./annotation-palette`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/annotation-palette.ts`:

```ts
/*
 * Annotation color + width palette (DESIGN.md §2.2). Single source of truth for
 * the on-canvas AnnotationPalette and its tests. Paired OKLCH tokens: `fill`
 * paints the swatch chip; only `stroke` is applied to shapes in this slice
 * (fill tint / export-opacity split are a later color-system slice).
 */
export interface Swatch {
  id: string;
  label: string;
  fill: string;
  stroke: string;
}

export const SWATCHES: Swatch[] = [
  { id: "ink", label: "Ink", fill: "#e6f1f2", stroke: "#024450" },
  { id: "red", label: "Red", fill: "#ffe8e4", stroke: "#cb4a47" },
  { id: "orange", label: "Orange", fill: "#ffecd8", stroke: "#b56410" },
  { id: "amber", label: "Amber", fill: "#fef3d2", stroke: "#957800" },
  { id: "green", label: "Green", fill: "#e0f7e4", stroke: "#369150" },
  { id: "teal", label: "Teal", fill: "#daf7f6", stroke: "#188d8d" },
  { id: "blue", label: "Blue", fill: "#e2f2ff", stroke: "#217fd0" },
  { id: "violet", label: "Violet", fill: "#f1edff", stroke: "#8464cf" },
];

export interface WidthPreset {
  label: string;
  value: number;
}

export const WIDTH_PRESETS: WidthPreset[] = [
  { label: "Thin", value: 1 },
  { label: "Medium", value: 2 },
  { label: "Thick", value: 4 },
  { label: "Heavy", value: 6 },
];

export const DEFAULT_SWATCH_ID = "ink";

/** Stroke hex of the default swatch — the initial on-canvas draw color. */
export const DEFAULT_STROKE = SWATCHES.find(
  (s) => s.id === DEFAULT_SWATCH_ID,
)!.stroke;

/** Resolve a stroke hex to its swatch id (case-insensitive), or undefined. */
export function swatchByStroke(hex: string): string | undefined {
  const h = hex.toLowerCase();
  return SWATCHES.find((s) => s.stroke.toLowerCase() === h)?.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run annotation-palette`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add lib/annotation-palette.ts lib/annotation-palette.test.ts
git commit -m "feat: annotation palette tokens (8 OKLCH swatches + width presets)"
```

---

### Task 2: Pure drawn-shape builder

Extract `buildShape` out of the `use-annotation-draw` hook into a pure `lib/` module and add `width` + `swatchId`, so it runs under the `lib/**` vitest include. (The hook keeps `previewFor`; it is rewired to the new builder in Task 4.)

**Files:**
- Create: `lib/annotation-draw.ts`
- Test: `lib/annotation-draw.test.ts`

**Interfaces:**
- Consumes: `boundsFromDrag`, `Point` (`lib/annotations`); `newSurface`, `newConnector` (`lib/book-mutations`); `AnnotationTool` (type, `lib/store`); `Annotation` (type, `lib/book-schema`).
- Produces:
  - `interface DrawStyle { color: string; width: number; swatchId: string }`
  - `function buildDrawnShape(tool: AnnotationTool, a: Point, b: Point, style: DrawStyle): Annotation | null`

- [ ] **Step 1: Write the failing test**

Create `lib/annotation-draw.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDrawnShape } from "./annotation-draw";

const A = { x: 0.2, y: 0.2 };
const B = { x: 0.6, y: 0.5 };
const style = { color: "#cb4a47", width: 4, swatchId: "red" };

describe("buildDrawnShape", () => {
  it("returns null for the select tool", () => {
    expect(buildDrawnShape("select", A, B, style)).toBeNull();
  });

  it("builds a box carrying stroke, width, swatchId from the style", () => {
    const s = buildDrawnShape("box", A, B, style);
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("box");
    expect(s!.stroke).toBe("#cb4a47");
    expect(s!.width).toBe(4);
    expect(s!.swatchId).toBe("red");
  });

  it("builds text using color (not stroke) plus width + swatchId", () => {
    const s = buildDrawnShape("text", A, B, style);
    expect(s!.kind).toBe("text");
    // Surface.color is text-only; narrow to read it.
    expect((s as { color?: string }).color).toBe("#cb4a47");
    expect(s!.width).toBe(4);
    expect(s!.swatchId).toBe("red");
  });

  it("builds a connector with endpoints from the drag and style stroke/width/swatchId", () => {
    const c = buildDrawnShape("connector", A, B, style);
    expect(c!.kind).toBe("connector");
    expect(c!.stroke).toBe("#cb4a47");
    expect(c!.width).toBe(4);
    expect(c!.swatchId).toBe("red");
    const conn = c as { from: { x: number; y: number }; to: { x: number; y: number } };
    expect(conn.from.x).toBeCloseTo(0.2);
    expect(conn.from.y).toBeCloseTo(0.2);
    expect(conn.to.x).toBeCloseTo(0.6);
    expect(conn.to.y).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-draw`
Expected: FAIL — cannot resolve `./annotation-draw`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/annotation-draw.ts`:

```ts
/*
 * Pure builder for an on-canvas-drawn annotation (SP1 + swatch/width slice).
 * Tool + drag bounds + the current draw style (color, width, swatchId) → a
 * fully-formed shape, or null for Select. Extracted from use-annotation-draw so
 * it is unit-tested under the lib/** vitest include. Editor-only.
 */
import type { Annotation } from "@/lib/book-schema";
import type { AnnotationTool } from "@/lib/store";
import { type Point, boundsFromDrag } from "@/lib/annotations";
import { newConnector, newSurface } from "@/lib/book-mutations";

export interface DrawStyle {
  color: string;
  width: number;
  swatchId: string;
}

export function buildDrawnShape(
  tool: AnnotationTool,
  a: Point,
  b: Point,
  style: DrawStyle,
): Annotation | null {
  if (tool === "select") return null;
  const { color, width, swatchId } = style;
  if (tool === "connector") {
    const nc = newConnector();
    // Reuse the line floor: a real drag is a signed vector; a bare click yields
    // a default-length connector so a click still makes a visible shape.
    const seg = boundsFromDrag(a, b, "line");
    return {
      ...nc,
      from: { ...nc.from, x: a.x, y: a.y },
      to: { ...nc.to, x: seg.x + seg.w, y: seg.y + seg.h },
      stroke: color,
      width,
      swatchId,
    };
  }
  const bd = boundsFromDrag(a, b, tool);
  const s = newSurface(tool);
  // Text's visible color is `color`; every other surface uses `stroke`.
  if (tool === "text")
    return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, color, width, swatchId };
  return {
    ...s,
    x: bd.x,
    y: bd.y,
    w: bd.w,
    h: bd.h,
    stroke: color,
    width,
    swatchId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run annotation-draw`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add lib/annotation-draw.ts lib/annotation-draw.test.ts
git commit -m "feat: pure buildDrawnShape helper (width + swatchId)"
```

---

### Task 3: Store transient draw state

Add `drawWidth` + `drawSwatch` transient fields and setters; default `drawColor` to the Ink swatch stroke. No unit test (UI/transient state) — verified by typecheck and downstream tasks.

**Files:**
- Modify: `lib/store.tsx` (import line 36; state decl after line 73; interface setters after line 187; defaults line 239; setter impls after line 480)

**Interfaces:**
- Consumes: `DEFAULT_STROKE`, `DEFAULT_SWATCH_ID` (`lib/annotation-palette`).
- Produces (store): state `drawWidth: number`, `drawSwatch: string`; actions `setDrawWidth(width: number): void`, `setDrawSwatch(id: string): void`.

- [ ] **Step 1: Swap the ANNO_STROKE import for the palette defaults**

`ANNO_STROKE` is used in the store ONLY for the `drawColor` default (line 239). Replace the import at line 36:

```ts
// remove:
import { ANNO_STROKE } from "./book-mutations";
// add:
import { DEFAULT_STROKE, DEFAULT_SWATCH_ID } from "./annotation-palette";
```

- [ ] **Step 2: Declare the new state fields**

After the `drawColor` field declaration (line 73, `drawColor: string;`), add:

```ts
  /** Transient: stroke width applied to newly-drawn shapes. */
  drawWidth: number;
  /** Transient: swatch id (palette token) applied to newly-drawn shapes. */
  drawSwatch: string;
```

- [ ] **Step 3: Declare the new setters in the interface**

After `setDrawColor: (color: string) => void;` (line 187), add:

```ts
  setDrawWidth: (width: number) => void;
  setDrawSwatch: (id: string) => void;
```

- [ ] **Step 4: Set the defaults**

Replace the default (line 239) `drawColor: ANNO_STROKE,` with:

```ts
    drawColor: DEFAULT_STROKE,
    drawWidth: 2,
    drawSwatch: DEFAULT_SWATCH_ID,
```

- [ ] **Step 5: Add the setter implementations**

After `setDrawColor: (color) => set({ drawColor: color }),` (line 480), add:

```ts
    setDrawWidth: (width) => set({ drawWidth: width }),
    setDrawSwatch: (id) => set({ drawSwatch: id }),
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
pnpm test -- --run
git add lib/store.tsx
git commit -m "feat: drawWidth + drawSwatch transient store state; Ink default draw color"
```

Expected: typecheck 0 errors; full suite green (Task 1 + 2 tests included).

---

### Task 4: Rewire the draw hook to the pure builder

Delete the hook's local `buildShape`, call `buildDrawnShape`, and thread `drawWidth` + `drawSwatch` from the store. Remove now-unused imports.

**Files:**
- Modify: `components/editor/use-annotation-draw.ts`

**Interfaces:**
- Consumes: `buildDrawnShape`, `DrawStyle` (`lib/annotation-draw`); store `drawWidth`, `drawSwatch`.
- Produces: unchanged public hook API (`{ activeTool, preview, drawing, begin, move, end }`).

- [ ] **Step 1: Replace imports**

Replace the current import block (lines 10-14) so `newConnector`/`newSurface`/`Annotation` are dropped (they moved to `lib/annotation-draw`) and the builder is imported:

```ts
import type { Point } from "@/lib/annotations";
import { boundsFromDrag } from "@/lib/annotations";
import { buildDrawnShape } from "@/lib/annotation-draw";
import { useEditor, type AnnotationTool } from "@/lib/store";
```

(Keep the existing `import { useEffect, useRef, useState } from "react";` line.)

- [ ] **Step 2: Delete the local `buildShape` function**

Remove the entire `function buildShape(...) { ... }` block (lines 28-52). Keep `previewFor` (it still drives the live drag preview).

- [ ] **Step 3: Read the new draw state and call the builder**

In `useAnnotationDraw`, after `const drawColor = useEditor((s) => s.drawColor);`, add:

```ts
  const drawWidth = useEditor((s) => s.drawWidth);
  const drawSwatch = useEditor((s) => s.drawSwatch);
```

Then replace the `buildShape(...)` call inside `end` with:

```ts
    const ann = buildDrawnShape(activeTool, s0, p, {
      color: drawColor,
      width: drawWidth,
      swatchId: drawSwatch,
    });
```

- [ ] **Step 4: Verify build + lint (no unused imports)**

Run:
```bash
pnpm typecheck
pnpm lint
```
Expected: 0 errors; no `newSurface`/`newConnector`/`Annotation` unused-import warnings.

- [ ] **Step 5: Commit**

```bash
git add components/editor/use-annotation-draw.ts
git commit -m "refactor: draw hook uses buildDrawnShape (threads width + swatchId)"
```

---

### Task 5: Swatch + width rows in the palette

Replace the freeform color chip + 6 arbitrary presets with the 8 swatch chips and 4 width chips; apply to the current selection and set the next-draw defaults. Add width-chip CSS.

**Files:**
- Modify: `components/editor/AnnotationPalette.tsx` (full body below)
- Modify: `components/editor/editor.css` (add `.ap-width*` after line 1355)

**Interfaces:**
- Consumes: `SWATCHES`, `WIDTH_PRESETS`, `swatchByStroke`, `type Swatch` (`lib/annotation-palette`); store `drawColor/drawWidth/setDrawColor/setDrawWidth/setDrawSwatch/selectedAnnotation/updateAnnotation/book`.
- Produces: UI only.

- [ ] **Step 1: Rewrite `AnnotationPalette.tsx`**

Replace the whole file with:

```tsx
"use client";

/*
 * Floating tool palette over the page canvas (SP1 + swatch/width slice). Sets
 * the active annotation tool, the current draw color (from the 8 OKLCH swatches)
 * and the current stroke width (4 presets). Picking a swatch/width also patches
 * the selected shape. Editor-only; nothing here persists derived output — only
 * stroke/width/swatchId on the shape. Fill tint is a later color-system slice.
 */
import { useEffect } from "react";
import { useEditor, type AnnotationTool } from "@/lib/store";
import {
  SWATCHES,
  WIDTH_PRESETS,
  swatchByStroke,
  type Swatch,
} from "@/lib/annotation-palette";

const TOOLS: { tool: AnnotationTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", icon: <path d="M3 2l8 4-3 1-1 3-4-8z" /> },
  { tool: "box", label: "Box", icon: <rect x="2.5" y="3.5" width="9" height="7" rx="1" /> },
  { tool: "line", label: "Line", icon: <line x1="3" y1="11" x2="11" y2="3" /> },
  { tool: "bracket", label: "Bracket", icon: <path d="M9 2H5v10h4" /> },
  { tool: "diamond", label: "Diamond", icon: <path d="M7 2l5 5-5 5-5-5z" /> },
  { tool: "text", label: "Text", icon: <path d="M3 3h8M7 3v9" /> },
  { tool: "connector", label: "Connector", icon: <path d="M3 3v6h6M7 9l2 0 0-2" /> },
];

export default function AnnotationPalette({ ci, si }: { ci: number; si: number }) {
  const activeTool = useEditor((s) => s.activeTool);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const drawColor = useEditor((s) => s.drawColor);
  const setDrawColor = useEditor((s) => s.setDrawColor);
  const drawWidth = useEditor((s) => s.drawWidth);
  const setDrawWidth = useEditor((s) => s.setDrawWidth);
  const setDrawSwatch = useEditor((s) => s.setDrawSwatch);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  // The selected shape (or null) — needed to know a text shape's kind.
  const selected = useEditor((s) => {
    const id = s.selectedAnnotation;
    if (!id) return null;
    const anns = s.book.chapters[ci]?.steps[si]?.annotations ?? [];
    return anns.find((a) => a.id === id) ?? null;
  });

  // Switching steps starts fresh on Select.
  useEffect(() => {
    setActiveTool("select");
  }, [ci, si, setActiveTool]);

  const activeSwatchId = swatchByStroke(drawColor);

  const applySwatch = (sw: Swatch) => {
    setDrawColor(sw.stroke);
    setDrawSwatch(sw.id);
    if (selected) {
      const patch: { stroke: string; swatchId: string; color?: string } = {
        stroke: sw.stroke,
        swatchId: sw.id,
      };
      if (selected.kind === "text") patch.color = sw.stroke;
      updateAnnotation(ci, si, selected.id, patch);
    }
  };

  const applyWidth = (w: number) => {
    setDrawWidth(w);
    if (selected) updateAnnotation(ci, si, selected.id, { width: w });
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
      {SWATCHES.map((sw) => (
        <button
          key={sw.id}
          type="button"
          className={`ap-swatch${activeSwatchId === sw.id ? " active" : ""}`}
          style={{ background: sw.fill, borderColor: sw.stroke }}
          title={sw.label}
          aria-label={`Color ${sw.label}`}
          aria-pressed={activeSwatchId === sw.id}
          onClick={() => applySwatch(sw)}
        />
      ))}
      <span className="ap-div" />
      {WIDTH_PRESETS.map((w) => (
        <button
          key={w.value}
          type="button"
          className={`ap-width${drawWidth === w.value ? " active" : ""}`}
          title={`${w.label} (${w.value})`}
          aria-label={`Width ${w.label}`}
          aria-pressed={drawWidth === w.value}
          onClick={() => applyWidth(w.value)}
        >
          <span className="ap-width-bar" style={{ height: w.value }} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add width-chip CSS**

In `components/editor/editor.css`, immediately after the `.ap-swatch.active { ... }` rule (ends line 1355), add:

```css
.ap-width {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe3e3;
  border-radius: 8px;
  background: #f2f4f4;
  cursor: pointer;
  padding: 0;
}
.ap-width:hover {
  background: #e6ecec;
}
.ap-width.active {
  border-color: #024450;
  box-shadow: 0 0 0 1px #024450;
}
.ap-width-bar {
  width: 18px;
  background: #024450;
  border-radius: 2px;
}
```

(No change to `.ap-swatch` needed — the inline `borderColor`/`background` override its base border color; the outer hairline ring and `.active` selection ring stay.)

- [ ] **Step 3: Verify typecheck, lint, build, full suite**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```
Expected: 0 type errors; lint clean (no unused `drawColor` — still read for `activeSwatchId`); full suite green; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/editor/AnnotationPalette.tsx components/editor/editor.css
git commit -m "feat: 8-swatch OKLCH palette + width-preset chips on the annotation toolbar"
```

---

### Task 6: Manual smoke + docs

**Files:**
- Modify: `ROADMAP.md` (v3 backlog — mark the OKLCH-swatch item shipped for this slice)
- Modify: `docs/adr/ADR-004-annotation-canvas.md` (append a short amendment note)

- [ ] **Step 1: Manual smoke test (record result)**

Run `pnpm dev`, open a project, select a step, switch it to a grid/annotation-capable page, and verify on the canvas palette:
- 8 swatch chips render (light fill, colored border); Ink is active on load.
- 4 width chips render; Medium (2) active on load.
- Pick Red + Thick, draw a box → box has red stroke, width 4.
- Select an existing shape, click Green → its stroke turns green; click Thin → width 1.
- Draw a text shape after picking Blue → text renders blue.
- Open `/<slug>/print` → annotations render with the chosen stroke/width; **no palette/handles** in print.

Note pass/fail inline. (Browser extension may be unavailable in headless runs; if so, state that this step is deferred to a human, per repo convention.)

- [ ] **Step 2: Update ROADMAP + ADR-004**

In `ROADMAP.md`, under the SP1 bullet, note the swatch palette + width presets shipped (branch `feat/annotation-swatch-width-palette`), stroke-only (fill/tint deferred). In `ADR-004`, append a one-paragraph amendment: on-canvas palette now sources color from the DESIGN.md §2.2 8-swatch paired tokens (stroke + `swatchId` applied; fill deferred) and offers 4 width presets; editor-only, no schema change.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md docs/adr/ADR-004-annotation-canvas.md
git commit -m "docs: ROADMAP + ADR-004 — swatch palette + width presets"
```

---

## Self-Review

**Spec coverage:**
- Palette module (8 swatches + widths + `swatchByStroke`) → Task 1. ✓
- Store transient `drawWidth`/`drawSwatch` + Ink default → Task 3. ✓
- Palette UI swatch row + width row, apply-to-selection (incl. text `color`) → Task 5. ✓
- Draw path threads width + swatchId → Tasks 2 (pure builder) + 4 (hook). ✓
- Left panel untouched → not modified in any task. ✓
- No schema/renderer/print change → Global Constraints + Task 6 print smoke. ✓
- Tests: palette module + builder → Tasks 1, 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command shows expected output. ✓

**Type consistency:** `Swatch`/`WidthPreset`/`swatchByStroke`/`DEFAULT_STROKE`/`DEFAULT_SWATCH_ID` (Task 1) used verbatim in Tasks 3 & 5. `DrawStyle`/`buildDrawnShape` (Task 2) used verbatim in Task 4. Store fields `drawWidth`/`drawSwatch` + setters (Task 3) consumed verbatim in Tasks 4 & 5. `updateAnnotation(ci, si, id, patch)` matches the store signature. ✓
