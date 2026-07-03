# SP2 — Annotation Selection Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, shape-aware popover anchored to the selected annotation for quick color / width / delete edits (all shapes) plus endpoint style / routing / direction (connectors).

**Architecture:** A pure `lib/annotation-popover.ts` (placement + shape-bounds math) and small shared helpers (`swatchPatch`, extracted option lists) feed a new editor-only overlay `AnnotationSelectionPopover`, mounted unscaled as a sibling of `AnnotationPalette` in `.editor-right`. A transient store flag `annotationDragging` (set by `PreviewAnnotations`) hides it during drag. All edits go through the existing immutable `updateAnnotation`; nothing touches the renderer, print path, or schema.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Zustand store, vitest (node env), pnpm.

## Global Constraints

- **Editor-only.** Do NOT touch `components/renderer/**`, `app/[slug]/print/**`, `lib/book-render.ts`, `lib/book-schema.ts`, `lib/book-io.ts`, or persistence.
- **No schema change, no migration, no new ADR** (ADR-004 amendment only). All fields used already exist.
- Immutability: all Book edits via the store's `updateAnnotation` / `requestDeleteAnnotation`.
- Pure logic lives in `lib/`; vitest `include` is `lib/**/*.test.ts`, `environment: "node"` — tests outside `lib/` are NOT run.
- **Popover contents:** every shape → 8 swatch chips + 4 width chips + danger `×`; connector adds a row → `from` style, `to` style, routing, and (square only) direction (writes `to.dir`).
- **Placement:** above the shape's bounding box, centered; flip below when it would clip the top; clamp horizontally to the container; `POPOVER_GAP = 10` px.
- **Reuse:** `SWATCHES` / `WIDTH_PRESETS` / `swatchByStroke` from `lib/annotation-palette`; `.ap-swatch` / `.ap-width` / `.ap-div` / `.mini-btn.danger` CSS classes already exist.
- **Transient store flag** `annotationDragging` — never persisted (like `activeTool`/`drawColor`).
- **Verify each task:** `pnpm test` green, `pnpm typecheck` 0, `pnpm lint` clean, and (Task 5/6) `pnpm build` OK.

---

### Task 1: Placement + shape-bounds math

**Files:**
- Create: `lib/annotation-popover.ts`
- Test: `lib/annotation-popover.test.ts`

**Interfaces:**
- Consumes: `resolveEndpoint` (`lib/annotations`), `Annotation` type (`lib/book-schema`).
- Produces:
  - `interface Box { x: number; y: number; w: number; h: number }`
  - `interface Size { w: number; h: number }`
  - `interface Viewport { w: number; h: number }`
  - `interface Placement { top: number; left: number; side: "above" | "below" }`
  - `function popoverPlacement(box: Box, size: Size, viewport: Viewport, gap?: number): Placement`
  - `function shapeBounds(shape: Annotation, all: Annotation[]): Box` — normalized 0–1 bbox

- [ ] **Step 1: Write the failing test**

Create `lib/annotation-popover.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { popoverPlacement, shapeBounds } from "./annotation-popover";
import type { Annotation } from "./book-schema";

describe("popoverPlacement", () => {
  const size = { w: 200, h: 40 };
  const vp = { w: 800, h: 600 };

  it("places above and horizontally centered by default", () => {
    const p = popoverPlacement({ x: 300, y: 200, w: 100, h: 50 }, size, vp, 10);
    expect(p.side).toBe("above");
    // top = box.y - size.h - gap = 200 - 40 - 10
    expect(p.top).toBe(150);
    // left = box.x + box.w/2 - size.w/2 = 300 + 50 - 100
    expect(p.left).toBe(250);
  });

  it("flips below when there is no room above", () => {
    const p = popoverPlacement({ x: 300, y: 20, w: 100, h: 50 }, size, vp, 10);
    expect(p.side).toBe("below");
    // top = box.y + box.h + gap = 20 + 50 + 10
    expect(p.top).toBe(80);
  });

  it("clamps left within the viewport", () => {
    const atLeft = popoverPlacement({ x: 0, y: 200, w: 20, h: 20 }, size, vp, 10);
    expect(atLeft.left).toBe(10); // clamped to gap
    const atRight = popoverPlacement({ x: 790, y: 200, w: 20, h: 20 }, size, vp, 10);
    expect(atRight.left).toBe(vp.w - size.w - 10); // 590
  });
});

describe("shapeBounds", () => {
  it("returns a surface's own box, normalized for negative extent (line)", () => {
    const line = { id: "l", kind: "line", x: 0.6, y: 0.5, w: -0.4, h: 0, stroke: "#000", width: 2 } as Annotation;
    const b = shapeBounds(line, [line]);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.4);
  });

  it("returns a connector's endpoint extent", () => {
    const c = {
      id: "c", kind: "connector",
      from: { x: 0.2, y: 0.3, style: "none" },
      to: { x: 0.7, y: 0.6, style: "arrow" },
      stroke: "#000", width: 2, routing: "straight",
    } as Annotation;
    const b = shapeBounds(c, [c]);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.3);
    expect(b.w).toBeCloseTo(0.5);
    expect(b.h).toBeCloseTo(0.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-popover`
