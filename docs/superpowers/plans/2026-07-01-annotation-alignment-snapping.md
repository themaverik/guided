# Annotation Alignment Snapping + Smart Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an author moves or resizes an annotation surface, snap its edges/center to other surfaces, grid cell borders, primary objects, and the page — with Figma-style smart guide lines — while connectors stay freely placeable.

**Architecture:** A pure `snapAlign(moving, targets, thrX, thrY, mode)` helper in `lib/annotations.ts` computes the per-axis snap delta + guide lines from a list of target rects. The editor (`PreviewAnnotations.tsx`) collects the targets once at drag-start (data-model surfaces + DOM-measured `.grid-cell`/`.img-slot` rects + the page), calls the helper on surface move/resize, renders transient guide lines, and treats **Alt** as a universal snapping bypass (surfaces and connectors). Editor-only — nothing prints; no schema change.

**Tech Stack:** TypeScript, React 19, Zustand store, Vitest (unit), Playwright (visual). Pure helper is unit-tested; the editor wiring is verified by typecheck/lint/build + a manual/Playwright editor check.

## Global Constraints

- **Pure geometry helper** in `lib/annotations.ts` — no mutation of inputs; the editor supplies target rects (the helper is agnostic to their source).
- **No schema change**, no `CURRENT_SCHEMA_VERSION` bump, no migration. Snapping only adjusts the stored `x/y/w/h`.
- **Editor-only.** Guides live in `PreviewAnnotations`, never in `components/renderer/AnnotationLayer.tsx` or the print path — nothing snapping-related prints.
- **Connectors stay free:** connector endpoints are NOT alignment targets or sources; their drag behavior is unchanged except that **Alt** also bypasses their anchor/axis snap.
- **Screen-consistent threshold:** `SNAP_PX = 6` screen px, converted to normalized via the rendered on-screen size (`W * scale`, `H * scale`).
- **Targets are rectangular surfaces only** (`box`, `diamond`, `text`, `bracket`) + measured `.grid-cell`/`.img-slot` + the page `{0,0,1,1}`. `line` and `connector` are neither source nor target.
- Commit type `feat` for code, `docs` for ADR/ROADMAP. No AI attribution in commit messages. Do not `git push`.

---

### Task 1: Pure `snapAlign` helper + types

