# Connector Grid-Content Snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a connector endpoint snap to grid-content anchors (cell borders, screenshots, callouts, text blocks) and land as a free point, with snap dots shown on that content when a connector is focused.

**Architecture:** Two pure helpers in `lib/annotations.ts` — `rectAnchors(rect)` (the 9 anchor points of a rectangle) and `nearestPoint(p, points, thr)`. The editor (`PreviewAnnotations.tsx`) measures grid-content rects (`.grid-cell`/`.img-slot`/`.callout`/`.grid-text`) via `getBoundingClientRect` into a `gridAnchors` state when a connector is focused, renders snap dots there, and in the connector-endpoint drag snaps to the nearest grid anchor (storing a free point) — after drawn-surface binding, before the axis-snap fallback. Editor-only; no schema change; renders identically in print.

**Tech Stack:** TypeScript, React 19, Zustand store, Vitest (unit), Playwright/manual (visual). Pure helpers unit-tested; editor wiring verified by typecheck/lint/build + an in-browser check.

## Global Constraints

- **Snap-and-stay:** grid-content snaps store an absolute free `{x, y}` — NOT a binding; no re-tracking when the content later moves. Drawn-shape binding via `ref`+`anchor` is unchanged.
- **No schema change**, no `CURRENT_SCHEMA_VERSION` bump, no migration.
- **Editor-only:** grid anchors are DOM-measured during editing; `components/renderer/AnnotationLayer.tsx` and the print path are UNCHANGED. A grid snap produces a plain free-point endpoint that resolves identically in the PDF.
- **Precedence:** drawn-surface anchor (binds) → grid-content anchor (free point) → axis-snap fallback. **Alt** bypasses all snapping (raw free point) — unchanged.
- **Grid-content targets:** `.grid-cell`, `.img-slot`, `.callout`, `.grid-text`. Each contributes the 9 box anchors (corners + edge midpoints + center).
- **Threshold:** `POINT_SNAP_PX = 8` screen px, converted to normalized via the on-screen size (`W * scale`).
- Commit type `feat` for code, `docs` for ADR/ROADMAP. No AI attribution. Do not `git push`.

---

### Task 1: Pure `rectAnchors` + `nearestPoint` helpers