Expected: FAIL — cannot resolve `./annotation-popover`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/annotation-popover.ts`:

```ts
/*
 * Pure geometry for the annotation selection popover (SP2): where to anchor the
 * popover relative to a selected shape, and the shape's normalized bounding box.
 * Editor-only; no rendering here.
 */
import type { Annotation } from "@/lib/book-schema";
import { resolveEndpoint } from "@/lib/annotations";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Viewport {
  w: number;
  h: number;
}
export interface Placement {
  top: number;
  left: number;
  side: "above" | "below";
}

/** Anchor a popover to `box` (container-relative px): above-centered by default,
 *  flipping below when it would clip the top, with `left` clamped inside the
 *  viewport by `gap`. */
export function popoverPlacement(
  box: Box,
  size: Size,
  viewport: Viewport,
  gap = 8,
): Placement {
  const aboveTop = box.y - size.h - gap;
  const side: "above" | "below" = aboveTop >= 0 ? "above" : "below";
  const top = side === "above" ? aboveTop : box.y + box.h + gap;
  const centered = box.x + box.w / 2 - size.w / 2;
  const maxLeft = viewport.w - size.w - gap;
  const left = Math.max(gap, Math.min(centered, maxLeft));
  return { top, left, side };
}

/** Normalized 0–1 bounding box of a shape. Surfaces use their own rect
 *  (normalized for lines' signed extent); connectors span their resolved
 *  endpoints + waypoints. */