**Files:**
- Modify: `lib/annotations.ts` (add `Rect`, `GuideLine`, `SnapResult`, `snapAlign`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: nothing new (standalone geometry).
- Produces:
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `interface GuideLine { axis: "x" | "y"; at: number }`
  - `interface SnapResult { dx: number; dy: number; guides: GuideLine[] }`
  - `function snapAlign(moving: Rect, targets: Rect[], thrX: number, thrY: number, mode: "move" | "resize"): SnapResult` — per-axis nearest-line snap. `move` uses the moving rect's left/centerX/right (X) and top/centerY/bottom (Y) as source lines; `resize` uses only the dragged right (X) and bottom (Y) edges. Each target contributes left/centerX/right and top/centerY/bottom. Returns the delta to apply and one guide per snapped axis (`at` = the matched target line). No match within threshold on an axis → delta 0, no guide there.

- [ ] **Step 1: Write the failing tests**

In `lib/annotations.test.ts`, extend the existing `@/lib/annotations` import with `snapAlign`, then add:

```ts
describe("snapAlign — object alignment", () => {
  const T = 0.02;
  const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

  it("snaps a moving left edge to a target left edge", () => {
    const res = snapAlign(r(0.5, 0.3, 0.1, 0.1), [r(0.51, 0.0, 0.1, 0.05)], T, T, "move");
    expect(res.dx).toBeCloseTo(0.01, 6);
    expect(res.dy).toBe(0);
    expect(res.guides).toHaveLength(1);
    expect(res.guides[0].axis).toBe("x");
    expect(res.guides[0].at).toBeCloseTo(0.51, 6);
  });

  it("snaps center-to-center", () => {
    // moving centerX = 0.49; target centerX = 0.5
    const res = snapAlign(r(0.39, 0.4, 0.2, 0.2), [r(0.49, 0.0, 0.02, 0.02)], T, T, "move");
    expect(res.dx).toBeCloseTo(0.01, 6);
    expect(res.guides[0].at).toBeCloseTo(0.5, 6);
  });

  it("snaps to the page center (page passed as a target rect)", () => {
    // moving centerX = 0.49; page centerX = 0.5
    const res = snapAlign(r(0.46, 0.1, 0.06, 0.06), [r(0, 0, 1, 1)], T, T, "move");
    expect(res.dx).toBeCloseTo(0.01, 6);
    expect(res.guides[0].at).toBeCloseTo(0.5, 6);
  });

  it("resize snaps only the dragged right/bottom edge, not the left/top", () => {
    // moving right edge = 0.49; a target left edge at 0.5 → snap; a target near the
    // moving LEFT edge (0.205) must be ignored in resize mode.
    const res = snapAlign(
      r(0.2, 0.2, 0.29, 0.1),
      [r(0.5, 0.0, 0.1, 0.1), r(0.205, 0.0, 0.01, 0.01)],
      T, T, "resize",
    );
    expect(res.dx).toBeCloseTo(0.01, 6); // grows w toward the 0.5 edge
    expect(res.dy).toBe(0);
    expect(res.guides[0].at).toBeCloseTo(0.5, 6);
  });

  it("chooses the nearest target line", () => {
    // moving left = 0.5; targets at 0.515 (d 0.015) and 0.49 (d 0.01) → pick 0.49
    const res = snapAlign(r(0.5, 0.3, 0.1, 0.1), [r(0.515, 0, 0.02, 0.02), r(0.49, 0, 0.02, 0.02)], T, T, "move");
    expect(res.guides[0].at).toBeCloseTo(0.49, 6);
    expect(res.dx).toBeCloseTo(-0.01, 6);
  });

  it("does not snap beyond the threshold", () => {
    const res = snapAlign(r(0.5, 0.3, 0.1, 0.1), [r(0.9, 0.9, 0.05, 0.05)], T, T, "move");
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.guides).toEqual([]);
  });

  it("snaps X and Y independently to different targets", () => {
    const res = snapAlign(
      r(0.39, 0.39, 0.2, 0.2), // centerX 0.49, centerY 0.49
      [r(0.49, 0.0, 0.02, 0.02) /* centerX 0.5 */, r(0.0, 0.48, 0.02, 0.04) /* centerY 0.5 */],
      T, T, "move",
    );
    expect(res.dx).toBeCloseTo(0.01, 6);
    expect(res.dy).toBeCloseTo(0.01, 6);
    expect(res.guides).toHaveLength(2);
  });

  it("returns no snap when there are no targets", () => {
    const res = snapAlign(r(0.5, 0.3, 0.1, 0.1), [], T, T, "move");
    expect(res).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "snapAlign"`
Expected: FAIL — `snapAlign is not a function`.

- [ ] **Step 3: Implement `snapAlign`**

In `lib/annotations.ts`, add (near the other snap helpers, after `snapAxisVector`):

```ts
/** An axis-aligned rectangle in normalized 0–1 page coordinates. */
export interface Rect { x: number; y: number; w: number; h: number }

/** A smart-guide line to draw while dragging (full-page extent in v1). */
export interface GuideLine { axis: "x" | "y"; at: number }

export interface SnapResult { dx: number; dy: number; guides: GuideLine[] }

/** Nearest target line to any source line within `thr`; returns the signed delta
 *  (target − source) and the matched target coordinate, or null. */
function nearestLine(
  src: number[],
  tgt: number[],
  thr: number,
): { delta: number; at: number } | null {
  let bestDist = Infinity;
  let out: { delta: number; at: number } | null = null;
  for (const s of src) {
    for (const t of tgt) {
      const d = Math.abs(t - s);
      if (d <= thr && d < bestDist) {
        bestDist = d;
        out = { delta: t - s, at: t };
      }
    }
  }
  return out;
}

/**
 * Figma-style alignment snap for a rectangular surface. Compares the moving
 * rect's reference lines to every target's edges + centers, per axis, and returns
 * the position/size delta to apply plus one guide per snapped axis. `move` snaps
 * all six lines; `resize` snaps only the dragged right (X) and bottom (Y) edges.
 * Pure. `targets` should already exclude the moving surface itself.
 */
export function snapAlign(
  moving: Rect,
  targets: Rect[],
  thrX: number,
  thrY: number,
  mode: "move" | "resize",
): SnapResult {
  const srcX = mode === "resize"
    ? [moving.x + moving.w]
    : [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const srcY = mode === "resize"
    ? [moving.y + moving.h]
    : [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const tgtX = targets.flatMap((t) => [t.x, t.x + t.w / 2, t.x + t.w]);
  const tgtY = targets.flatMap((t) => [t.y, t.y + t.h / 2, t.y + t.h]);
  const bx = nearestLine(srcX, tgtX, thrX);
  const by = nearestLine(srcY, tgtY, thrY);
  const guides: GuideLine[] = [];
  if (bx) guides.push({ axis: "x", at: bx.at });
  if (by) guides.push({ axis: "y", at: by.at });
  return { dx: bx ? bx.delta : 0, dy: by ? by.delta : 0, guides };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "snapAlign"`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (a pre-existing `lib/use-auto-fit.ts` warning is acceptable).

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: snapAlign — pure object-alignment snap + guide lines"
```

---

### Task 2: Editor wiring — target collection, move/resize snapping, guides, Alt bypass

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx`
- Modify: `components/editor/editor.css`

**Interfaces:**
- Consumes: `snapAlign`, `Rect`, `GuideLine` (Task 1); existing `updateAnnotation`, `scale` prop, `snapPoint`, `snapAxisVector`.
- Produces: no new exports. Verified by typecheck/lint/build + the Task 3 visual gate (pointer-driven UI; not unit-tested, consistent with the existing handle code).

- [ ] **Step 1: Extend imports and add constants + a target collector**

In `components/editor/PreviewAnnotations.tsx`:

Add to the `@/lib/annotations` import: `snapAlign`, and to the type imports add `Rect, GuideLine` (they come from `@/lib/annotations`, alongside the existing value imports — add `import type { GuideLine, Rect } from "@/lib/annotations";` if a separate type import reads cleaner, or include them in the existing import).

Just below the existing `clamp01` definition, add:

```ts
/** Screen-space snap radius (px) for alignment; converted to normalized per axis. */
const SNAP_PX = 6;

/** Alignment snap targets in normalized page coords: other rectangular surfaces
 *  (excluding the dragged one), the measured grid cells + primary image slots, and
 *  the page itself. Measured once at drag-start (targets are static during a drag). */
function collectSnapTargets(
  pageEl: HTMLElement,
  annotations: Annotation[],
  excludeId: string,
): Rect[] {
  const pr = pageEl.getBoundingClientRect();
  const norm = (b: DOMRect): Rect => ({
    x: (b.left - pr.left) / pr.width,
    y: (b.top - pr.top) / pr.height,
    w: b.width / pr.width,
    h: b.height / pr.height,
  });
  const rects: Rect[] = [{ x: 0, y: 0, w: 1, h: 1 }]; // the page
  for (const an of annotations) {
    if (an.id === excludeId) continue;
    if (an.kind === "box" || an.kind === "diamond" || an.kind === "text" || an.kind === "bracket") {
      rects.push({ x: an.x, y: an.y, w: an.w, h: an.h });
    }
  }
  pageEl.querySelectorAll<HTMLElement>(".grid-cell, .img-slot").forEach((el) => {
    rects.push(norm(el.getBoundingClientRect()));
  });
  return rects;
}
```

- [ ] **Step 2: Carry targets + active guides in state**

Extend the `drag` ref shape to hold the measured targets:

```ts
  const drag = useRef<{
    id: string;
    part: Part;
    grabX: number;
    grabY: number;
    wp?: number;
    baseSeg?: number;
    axis?: "h" | "v";
    targets?: Rect[];
  } | null>(null);
```

Add guide state near the other `useState`s:

```ts
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);
```

- [ ] **Step 3: Measure targets at drag-start (move/resize only)**

In `startDrag`, after computing `grabX`/`grabY` and before assigning `drag.current`, measure targets for surface move/resize:

```ts
    let targets: Rect[] | undefined;
    if (part === "move" || part === "resize") {
      const pageEl = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
      if (pageEl) targets = collectSnapTargets(pageEl, annotations, id);
    }
    drag.current = { id, part, grabX, grabY, targets };
```

(Replace the existing `drag.current = { id, part, grabX, grabY };` line.)

- [ ] **Step 4: Apply alignment snap on surface move/resize + Alt bypass on connectors**

Change `apply`'s signature to accept `alt` and thread it through. The current signature is `const apply = (p, shift = false) => {`; make it `const apply = (p: { x: number; y: number }, shift = false, alt = false) => {`.

Just inside `apply`, after `const a = ...; if (!a) return;`, compute the thresholds (uses the `scale` prop and `W`/`H` already in scope):

```ts
    const thrX = SNAP_PX / (W * scale);
    const thrY = SNAP_PX / (H * scale);
```

In the `a.kind !== "connector"` block, replace the `move` branch and the box/bracket resize `else` branch to run `snapAlign` (guarded by `!alt && d.targets`), and set guides:

```ts
      if (d.part === "move") {
        let x = clamp01(p.x - d.grabX);
        let y = clamp01(p.y - d.grabY);
        let guides: GuideLine[] = [];
        if (!alt && d.targets) {
          const s = snapAlign({ x, y, w: a.w, h: a.h }, d.targets, thrX, thrY, "move");
          x = clamp01(x + s.dx);
          y = clamp01(y + s.dy);
          guides = s.guides;
        }
        setActiveGuides(guides);
        updateAnnotation(ci, si, d.id, { x, y });
      } else if (a.kind === "line") {
        setActiveGuides([]);
        const { dx: w, dy: h } = snapAxisVector(p.x - a.x, p.y - a.y, shift);
        updateAnnotation(ci, si, d.id, { w, h });
      } else {
        let w = Math.max(0.01, p.x - a.x);
        let h = Math.max(0.005, p.y - a.y);
        let guides: GuideLine[] = [];
        if (!alt && d.targets) {
          const s = snapAlign({ x: a.x, y: a.y, w, h }, d.targets, thrX, thrY, "resize");
          w = Math.max(0.01, w + s.dx);
          h = Math.max(0.005, h + s.dy);
          guides = s.guides;
        }
        setActiveGuides(guides);
        updateAnnotation(ci, si, d.id, { w, h });
      }
      return;
```

In the connector part of `apply` (the `snapPoint` section), wrap it so Alt places a raw free point. Replace:

```ts
    const snap = snapPoint(surfaces, p, 0.025);
    const cur = d.part === "from" ? a.from : a.to;
    let ep: Endpoint;
    if (snap.ref) {
      ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
    } else {
      const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
      const { dx, dy } = snapAxisVector(snap.x - other.x, snap.y - other.y, shift);
      ep = { style: cur.style, size: cur.size, x: other.x + dx, y: other.y + dy };
    }
    updateAnnotation(ci, si, d.id, { [d.part]: ep });
```

with:

```ts
    const cur = d.part === "from" ? a.from : a.to;
    let ep: Endpoint;
    if (alt) {
      ep = { style: cur.style, size: cur.size, x: p.x, y: p.y };
    } else {
      const snap = snapPoint(surfaces, p, 0.025);
      if (snap.ref) {
        ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
      } else {
        const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
        const { dx, dy } = snapAxisVector(snap.x - other.x, snap.y - other.y, shift);
        ep = { style: cur.style, size: cur.size, x: other.x + dx, y: other.y + dy };
      }
    }
    updateAnnotation(ci, si, d.id, { [d.part]: ep });
```

(The `seg`/`wp` connector branches above this are unchanged.)

- [ ] **Step 5: Read Alt in `onMove` and clear guides on `onUp`**

In `onMove`, capture `altKey` and pass it:

```ts
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toN(e);
    const shift = e.shiftKey;
    const alt = e.altKey;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(p, shift, alt));
  };
```

In `onUp`, clear the guides (add alongside the existing cleanup):

```ts
    setActiveGuides([]);
```

- [ ] **Step 6: Render the guide lines**

In the returned SVG, add the guides (near the top of the children, before or after the hit-areas — they are `pointer-events:none`):

```tsx
      {activeGuides.map((g, i) =>
        g.axis === "x" ? (
          <line key={`guide-${i}`} x1={g.at * W} y1={0} x2={g.at * W} y2={H} className="preview-anno-guide" />
        ) : (
          <line key={`guide-${i}`} x1={0} y1={g.at * H} x2={W} y2={g.at * H} className="preview-anno-guide" />
        ),
      )}
```

- [ ] **Step 7: Add the guide style**

In `components/editor/editor.css`, after the `.preview-anno-seg` rules (added in P3), add:

```css
.preview-anno-guide {
  stroke: #e5484d;
  stroke-width: 1;
  pointer-events: none;
  shape-rendering: crispEdges;
}
```

- [ ] **Step 8: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (no unused imports; pre-existing `use-auto-fit.ts` warning only).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "feat: alignment snapping + smart guides for surface move/resize; Alt bypass"
```

---

### Task 3: ADR-004 amendment, ROADMAP, visual verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–2. No code.

- [ ] **Step 1: Visual gate**

Start `pnpm dev`. In the editor over a **grid** step: draw/select a box, drag it near another surface, a grid cell edge, and a primary image → confirm it snaps and a red guide line appears at the alignment; drag its resize handle so the right edge nears a cell edge → snaps. Hold **Alt** → no snap, no guide. Select a connector, drag an endpoint over a surface without hitting an anchor → it drops freely; with Alt it never snaps. Open `/print` for that project → confirm **no guide lines** render.

If the browser extension/Playwright is available, drive a pointer drag or at least screenshot the editor; otherwise verify manually. Record the outcome in the commit message.

Expected: surfaces snap + guides show in-editor only; connectors stay free; print is clean.

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-01): object alignment snapping + smart guides

Moving or resizing a rectangular surface (box, diamond, text, bracket) now snaps
its edges/center to alignment lines from other surfaces, the grid cells and primary
image slots beneath, and the page (center + edges), with Figma-style guide lines.

- **Pure geometry (`lib/annotations.ts`):** `snapAlign(moving, targets, thrX, thrY,
  mode)` returns `{ dx, dy, guides }` — the per-axis nearest-line delta plus one
  `GuideLine { axis, at }` per snapped axis. `move` snaps all six reference lines;
  `resize` snaps only the dragged right/bottom edge. X and Y resolve independently.
  The helper is target-source-agnostic; the caller supplies the rects.
- **Editor (`PreviewAnnotations.tsx`):** at drag-start it collects targets once —
  data-model rectangular surfaces (excluding the dragged one) + DOM-measured
  `.grid-cell`/`.img-slot` rects (normalized against the page rect, the same
  measurement `PreviewGridResize` uses) + the page `{0,0,1,1}`. The threshold is
  screen-consistent (`SNAP_PX = 6` px ÷ on-screen size). Guides render as transient
  red lines and clear on pointer-up. **Editor-only — nothing prints** (guides live
  in `PreviewAnnotations`, not `AnnotationLayer`). **No schema change.**
- **Connectors stay free:** endpoints are neither source nor target of alignment
  snapping; behavior is unchanged (anchor-snap-or-free).
- **Alt = universal bypass:** disables alignment for surfaces and the anchor/axis
  snap for connectors, giving fully-free placement on demand.

Out of scope (future): fixed-grid snapping, distribution/equal-spacing guides,
connector binding to cells/objects, object-spanning guide extent.
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, mark the "Annotation snapping — more options" backlog item done for the alignment + smart-guides portion (note fixed-grid snapping remains a separate item).

- [ ] **Step 4: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 alignment-snapping amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- Object alignment + smart guides for move+resize → Task 1 (`snapAlign`) + Task 2 (wiring/guides).
- Targets = surfaces + grid cell borders + primary objects + page → Task 2 `collectSnapTargets` (data surfaces + `.grid-cell` + `.img-slot` + page rect).
- Screen-consistent threshold → Task 2 `SNAP_PX / (W*scale)`.
- Connectors stay free + Alt universal bypass → Task 2 (connector branch + `onMove` altKey).
- Guides editor-only, no print, no schema change → Task 2 (guides in PreviewAnnotations) + Global Constraints.
- ADR + ROADMAP → Task 3.
- Out-of-scope items (grid snapping, distribution, connector binding, object-spanning guides) → not implemented. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; tests show exact expected values (toBeCloseTo for float deltas). ✓

**3. Type consistency:** `Rect {x,y,w,h}`, `GuideLine {axis,at}`, `SnapResult {dx,dy,guides}`, `snapAlign(moving, targets, thrX, thrY, mode)`, `collectSnapTargets(pageEl, annotations, excludeId) → Rect[]`, `apply(p, shift, alt)` are used identically across Tasks 1–2. The editor passes `mode:"move"|"resize"` matching the helper. ✓