**Files:**
- Modify: `lib/annotations.ts` (add `rectAnchors`, `nearestPoint`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: existing `Rect` and `Point` (both in `lib/annotations.ts`).
- Produces:
  - `function rectAnchors(rect: Rect): Point[]` — the 9 anchor points in this fixed order: top-left, top-center, top-right, mid-left, center, mid-right, bottom-left, bottom-center, bottom-right.
  - `function nearestPoint(p: Point, points: Point[], thr: number): Point | null` — the point closest to `p` within `thr` (Euclidean, normalized); strictly-nearest, first-wins on tie; `null` if none within `thr` (or empty).

- [ ] **Step 1: Write the failing tests**

In `lib/annotations.test.ts`, extend the existing `@/lib/annotations` import with `nearestPoint, rectAnchors`, then add:

```ts
describe("rectAnchors", () => {
  it("returns the 9 box anchors in TL→BR order", () => {
    // r(0.25, 0.25, 0.5, 0.25): right 0.75, bottom 0.5, center (0.5, 0.375)
    expect(rectAnchors({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 })).toEqual([
      { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.25 }, { x: 0.75, y: 0.25 },
      { x: 0.25, y: 0.375 }, { x: 0.5, y: 0.375 }, { x: 0.75, y: 0.375 },
      { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 },
    ]);
  });
});

describe("nearestPoint", () => {
  it("returns the closest point within the threshold", () => {
    expect(
      nearestPoint({ x: 0.5, y: 0.5 }, [{ x: 0.52, y: 0.5 }, { x: 0.9, y: 0.9 }], 0.05),
    ).toEqual({ x: 0.52, y: 0.5 });
  });

  it("returns null when every point is beyond the threshold", () => {
    expect(nearestPoint({ x: 0.5, y: 0.5 }, [{ x: 0.9, y: 0.9 }], 0.05)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(nearestPoint({ x: 0.5, y: 0.5 }, [], 0.05)).toBeNull();
  });

  it("returns the first of two equidistant points (deterministic tie)", () => {
    // both at distance 0.125 from x=0.5
    expect(
      nearestPoint({ x: 0.5, y: 0.5 }, [{ x: 0.375, y: 0.5 }, { x: 0.625, y: 0.5 }], 0.2),
    ).toEqual({ x: 0.375, y: 0.5 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "rectAnchors|nearestPoint"`
Expected: FAIL — `rectAnchors is not a function`.

- [ ] **Step 3: Implement the helpers**

In `lib/annotations.ts`, add (near the other snap helpers — e.g. after `nearestLine`/`snapAlign`):

```ts
/** The 9 anchor points of a rectangle: 4 corners, 4 edge midpoints, center.
 *  Order: top-left, top-center, top-right, mid-left, center, mid-right,
 *  bottom-left, bottom-center, bottom-right. */
export function rectAnchors(rect: Rect): Point[] {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = x + w;
  const b = y + h;
  return [
    { x, y }, { x: cx, y }, { x: r, y },
    { x, y: cy }, { x: cx, y: cy }, { x: r, y: cy },
    { x, y: b }, { x: cx, y: b }, { x: r, y: b },
  ];
}

/** The point nearest to `p` within `thr` (Euclidean, normalized), or null.
 *  Strictly-nearest; first wins on an exact tie. */
export function nearestPoint(p: Point, points: Point[], thr: number): Point | null {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const q of points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= thr && d < bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "rectAnchors|nearestPoint"`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (pre-existing `lib/use-auto-fit.ts` warning acceptable).

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: rectAnchors + nearestPoint helpers for point snapping"
```

---

### Task 2: Editor — grid-anchor measurement, snap dots, connector-drag grid snap

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx`

**Interfaces:**
- Consumes: `rectAnchors`, `nearestPoint`, `Point`, `Rect` (Task 1 / existing); existing `snapPoint`, `snapAxisVector`, `updateAnnotation`, `scale` prop.
- Produces: no new exports. Verified by typecheck/lint/build + the Task 3 in-browser check (pointer-driven UI; not unit-tested, consistent with the existing handle code).

- [ ] **Step 1: Extend imports and add the point-snap constant**

In `components/editor/PreviewAnnotations.tsx`:
- Add `nearestPoint, rectAnchors` to the value import from `@/lib/annotations`.
- Ensure `Point` is imported as a type from `@/lib/annotations` (add it to the existing type import alongside `Rect`/`GuideLine`).

Below the existing `const SNAP_PX = 6;` (added by the alignment feature), add:

```ts
/** Screen-space snap radius (px) for connector-endpoint → grid-content anchors. */
const POINT_SNAP_PX = 8;
```

- [ ] **Step 2: Add `gridAnchors` state**

Next to the existing `const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);`, add:

```ts
  const [gridAnchors, setGridAnchors] = useState<Point[]>([]);
```

- [ ] **Step 3: Measure grid anchors when a connector is focused**

After the existing page-rect `useLayoutEffect` (the one that calls `setRect(...)`), add a second effect:

```ts
  // Grid-content anchor points (cells, screenshots, callouts, text) for the
  // focused connector's endpoint snapping + snap dots. DOM-measured, editor-only.
  useLayoutEffect(() => {
    const focusedAnno = annotations.find((a) => a.id === selectedId);
    const el = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    if (focusedAnno?.kind !== "connector" || !el) {
      setGridAnchors([]);
      return;
    }
    const pr = el.getBoundingClientRect();
    if (!pr.width || !pr.height) {
      setGridAnchors([]);
      return;
    }
    const anchors: Point[] = [];
    el.querySelectorAll<HTMLElement>(".grid-cell, .img-slot, .callout, .grid-text").forEach(
      (node) => {
        const b = node.getBoundingClientRect();
        const r: Rect = {
          x: (b.left - pr.left) / pr.width,
          y: (b.top - pr.top) / pr.height,
          w: b.width / pr.width,
          h: b.height / pr.height,
        };
        anchors.push(...rectAnchors(r));
      },
    );
    setGridAnchors(anchors);
  }, [scalerRef, pageIndex, fitKey, scale, selectedId, annotations]);
```

- [ ] **Step 4: Snap the connector endpoint to grid anchors**

In `apply`, the connector-endpoint `else` branch currently reads:

```ts
    } else {
      const snap = snapPoint(surfaces, p, 0.025);
      if (snap.ref) {
        ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
      } else {
        // Axis-snap a free endpoint into line with the opposite endpoint, so a
        // perfectly horizontal/vertical connector is easy to make. The snap is
        // angle-based (Shift hard-locks the dominant axis), so a shallow angle
        // holds at any connector length.
        const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
        const { dx, dy } = snapAxisVector(snap.x - other.x, snap.y - other.y, shift);
        ep = { style: cur.style, size: cur.size, x: other.x + dx, y: other.y + dy };
      }
    }
```

Replace the inner `else` with a grid-anchor snap that falls back to the axis-snap:

```ts
    } else {
      const snap = snapPoint(surfaces, p, 0.025);
      if (snap.ref) {
        ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
      } else {
        const gp = nearestPoint(p, gridAnchors, POINT_SNAP_PX / (W * scale));
        if (gp) {
          // Snap to a grid-content anchor (cell/screenshot/callout/text) as a
          // free point — snap-and-stay, no binding.
          ep = { style: cur.style, size: cur.size, x: gp.x, y: gp.y };
        } else {
          // Axis-snap a free endpoint into line with the opposite endpoint, so a
          // perfectly horizontal/vertical connector is easy to make. The snap is
          // angle-based (Shift hard-locks the dominant axis), so a shallow angle
          // holds at any connector length.
          const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
          const { dx, dy } = snapAxisVector(snap.x - other.x, snap.y - other.y, shift);
          ep = { style: cur.style, size: cur.size, x: other.x + dx, y: other.y + dy };
        }
      }
    }
```

(The `alt` bypass above this and the `seg`/`wp` branches are unchanged.)

- [ ] **Step 5: Render snap dots on grid content**

The focused-connector snap dots currently render only drawn-surface anchors:

```tsx
      {showSnap
        ? surfaces.flatMap((s) =>
            surfaceAnchors(s).map((an) => {
              const ap = anchorPoint(s, an);
              return (
                <circle
                  key={`${s.id}-${an}`}
                  cx={ap.x * W}
                  cy={ap.y * H}
                  r={3.5}
                  className="preview-anno-snap"
                />
              );
            }),
          )
        : null}
```

Immediately after that block, add grid-content dots:

```tsx
      {showSnap
        ? gridAnchors.map((gp, i) => (
            <circle
              key={`grid-snap-${i}`}
              cx={gp.x * W}
              cy={gp.y * H}
              r={3.5}
              className="preview-anno-snap"
            />
          ))
        : null}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (no unused imports; pre-existing `use-auto-fit.ts` warning only).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx
git commit -m "feat: connector endpoints snap to grid-content anchors + snap dots"
```

---

### Task 3: ADR-004 amendment, ROADMAP, in-browser verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–2. No code.

- [ ] **Step 1: In-browser verification**

Start `pnpm dev`. In the editor over a **grid** step, focus a connector (select it) → snap dots should appear on cells, screenshots, callouts, and text blocks. Drag an endpoint near a cell edge / screenshot / callout → it snaps to that anchor and drops as a **free point** (the `from`/`to` panel still shows `free point` with the snapped x/y). Hold **Alt** → no snap. Draw a Box and snap an endpoint to it → still binds (`ref` shown). Open `/print` → the connector renders identically, no dots. Record the outcome in the commit message.

(If the browser extension/Playwright is available, drive it; otherwise this is a manual check.)

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-01): connector endpoints snap to grid content

