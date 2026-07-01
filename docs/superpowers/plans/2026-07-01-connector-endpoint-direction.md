# Connector Endpoint Direction Override — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author set an explicit direction (auto / ← / → / ↑ / ↓) on a square connector's endpoint so the arrow points the chosen way, instead of only the dominant-axis heuristic.

**Architecture:** Additive `Endpoint.dir` field; the pure routing helpers `anchorAxis`/`anchorDir` (in `lib/annotations.ts`) honor `dir` even for free points (precedence explicit `dir` → anchor edge → heuristic); `squareRoute` gains sign-forcing single-directed routes so `←` vs `→` genuinely differ. Data-driven, so editor preview and printed PDF route identically; the renderer is untouched. A direction control is added to the connector inspector's From/To rows.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (unit), Playwright/manual (visual).

## Global Constraints

- **Additive schema:** `Endpoint.dir?: "left" | "right" | "up" | "down"`. No `CURRENT_SCHEMA_VERSION` bump, no migration. Absent = today's behavior.
- **No regression for existing connectors:** the new sign-forcing routes are gated on an **explicit `dir`** (`from.dir` / `to.dir`), NOT on `anchorDir`. Anchored connectors (no `dir`) and free-no-`dir` connectors route byte-identically to today.
- **Square-only:** `dir` affects only `routing === "square"`. Straight connectors are unaffected.
- **Editor + print parity:** `dir` flows through `connectorPoints`; the renderer (`AnnotationLayer.tsx`) is untouched.
- **Precedence:** explicit `dir` → bound anchor edge → dominant-axis heuristic.
- `STUB = 0.04` (existing constant) is reused for sign-forcing.
- Commit type `feat` for code, `docs` for ADR/ROADMAP. No AI attribution. Do not `git push`.

---

### Task 1: Routing — `dir` schema + directed square routing

