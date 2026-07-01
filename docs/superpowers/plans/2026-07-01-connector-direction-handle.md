# Connector Direction Drag Handle — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-canvas direction knob at each endpoint of a focused square connector — drag it to snap the endpoint's `dir` (the way the connector runs / the arrow points).

**Architecture:** A pure `compassDir(dx, dy)` snap helper in `lib/annotations.ts`; an editor-only knob in `PreviewAnnotations.tsx` (a new `"dir"` drag part) that reads each endpoint's run direction from `connectorRoute` and writes `Endpoint.dir` (from Phase 1). No schema change; nothing new renders in print.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (unit), Playwright/manual (visual).

## Global Constraints

- **Reuses Phase-1 `Endpoint.dir`** — NO schema change, no `CURRENT_SCHEMA_VERSION` bump.
- **Editor-only:** all changes in `PreviewAnnotations.tsx` / `editor.css` / a pure helper; the renderer (`AnnotationLayer.tsx`) and print path are untouched. The knob never renders in print.
- **Square-only:** the knob shows only for `routing === "square"` connectors when focused.
- **Clearing to auto stays on the panel** (Phase 1 "auto dir"); the knob only sets a direction.
- `KNOB_PX = 24` screen-px stem length. `compassDir` snaps to the dominant axis; on an exact tie, horizontal wins.
- Immutable store updates via `updateAnnotation`. Commit type `feat` for code, `docs` for ADR/ROADMAP. No AI attribution. Do not `git push`.

---

### Task 1: Pure `compassDir` helper

**Files:**
- Modify: `lib/annotations.ts` (add `compassDir`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Produces: `function compassDir(dx: number, dy: number): "left" | "right" | "up" | "down"` — snaps a vector to the nearest compass axis (dominant axis + sign; exact tie → horizontal).

- [ ] **Step 1: Write the failing tests**

In `lib/annotations.test.ts`, extend the existing `@/lib/annotations` import with `compassDir`, then add:

```ts
describe("compassDir", () => {
  it("snaps to the four axes", () => {
    expect(compassDir(0.1, 0)).toBe("right");
    expect(compassDir(-0.1, 0)).toBe("left");
    expect(compassDir(0, 0.1)).toBe("down");
    expect(compassDir(0, -0.1)).toBe("up");
  });
  it("picks the dominant axis", () => {
    expect(compassDir(0.1, 0.05)).toBe("right");
    expect(compassDir(0.05, -0.1)).toBe("up");
  });
  it("breaks an exact tie toward horizontal", () => {
    expect(compassDir(0.1, 0.1)).toBe("right");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "compassDir"`
Expected: FAIL — `compassDir is not a function`.

- [ ] **Step 3: Implement `compassDir`**

In `lib/annotations.ts`, add (near the other pure geometry helpers):

```ts
/** Snap a vector to the nearest compass direction (dominant axis + sign; an exact
 *  tie resolves toward horizontal). Used to turn a direction-knob drag into an
 *  `Endpoint.dir` value. */
export function compassDir(dx: number, dy: number): "left" | "right" | "up" | "down" {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "compassDir"`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (pre-existing `lib/use-auto-fit.ts` warning acceptable).

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: compassDir — snap a vector to a compass direction"
```

---

### Task 2: Editor — direction knob + drag

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx`
- Modify: `components/editor/editor.css`

**Interfaces:**
- Consumes: `compassDir` (Task 1); existing `connectorRoute`, `resolveEndpoint`, `updateAnnotation`, `Endpoint`, `Connector`.
- Produces: no new exports. Verified by typecheck/lint/build + the Task 3 in-browser check.

- [ ] **Step 1: Imports, `Part`, `KNOB_PX`, drag-ref field**

In `components/editor/PreviewAnnotations.tsx`:
- Add `compassDir` to the value import from `@/lib/annotations`.
- Change the `Part` type (line 39) to add `"dir"`:

```ts
type Part = "move" | "resize" | "from" | "to" | "wp" | "seg" | "dir";
```

- Below the existing `const SNAP_PX = 6;` / `const POINT_SNAP_PX = 8;` constants, add:

```ts
/** Screen-px stem length of the endpoint direction knob. */
const KNOB_PX = 24;
```

- Extend the `drag` ref shape to carry the endpoint side for a dir drag — add `which?: "from" | "to";` to the object type:

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
    which?: "from" | "to";
  } | null>(null);
```

- [ ] **Step 2: Add `startDirDrag`**

After `startSeg` (ends at ~line 231), add:

```ts
  const startDirDrag =
    (id: string, which: "from" | "to") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { id, part: "dir", grabX: 0, grabY: 0, which };
      svgRef.current?.setPointerCapture(e.pointerId);
    };
```

- [ ] **Step 3: Handle the dir drag in `apply`**

In `apply`, in the connector branches, add a `"dir"` branch immediately after the `wp` branch (after the block that ends at the `updateAnnotation(ci, si, d.id, { waypoints: wps }); return; }` around line 287, before `const cur = d.part === "from" ? a.from : a.to;`):

```ts
    if (d.part === "dir" && d.which) {
      const curEp = a[d.which];
      const ep0 = resolveEndpoint(annotations, curEp);
      const dir = compassDir(p.x - ep0.x, p.y - ep0.y);
      updateAnnotation(ci, si, d.id, { [d.which]: { ...curEp, dir } });
      return;
    }