export function shapeBounds(shape: Annotation, all: Annotation[]): Box {
  if (shape.kind !== "connector") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
  }
  const pts = [
    resolveEndpoint(all, shape.from),
    resolveEndpoint(all, shape.to),
    ...(shape.waypoints ?? []),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run annotation-popover`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add lib/annotation-popover.ts lib/annotation-popover.test.ts
git commit -m "feat: popoverPlacement + shapeBounds geometry for the selection popover"
```

---

### Task 2: `swatchPatch` helper + palette adoption

**Files:**
- Modify: `lib/annotation-palette.ts` (add `swatchPatch`)
- Modify: `components/editor/AnnotationPalette.tsx` (use it in `applySwatch`)
- Test: `lib/annotation-palette.test.ts` (extend)

**Interfaces:**
- Consumes: `Swatch` (existing, `lib/annotation-palette`).
- Produces: `function swatchPatch(sw: Swatch, kind: string): { stroke: string; swatchId: string; color?: string }` — `color` set only when `kind === "text"`.

- [ ] **Step 1: Write the failing test**

Add to `lib/annotation-palette.test.ts` (new `describe` block, keep existing tests):

```ts
import { SWATCHES, swatchPatch } from "./annotation-palette";

describe("swatchPatch", () => {
  const red = SWATCHES.find((s) => s.id === "red")!;

  it("sets stroke + swatchId and no color for non-text shapes", () => {
    const p = swatchPatch(red, "box");
    expect(p).toEqual({ stroke: red.stroke, swatchId: "red" });
    expect("color" in p).toBe(false);
  });

  it("adds color for text shapes", () => {
    const p = swatchPatch(red, "text");
    expect(p).toEqual({ stroke: red.stroke, swatchId: "red", color: red.stroke });
  });
});
```

(Note: if the existing file already imports `SWATCHES`, add only `swatchPatch` to that import rather than duplicating it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-palette`
Expected: FAIL — `swatchPatch` is not exported.

- [ ] **Step 3: Add the helper**

Append to `lib/annotation-palette.ts`:

```ts
/** The immutable patch a swatch applies to a shape: stroke + swatchId, plus
 *  `color` for text (whose visible color is `color`, not `stroke`). */
export function swatchPatch(
  sw: Swatch,
  kind: string,
): { stroke: string; swatchId: string; color?: string } {
  const patch: { stroke: string; swatchId: string; color?: string } = {
    stroke: sw.stroke,
    swatchId: sw.id,
  };
  if (kind === "text") patch.color = sw.stroke;
  return patch;
}
```

- [ ] **Step 4: Adopt it in the palette**

In `components/editor/AnnotationPalette.tsx`, add `swatchPatch` to the `@/lib/annotation-palette` import, then replace the body of `applySwatch` (currently builds the patch inline) with:

```tsx
  const applySwatch = (sw: Swatch) => {
    setDrawColor(sw.stroke);
    setDrawSwatch(sw.id);
    if (selected) updateAnnotation(ci, si, selected.id, swatchPatch(sw, selected.kind));
  };
```

- [ ] **Step 5: Run tests + verify no behavior change**

Run:
```bash
pnpm test -- --run annotation-palette
pnpm typecheck
pnpm lint
```
Expected: PASS (palette suite incl. new `swatchPatch` tests); typecheck 0; lint clean.

- [ ] **Step 6: Commit**

```bash
git add lib/annotation-palette.ts lib/annotation-palette.test.ts components/editor/AnnotationPalette.tsx
git commit -m "feat: swatchPatch helper; palette adopts it (DRY)"
```

---

### Task 3: Shared endpoint/routing/direction option lists

**Files:**
- Create: `lib/annotation-options.ts`
- Test: `lib/annotation-options.test.ts`
- Modify: `components/editor/AnnotationEditor.tsx` (import + use them)

**Interfaces:**
- Consumes: `EndpointStyle`, `Connector`, `Endpoint` types (`lib/book-schema`).
- Produces:
  - `const ENDPOINT_STYLES: EndpointStyle[]`
  - `type Routing = NonNullable<Connector["routing"]>` + `const ROUTINGS: { value: Routing; label: string }[]`
  - `type DirValue = "" | NonNullable<Endpoint["dir"]>` + `const DIRECTION_OPTIONS: { value: DirValue; label: string }[]`

- [ ] **Step 1: Write the failing test**

Create `lib/annotation-options.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS } from "./annotation-options";

describe("annotation options", () => {
  it("lists the six endpoint styles", () => {
    expect(ENDPOINT_STYLES).toEqual(["none", "arrow", "circle", "diamond", "point", "bar"]);
  });
  it("has straight + square routings", () => {
    expect(ROUTINGS.map((r) => r.value)).toEqual(["straight", "square"]);
  });
  it("has auto + four directions, auto first with empty value", () => {
    expect(DIRECTION_OPTIONS.map((d) => d.value)).toEqual(["", "left", "right", "up", "down"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run annotation-options`
Expected: FAIL — cannot resolve `./annotation-options`.

- [ ] **Step 3: Write the module**

Create `lib/annotation-options.ts`:

```ts
/*
 * Shared option lists for annotation endpoint style / connector routing /
 * direction, used by both the left-panel AnnotationEditor and the on-canvas
 * selection popover so the option sets cannot drift. Editor-only.
 */
import type { EndpointStyle, Connector, Endpoint } from "@/lib/book-schema";

export const ENDPOINT_STYLES: EndpointStyle[] = [
  "none",
  "arrow",
  "circle",
  "diamond",
  "point",
  "bar",
];

export type Routing = NonNullable<Connector["routing"]>;
export const ROUTINGS: { value: Routing; label: string }[] = [
  { value: "straight", label: "straight" },
  { value: "square", label: "rectangular" },
];

export type DirValue = "" | NonNullable<Endpoint["dir"]>;
export const DIRECTION_OPTIONS: { value: DirValue; label: string }[] = [
  { value: "", label: "auto dir" },
  { value: "left", label: "← left" },
  { value: "right", label: "→ right" },
  { value: "up", label: "↑ up" },
  { value: "down", label: "↓ down" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run annotation-options`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor AnnotationEditor to use the shared lists**

In `components/editor/AnnotationEditor.tsx`:

1. Delete the local `const STYLES: EndpointStyle[] = [ ... ];` block (lines ~22–29) and import the shared lists instead — add to the top imports:

```tsx
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS } from "@/lib/annotation-options";
```

2. Replace the endpoint-style `<select>`'s option map `{STYLES.map(...)}` with `{ENDPOINT_STYLES.map(...)}` (same render body).

3. Replace the routing `<select>`'s two hardcoded `<option>`s with:

```tsx
                  {ROUTINGS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
```

4. Replace the direction `<select>`'s five hardcoded `<option>`s (`auto dir` / `← left` / …) with:

```tsx
            {DIRECTION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
```

(Leave `SIZES`, `ANCHORS`, `FONTS`, `ALIGNS` and every other part of the file unchanged. If `EndpointStyle` is now only used in a cast and no longer in a declared array, keep its existing type import — it is still referenced by the `as EndpointStyle` casts.)

- [ ] **Step 6: Verify no behavior change**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
```
Expected: typecheck 0; lint clean (no unused `STYLES`/imports); full suite green.

- [ ] **Step 7: Commit**

```bash
git add lib/annotation-options.ts lib/annotation-options.test.ts components/editor/AnnotationEditor.tsx
git commit -m "refactor: shared annotation option lists (endpoint/routing/direction)"
```

---

### Task 4: `annotationDragging` store flag + drag wiring

**Files:**
- Modify: `lib/store.tsx` (field ~line 81, interface setter ~197, default ~251, impl ~494)
- Modify: `components/editor/PreviewAnnotations.tsx` (read setter; set true in 4 drag-start handlers; false in `onUp`)

**Interfaces:**
- Produces (store): state `annotationDragging: boolean`; action `setAnnotationDragging(v: boolean): void`.
- Consumed by: Task 5's popover.

- [ ] **Step 1: Add the store field**

In `lib/store.tsx`, after the `drawSwatch: string;` state field declaration (~line 81), add:

```ts
  /** Transient: an annotation drag/resize is in progress (hides the popover). */
  annotationDragging: boolean;
```

After the `setDrawSwatch: (id: string) => void;` interface line (~197), add:

```ts
  setAnnotationDragging: (v: boolean) => void;
```

After the `drawSwatch: DEFAULT_SWATCH_ID,` default (~251), add:

```ts
    annotationDragging: false,
```

After the `setDrawSwatch: (id) => set({ drawSwatch: id }),` implementation (~494), add:

```ts
    setAnnotationDragging: (v) => set({ annotationDragging: v }),
```

- [ ] **Step 2: Read the setter in PreviewAnnotations**

In `components/editor/PreviewAnnotations.tsx`, alongside the other `useEditor` selectors near the top of the component (e.g. after the `updateAnnotation` selector), add:

```tsx
  const setAnnotationDragging = useEditor((s) => s.setAnnotationDragging);
```

- [ ] **Step 3: Set the flag true at each drag start**

Add `setAnnotationDragging(true);` immediately after the `drag.current = { ... };` assignment in EACH of the four start handlers — `startDrag`, `startWp`, `startSeg`, `startDirDrag`. For example `startDrag` becomes:

```tsx
    drag.current = { id, part, grabX, grabY, targets };
    setAnnotationDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
```

Apply the same one-line insertion (right after the `drag.current = { ... }` line) in `startWp`, `startSeg`, and `startDirDrag`.

- [ ] **Step 4: Clear the flag on pointer-up**

In the `onUp` handler, in the drag branch (after `drag.current = null;`), add `setAnnotationDragging(false);`:

```tsx
  const onUp = (e: React.PointerEvent) => {
    if (draw.drawing()) {
      draw.end(toN(e));
      svgRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    drag.current = null;
    setAnnotationDragging(false);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
    setActiveGuides([]);
    force((n) => n + 1);
  };
```

- [ ] **Step 5: Verify**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
```
Expected: typecheck 0; lint clean; full suite green (201 + new tests from Tasks 1–3).

- [ ] **Step 6: Commit**

```bash
git add lib/store.tsx components/editor/PreviewAnnotations.tsx
git commit -m "feat: annotationDragging transient flag, set during shape drag/resize"
```

---

### Task 5: The popover component + mount

**Files:**
- Create: `components/editor/AnnotationSelectionPopover.tsx`
- Modify: `components/editor/editor.css` (add `.anno-popover*` rules)
- Modify: `components/editor/PreviewPane.tsx` (add `ref` to `.editor-right`; mount the popover)

**Interfaces:**
- Consumes: `popoverPlacement`, `shapeBounds` (`lib/annotation-popover`); `SWATCHES`, `WIDTH_PRESETS`, `swatchByStroke`, `swatchPatch`, `Swatch` (`lib/annotation-palette`); `ENDPOINT_STYLES`, `ROUTINGS`, `DIRECTION_OPTIONS` (`lib/annotation-options`); store `annotationDragging`, `updateAnnotation`, `requestDeleteAnnotation`; `resolveEndpoint` indirectly via `shapeBounds`.
- Produces: UI only.

- [ ] **Step 1: Write the component**

Create `components/editor/AnnotationSelectionPopover.tsx`:

```tsx
"use client";

/*
 * Compact popover anchored to the selected annotation (SP2). Reflects the
 * selected shape's color + width (+ connector endpoint/routing/direction) and
 * writes edits through updateAnnotation. Mounted unscaled as a sibling of
 * AnnotationPalette in .editor-right; positioned from the shape's measured
 * screen bounds. Editor-only; hides during an active drag. Nothing prints.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { Annotation, Connector, Endpoint, EndpointStyle } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";
import {
  SWATCHES,
  WIDTH_PRESETS,
  swatchByStroke,
  swatchPatch,
  type Swatch,
} from "@/lib/annotation-palette";
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS } from "@/lib/annotation-options";
import { popoverPlacement, shapeBounds } from "@/lib/annotation-popover";

const POPOVER_GAP = 10;

export default function AnnotationSelectionPopover({
  ci,
  si,
  scalerRef,
  containerRef,
  scrollRef,
  pageIndex,
  annotations,
  selectedId,
  scale,
  fitKey,
}: {
  ci: number;
  si: number;
  scalerRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  annotations: Annotation[];
  selectedId: string | null;
  scale: number;
  fitKey: string;
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const requestDeleteAnnotation = useEditor((s) => s.requestDeleteAnnotation);
  const dragging = useEditor((s) => s.annotationDragging);

  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const shape = selectedId
    ? annotations.find((a) => a.id === selectedId) ?? null
    : null;

  useLayoutEffect(() => {
    if (!shape || dragging) {
      setPos(null);
      return;
    }
    const measure = () => {
      const pageEl =
        scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
      const container = containerRef.current;
      if (!pageEl || !container) return;
      const pr = pageEl.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      const nb = shapeBounds(shape, annotations);
      const box = {
        x: pr.left - cr.left + nb.x * pr.width,
        y: pr.top - cr.top + nb.y * pr.height,
        w: nb.w * pr.width,
        h: nb.h * pr.height,
      };
      const pop = popRef.current;
      const size = pop
        ? { w: pop.offsetWidth, h: pop.offsetHeight }
        : { w: 240, h: 40 };
      const pl = popoverPlacement(box, size, { w: cr.width, h: cr.height }, POPOVER_GAP);
      setPos({ top: pl.top, left: pl.left });
    };
    measure();
    const sc = scrollRef.current;
    sc?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      sc?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [shape, annotations, dragging, scale, fitKey, pageIndex, scalerRef, containerRef, scrollRef]);

  if (!shape || dragging || !pos) return null;

  const activeSwatchId = swatchByStroke(shape.stroke);
  const c: Connector | null = shape.kind === "connector" ? (shape as Connector) : null;

  const applySwatch = (sw: Swatch) =>
    updateAnnotation(ci, si, shape.id, swatchPatch(sw, shape.kind));
  const applyWidth = (value: number) =>
    updateAnnotation(ci, si, shape.id, { width: value });
  const setEndpoint = (which: "from" | "to", patch: Partial<Endpoint>) =>
    updateAnnotation(ci, si, shape.id, { [which]: { ...(c as Connector)[which], ...patch } });

  return (
    <div
      ref={popRef}
      className="anno-popover"
      style={{ top: pos.top, left: pos.left }}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="anno-popover-row">
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
            className={`ap-width${shape.width === w.value ? " active" : ""}`}
            title={`${w.label} (${w.value})`}
            aria-label={`Width ${w.label}`}
            aria-pressed={shape.width === w.value}
            onClick={() => applyWidth(w.value)}
          >
            <span className="ap-width-bar" style={{ height: w.value }} />
          </button>
        ))}
        <span className="ap-div" />
        <button
          type="button"
          className="mini-btn danger"
          title="Delete"
          aria-label="Delete annotation"
          onClick={() => requestDeleteAnnotation(ci, si, shape.id)}
        >
          ×
        </button>
      </div>

      {c ? (
        <div className="anno-popover-row">
          <select
            value={c.from.style}
            aria-label="From endpoint style"
            onChange={(e) => setEndpoint("from", { style: e.target.value as EndpointStyle })}
          >
            {ENDPOINT_STYLES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            value={c.to.style}
            aria-label="To endpoint style"
            onChange={(e) => setEndpoint("to", { style: e.target.value as EndpointStyle })}
          >
            {ENDPOINT_STYLES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            value={c.routing ?? "straight"}
            aria-label="Routing"
            onChange={(e) =>
              updateAnnotation(ci, si, c.id, {
                routing: e.target.value as Connector["routing"],
              })
            }
          >
            {ROUTINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {c.routing === "square" ? (
            <select
              value={c.to.dir ?? ""}
              aria-label="Direction"
              onChange={(e) =>
                setEndpoint("to", { dir: (e.target.value || undefined) as Endpoint["dir"] })
              }
            >
              {DIRECTION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add popover CSS**

In `components/editor/editor.css`, after the `.ap-width-bar { ... }` rule (added in the swatch slice), add:

```css
.anno-popover {
  position: absolute;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e8eded;
  border-radius: 9px;
  box-shadow: 0 1px 3px rgba(2, 68, 80, 0.06), 0 8px 32px rgba(2, 68, 80, 0.12);
}
.anno-popover-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.anno-popover select {
  height: 28px;
  border: 1px solid #dbe2e2;
  border-radius: 7px;
  background: #fff;
  color: #024450;
  font-size: 12px;
  padding: 0 4px;
  cursor: pointer;
}
```

- [ ] **Step 3: Mount it in PreviewPane**

In `components/editor/PreviewPane.tsx`:

1. Add the import near the other overlay imports:

```tsx
import AnnotationSelectionPopover from "./AnnotationSelectionPopover";
```

2. Add a ref for the container. Near the existing `const scalerRef = useRef<HTMLDivElement>(null);`, add:

```tsx
  const rightRef = useRef<HTMLDivElement>(null);
```

3. Put that ref on the `.editor-right` wrapper — change `<div className="editor-right">` to:

```tsx
    <div className="editor-right" ref={rightRef}>
```

4. Immediately after the `<AnnotationPalette ... />` block (the `{selection.stepIndex != null ? (<AnnotationPalette .../>) : null}` near the end), add the popover as a second sibling:

```tsx
      {selection.stepIndex != null ? (
        <AnnotationSelectionPopover
          ci={selection.chapterIndex}
          si={selection.stepIndex}
          scalerRef={scalerRef}
          containerRef={rightRef}
          scrollRef={scrollRef}
          pageIndex={currentPage}
          annotations={
            book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
              ?.annotations ?? []
          }
          selectedId={selectedAnnotation}
          scale={scale}
          fitKey={bookFitKey(book)}
        />
      ) : null}
```

(`scrollRef`, `currentPage`, `scale`, `selectedAnnotation`, `bookFitKey` are already in scope in this component — they are used by the existing `PreviewAnnotations` mount. If `selectedAnnotation` is not already read from the store in this component, add `const selectedAnnotation = useEditor((s) => s.selectedAnnotation);` — verify against the existing `PreviewAnnotations` mount which already passes `selectedId={selectedAnnotation}`.)

- [ ] **Step 4: Verify typecheck, lint, build, suite**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```
Expected: typecheck 0; lint clean; suite green; production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/editor/AnnotationSelectionPopover.tsx components/editor/editor.css components/editor/PreviewPane.tsx
git commit -m "feat: on-canvas annotation selection popover (color/width/delete + connector endpoints)"
```

---

### Task 6: Docs + manual smoke

**Files:**
- Modify: `ROADMAP.md` (SP2 → done)
- Modify: `docs/adr/ADR-004-annotation-canvas.md` (amendment)

- [ ] **Step 1: Manual smoke (record result)**

Do NOT start a dev server or browser in an automated environment — if the browser extension is not connected, mark this deferred to human. When run by a human: select each shape kind → a popover appears above it (flips below near the top, clamped horizontally); swatch + width chips reflect and change the shape; `×` opens the confirm modal; for a connector the second row edits `from`/`to` style, routing, and (square) direction; the popover hides while dragging/resizing and re-anchors after; scrolling/zooming keeps it anchored; `/print` shows no popover.

- [ ] **Step 2: Update ROADMAP + ADR-004**

In `ROADMAP.md`, change the SP2 bullet from `[todo]` to `[done] (feat/annotation-selection-popover)` with a one-line summary (compact popover anchored to the selection: color/width/delete for all shapes + connector endpoint/routing/direction; reuses the swatch + width chips; editor-only). Match surrounding formatting.

In `docs/adr/ADR-004-annotation-canvas.md`, append a dated amendment (2026-07-03) in the file's existing `## Amendment (date): …` style: the hybrid inspector gains its middle piece — a selection popover (`AnnotationSelectionPopover`) anchored to the selected shape via pure `popoverPlacement`/`shapeBounds`; carries the reused swatch + width chips, a confirm-routed delete, and connector endpoint/routing/direction; a transient `annotationDragging` store flag hides it during drag; shared option lists extracted to `lib/annotation-options.ts`; editor-only, no schema change.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md docs/adr/ADR-004-annotation-canvas.md
git commit -m "docs: ROADMAP + ADR-004 — SP2 selection popover"
```

---

## Self-Review

**Spec coverage:**
- Popover component, unscaled, sibling of palette, gated on selection → Task 5. ✓
- Placement above/flip/clamp + shape bounds → Task 1 (`popoverPlacement`/`shapeBounds`). ✓
- Common row (swatches + widths + delete via confirm) → Task 5, reusing Task 2's `swatchPatch`. ✓
- Connector row (from/to style, routing, square-only direction on `to`) → Task 5, using Task 3's lists. ✓
- Hide-during-drag via transient flag set by PreviewAnnotations → Task 4. ✓
- DRY: `swatchPatch` (Task 2) + shared option lists (Task 3). ✓
- Editor-only / no schema / no renderer change → Global Constraints + Task 6 print note. ✓
- Tests: placement + bounds (Task 1), swatchPatch (Task 2), options (Task 3). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands show expected output. ✓

**Type consistency:** `Box`/`Size`/`Viewport`/`Placement`/`popoverPlacement`/`shapeBounds` (Task 1) used verbatim in Task 5. `swatchPatch(sw, kind)` (Task 2) used in Task 5. `ENDPOINT_STYLES`/`ROUTINGS`/`DIRECTION_OPTIONS` (Task 3) used in Tasks 3 & 5. Store `annotationDragging`/`setAnnotationDragging` (Task 4) consumed in Tasks 4 & 5. `updateAnnotation(ci, si, id, patch)` matches the store signature. Popover props (`containerRef`/`scrollRef`/`scalerRef`) match the PreviewPane refs. ✓