**Files:**
- Modify: `lib/book-schema.ts` (add `Endpoint.dir`)
- Modify: `lib/annotations.ts` (`DIR_VEC`, `anchorAxis`, `anchorDir`, `directedFromRoute`, `directedToRoute`, `squareRoute`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: existing `Point`, `Endpoint`, `STUB`, `horizontalRoute`, `verticalRoute`, `squareHorizontalFirst`, `connectorPoints`.
- Produces:
  - `Endpoint.dir?: "left" | "right" | "up" | "down"`
  - `anchorAxis(ep)` and `anchorDir(ep, isTo?)` honor `dir` (module-private; behavior tested via `connectorPoints`).
  - `squareRoute` sign-forcing for a single explicitly-directed endpoint.

- [ ] **Step 1: Add the schema field**

In `lib/book-schema.ts`, inside `interface Endpoint`, after the `size?` field, add:

```ts
  /** Overrides square-routing direction at this end (Phase 1). The way the
   *  connector runs here — for `to` the arrowhead points this way; for `from` it
   *  leaves this way. Absent = auto (dominant-axis heuristic). Square routing only. */
  dir?: "left" | "right" | "up" | "down";
```

- [ ] **Step 2: Write the failing tests**

In `lib/annotations.test.ts`, add (the existing `@/lib/annotations` import already provides `connectorPoints`; `Connector` is imported from `@/lib/book-schema`):

```ts
describe("connectorPoints — endpoint direction override (dir)", () => {
  const sq = (from: Connector["from"], to: Connector["to"]): Connector => ({
    id: "c", kind: "connector", stroke: "#000", width: 2, routing: "square", from, to,
  });

  it("to.dir 'right' with target to the right → vertical-first, arrow points right", () => {
    const c = sq({ x: 0.2, y: 0.3, style: "none" }, { x: 0.7, y: 0.6, style: "arrow", dir: "right" });
    expect(connectorPoints([], c)).toEqual([
      { x: 0.2, y: 0.3 }, { x: 0.2, y: 0.6 }, { x: 0.7, y: 0.6 },
    ]); // last segment horizontal, +x
  });

  it("to.dir 'left' with target to the right → stub forces the arrow to point left", () => {
    const c = sq({ x: 0.2, y: 0.3, style: "none" }, { x: 0.7, y: 0.6, style: "arrow", dir: "left" });
    const pts = connectorPoints([], c);
    expect(pts).toHaveLength(4);
    expect(pts[3]).toEqual({ x: 0.7, y: 0.6 });      // ends at b
    expect(pts[2].y).toBe(pts[3].y);                  // last segment horizontal
    expect(pts[2].x).toBeGreaterThan(pts[3].x);       // …travelling −x → arrow points LEFT
    expect(pts[1].x).toBe(pts[2].x);                  // the stub column
  });

  it("no dir → unchanged dominant-axis route (regression)", () => {
    const c = sq({ x: 0.2, y: 0.3, style: "none" }, { x: 0.7, y: 0.6, style: "arrow" });
    expect(connectorPoints([], c)).toEqual([
      { x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.6 },
    ]); // horizontal-first (|Δx|≥|Δy|)
  });

  it("from.dir 'down' → connector leaves downward", () => {
    const c = sq({ x: 0.2, y: 0.3, style: "none", dir: "down" }, { x: 0.7, y: 0.6, style: "arrow" });
    expect(connectorPoints([], c)).toEqual([
      { x: 0.2, y: 0.3 }, { x: 0.2, y: 0.6 }, { x: 0.7, y: 0.6 },
    ]); // first segment vertical, +y (down)
  });

  it("both ends directed → orthogonal route honoring both (from leaves right, arrow points left)", () => {
    const c = sq(
      { x: 0.2, y: 0.4, style: "none", dir: "right" },
      { x: 0.8, y: 0.6, style: "arrow", dir: "left" },
    );
    const pts = connectorPoints([], c);
    expect(pts).toHaveLength(4);
    expect(pts[1].x).toBeGreaterThan(pts[0].x); // seg1 +x (leaves right)
    expect(pts[0].y).toBe(pts[1].y);
    expect(pts[3]).toEqual({ x: 0.8, y: 0.6 });
    expect(pts[2].x).toBeGreaterThan(pts[3].x); // last seg −x (arrow left)
    expect(pts[2].y).toBe(pts[3].y);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "endpoint direction"`
Expected: FAIL — `dir` not honored (routes use the heuristic).

- [ ] **Step 4: Implement the routing**

In `lib/annotations.ts`:

(a) Add `DIR_VEC` near `STUB`:

```ts
/** Unit travel vector for an endpoint direction override. */
const DIR_VEC: Record<NonNullable<import("./book-schema").Endpoint["dir"]>, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
```

(b) Replace `anchorAxis` so it honors `dir` first:

```ts
function anchorAxis(ep: Endpoint): "h" | "v" | null {
  if (ep.dir) return ep.dir === "left" || ep.dir === "right" ? "h" : "v";
  if (!ep.ref) return null;
  switch (ep.anchor) {
    case "left":
    case "right":
      return "h";
    case "top":
    case "bottom":
      return "v";
    default:
      return null;
  }
}
```

(c) Replace `anchorDir` to honor `dir` (role-aware) with an `isTo` param:

```ts
function anchorDir(ep: Endpoint, isTo = false): Point | null {
  if (ep.dir) {
    const v = DIR_VEC[ep.dir];
    return isTo ? { x: -v.x, y: -v.y } : v; // `to` end: outward = −arrow
  }
  if (!ep.ref) return null;
  switch (ep.anchor) {
    case "right":
      return { x: 1, y: 0 };
    case "left":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "top":
      return { x: 0, y: -1 };
    default:
      return null;
  }
}
```

(d) Add the two single-directed route helpers just above `squareRoute`:

```ts
/** Interior corners when only the `to` end is explicitly directed (outB = its
 *  outward normal = −arrow). Uses a clean elbow when the far end already sits on
 *  the arrow side, else a STUB so `left` vs `right` (and `up`/`down`) differ. */
function directedToRoute(a: Point, b: Point, outB: Point): Point[] {
  if (outB.x !== 0) {
    const arrowSign = -outB.x;
    if (Math.sign(b.x - a.x) === arrowSign) return [{ x: a.x, y: b.y }];
    const penX = b.x + outB.x * STUB;
    return [{ x: penX, y: a.y }, { x: penX, y: b.y }];
  }
  const arrowSign = -outB.y;
  if (Math.sign(b.y - a.y) === arrowSign) return [{ x: b.x, y: a.y }];
  const penY = b.y + outB.y * STUB;
  return [{ x: a.x, y: penY }, { x: b.x, y: penY }];
}

/** Interior corners when only the `from` end is explicitly directed (outA = the
 *  leave direction). Mirror of directedToRoute for the first segment. */
function directedFromRoute(a: Point, b: Point, outA: Point): Point[] {
  if (outA.x !== 0) {
    if (Math.sign(b.x - a.x) === outA.x) return [{ x: b.x, y: a.y }];
    const fx = a.x + outA.x * STUB;
    return [{ x: fx, y: a.y }, { x: fx, y: b.y }];
  }
  if (Math.sign(b.y - a.y) === outA.y) return [{ x: a.x, y: b.y }];
  const fy = a.y + outA.y * STUB;
  return [{ x: a.x, y: fy }, { x: b.x, y: fy }];
}
```

(e) Replace `squareRoute` — pass `isTo` to `anchorDir`, and add the two gated single-directed branches (gated on `from.dir`/`to.dir` so anchored connectors are untouched):

```ts
function squareRoute(a: Point, b: Point, from: Endpoint, to: Endpoint): Point[] {
  const dirA = anchorDir(from, false);
  const dirB = anchorDir(to, true);
  if (dirA && dirB) {
    if (dirA.x !== 0 && dirB.x !== 0) return horizontalRoute(a, b, dirA.x, dirB.x);
    if (dirA.y !== 0 && dirB.y !== 0) return verticalRoute(a, b, dirA.y, dirB.y);
  }
  // Exactly one end directed by an EXPLICIT dir → sign-forced route.
  if (from.dir && !dirB) return directedFromRoute(a, b, dirA!);
  if (to.dir && !dirA) return directedToRoute(a, b, dirB!);
  return squareHorizontalFirst(a, b, from, to)
    ? [{ x: b.x, y: a.y }]
    : [{ x: a.x, y: b.y }];
}
```

- [ ] **Step 5: Run the full suite to verify pass + no regression**

Run: `pnpm exec vitest run`
Expected: PASS — the 5 new tests plus all prior connector-routing tests (existing anchored/free routes are byte-identical because the new branches are gated on explicit `dir`).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (pre-existing `lib/use-auto-fit.ts` warning acceptable).

```bash
git add lib/book-schema.ts lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: endpoint direction override — dir schema + sign-forcing square routing"
```

---

### Task 2: UI — direction control in the connector inspector

**Files:**
- Modify: `components/editor/AnnotationEditor.tsx`

**Interfaces:**
- Consumes: `Endpoint.dir` (Task 1); the existing `EndpointFields` `set(patch)` helper + `updateAnnotation`.
- Produces: no new exports. Verified by typecheck/lint/build + the Task 3 in-browser check.

- [ ] **Step 1: Add the direction `<select>` to `EndpointFields`**

In `components/editor/AnnotationEditor.tsx`, inside the `EndpointFields` component's returned `<div className="anno-endpoint">`, after the endpoint-size `<select>` block (the `ep.style !== "none" ? (...) : null` block), add a direction control shown only for square connectors:

```tsx
        {c.routing === "square" ? (
          <select
            value={ep.dir ?? ""}
            onChange={(e) =>
              set({ dir: (e.target.value || undefined) as Endpoint["dir"] })
            }
            title="Direction the connector runs at this end (arrow direction for the To end)"
          >
            <option value="">auto dir</option>
            <option value="left">← left</option>
            <option value="right">→ right</option>
            <option value="up">↑ up</option>
            <option value="down">↓ down</option>
          </select>
        ) : null}
```

(`Endpoint` is already imported in this file. `set` merges the patch into the endpoint; selecting "auto dir" writes `dir: undefined`, clearing it.)

- [ ] **Step 2: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (no unused imports).

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/editor/AnnotationEditor.tsx
git commit -m "feat: endpoint direction control in the connector inspector"
```

---

### Task 3: ADR-004 amendment, ROADMAP, in-browser verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–2. No code.

- [ ] **Step 1: In-browser verification**

Start `pnpm dev`. On a grid step, select the image→callout square connector. In the inspector's **To** row, pick **→ right** → the arrow should point right in the preview; try **← / ↑ / ↓ / auto dir** and confirm the arrow follows. Open `/print` → the connector routes identically (arrow direction preserved). Record the outcome in the commit message.

- [ ] **Step 2: Amend ADR-004**

Append to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-07-01): connector endpoint direction override (Phase 1)

A square connector's arrowhead orients along its final segment; for a free-point
connector that orientation came only from a dominant-axis heuristic, so the arrow
direction couldn't be controlled. New additive `Endpoint.dir?: "left" | "right" |
"up" | "down"` sets the way the connector runs at that end — for `to` the arrow
points that way; for `from` it leaves that way. Absent = auto.

- **Routing (`lib/annotations.ts`, pure):** `anchorAxis`/`anchorDir` honor `dir`
  even for free points (precedence explicit `dir` → anchor edge → heuristic);
  `anchorDir(ep, isTo)` is role-aware (`to`'s outward normal is −arrow).
  `squareRoute` sign-forces a single explicitly-directed end (clean elbow when the
  far end already sits on the arrow side, else a `STUB` so `left` vs `right` differ)
  — gated on an explicit `dir` so anchored/free-no-`dir` connectors route
  byte-identically (no regression). P3 bends still apply on top.
- **Editor + print parity:** `dir` flows through `connectorPoints`; the renderer is
  untouched. Square routing only; no schema-version bump/migration.
- **UI:** an auto/←/→/↑/↓ control in the connector inspector's From/To rows.

Phase 2 (later): an on-canvas drag handle to set `dir` spatially. Known limitation:
for cross-axis both-directed connectors the sign follows layout (edge case).
```

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, note connector endpoint direction override (Phase 1, panel control) done; Phase 2 (on-canvas drag handle) pending.

- [ ] **Step 4: Full suite + checks**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 endpoint direction override amendment + ROADMAP"
```

---

## Self-Review

**1. Spec coverage:**
- `Endpoint.dir` additive → Task 1 Step 1.
- Routing precedence dir→anchor→heuristic; axis + sign-forcing; reuse `anchorDir`/`STUB` → Task 1.
- No regression (gated on explicit `dir`) → Task 1 (regression test + gating).
- Editor+print parity, square-only, no renderer change → Global Constraints + Task 1 (via `connectorPoints`).
- Panel UI (From/To) → Task 2.
- ADR + ROADMAP → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO; complete code in every step; tests show exact expected values (structural asserts where a `STUB` sum would be float-fragile). ✓

**3. Type consistency:** `Endpoint.dir` union, `DIR_VEC` keyed by it, `anchorDir(ep, isTo?)`, `directedFromRoute(a,b,outA)`, `directedToRoute(a,b,outB)`, `squareRoute` signature unchanged. The UI writes the same union via `set({ dir })`. ✓