```

(`a` is already narrowed to `Connector` here — the `a.kind !== "connector"` branch returned earlier; `resolveEndpoint` is already imported.)

- [ ] **Step 4: Render the direction knobs**

In the focused-connector JSX (inside `focused.kind === "connector" ? (<> … </>)`), after the segment-handle block (the `segHandleMode ? (…) : (…waypoints…)` expression), add the knobs for square connectors:

```tsx
            {(focused as Connector).routing === "square"
              ? (() => {
                  const pts = connectorRoute(annotations, focused as Connector).points;
                  return (["from", "to"] as const).map((which) => {
                    const ep = resolveEndpoint(annotations, (focused as Connector)[which]);
                    const [pA, pB] =
                      which === "from"
                        ? [pts[0], pts[1]]
                        : [pts[pts.length - 2], pts[pts.length - 1]];
                    const dx = pA && pB ? pB.x - pA.x : 0;
                    const dy = pA && pB ? pB.y - pA.y : 0;
                    const ux = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
                    const uy = ux === 0 ? Math.sign(dy) : 0;
                    if (ux === 0 && uy === 0) return null; // no derivable direction
                    const ex = ep.x * W;
                    const ey = ep.y * H;
                    const kx = ex + ux * KNOB_PX;
                    const ky = ey + uy * KNOB_PX;
                    return (
                      <g key={`dir-${which}`}>
                        <line
                          x1={ex}
                          y1={ey}
                          x2={kx}
                          y2={ky}
                          className="preview-anno-dir-stem"
                        />
                        <circle
                          cx={kx}
                          cy={ky}
                          r={5}
                          className="preview-anno-dir"
                          onPointerDown={startDirDrag(focused.id, which)}
                        />
                      </g>
                    );
                  });
                })()
              : null}
```

- [ ] **Step 5: Add the knob styles**

In `components/editor/editor.css`, after the `.preview-anno-seg` rules, add:

```css
.preview-anno-dir {
  fill: #fff;
  stroke: var(--color-accent, #658995);
  stroke-width: 2;
  cursor: grab;
  pointer-events: auto;
}
.preview-anno-dir:active {
  cursor: grabbing;
}
.preview-anno-dir-stem {
  stroke: var(--color-accent, #658995);
  stroke-width: 1.5;
  pointer-events: none;
  opacity: 0.6;
}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (no unused imports; pre-existing `use-auto-fit.ts` warning only).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "feat: on-canvas direction knob for square connector endpoints"
```

---

### Task 3: ADR-004 amendment, ROADMAP, in-browser verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–2. No code.

- [ ] **Step 1: In-browser verification**

Start `pnpm dev`. On a grid step, focus a square connector. Confirm a knob-on-a-stem appears at each endpoint. Drag the **To** knob right/left/up/down → the arrow snaps to each direction (and the panel's To value follows). Drag the **From** knob → the leave direction changes. Open `/print` → no knob renders. Record the outcome in the commit message.

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-01): connector direction drag handle (Phase 2)

Completes the endpoint-direction feature: an on-canvas direction knob to set
`Endpoint.dir` spatially (Phase 1 shipped the panel control).

- **Editor-only (`PreviewAnnotations.tsx`):** a focused `square` connector shows a
  draggable knob on a short stem (`KNOB_PX = 24`) at each endpoint, positioned along
  the endpoint's current run direction (derived from `connectorRoute`'s first/last
  segment, so it reflects `dir` or the auto route). A new `"dir"` drag part snaps the
  `(pointer − endpoint)` vector via the pure `compassDir(dx, dy)` helper
  (`lib/annotations.ts`) and writes `ep.dir` — uniform "drag the way it runs here"
  (the routing's role-aware `anchorDir` handles the from/to sign). Clearing to auto
  stays on the panel.
- **Reuses Phase-1 `dir`; no schema change; no renderer/print change** (the knob is
  editor chrome). Square-only.
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, mark the endpoint direction override **Phase 2 (drag handle)** done; note the direction-override feature is complete (panel + on-canvas).

- [ ] **Step 4: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 direction drag handle amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- Knob on a stem per endpoint, square-only, run direction from route → Task 2 Step 4.
- Drag → `compassDir` snap → write `ep.dir` → Task 1 + Task 2 Step 3.
- Clear-to-auto on the panel (knob only sets) → Task 2 (no clearing gesture).
- No schema change, editor-only, no print → Global Constraints + Task 2 (no renderer change).
- ADR + ROADMAP → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO; complete code in every step; tests show exact expected values. ✓

**3. Type consistency:** `compassDir(dx, dy) → union`, `Part` includes `"dir"`, drag-ref `which?: "from"|"to"`, `startDirDrag(id, which)`, `apply` `"dir"` branch, knob reads `connectorRoute(...).points`. All consistent across Tasks 1–2. ✓