Connector endpoints now snap to **grid-content** anchors — cell borders, screenshots
(`.img-slot`), callouts, and text blocks — landing as a **free point**
(snap-and-stay, no binding). Drawn-Surface binding (`ref`+`anchor`) and the Alt
bypass are unchanged.

- **Pure helpers (`lib/annotations.ts`):** `rectAnchors(rect)` (the 9 box anchor
  points) and `nearestPoint(p, points, thr)` (closest within threshold, or null).
- **Editor (`PreviewAnnotations.tsx`):** when a connector is focused, a
  `useLayoutEffect` measures `.grid-cell`/`.img-slot`/`.callout`/`.grid-text` rects
  (normalized to the page rect) and flattens `rectAnchors` into `gridAnchors`; those
  points render as snap dots (same `.preview-anno-snap` style) so targets are
  visible. The endpoint drag snaps in precedence order: drawn-surface anchor (binds)
  → grid-content anchor (free point, via `nearestPoint`, `POINT_SNAP_PX = 8` px ÷
  on-screen size) → axis-snap fallback.
- **No schema change; editor-only.** A grid snap stores a plain free `{x, y}` that
  resolves identically in the PDF; the renderer/print path is untouched. Grid content
  isn't re-tracked (snap-and-stay).

Out of scope (future): true binding/re-tracking of a connector to grid content;
binding to sub-parts of a callout.
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, note connector→grid-content snapping done (snap-and-stay); true-binding re-tracking remains a possible future item.

- [ ] **Step 4: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 connector grid-content snapping amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- Snap-and-stay free point → Task 2 (grid snap stores `{x,y}`).
- Targets = cells/screenshots/callouts/text → Task 2 (`.grid-cell, .img-slot, .callout, .grid-text`).
- Snap dots visible → Task 2 (Step 5).
- Pure `rectAnchors`/`nearestPoint` → Task 1.
- Precedence surface→grid→axis; Alt bypass; screen-consistent threshold → Task 2 (Step 4).
- No schema change, editor-only, prints as-is → Global Constraints + Task 2 (no renderer change).
- ADR + ROADMAP → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; tests show exact expected values (exact fractions chosen to avoid float error). ✓

**3. Type consistency:** `rectAnchors(rect: Rect): Point[]`, `nearestPoint(p: Point, points: Point[], thr: number): Point | null`, `gridAnchors: Point[]`, `POINT_SNAP_PX` used identically across Tasks 1–2. The editor passes the same normalized `Rect` shape into `rectAnchors` that `collectSnapTargets` already produces. ✓
