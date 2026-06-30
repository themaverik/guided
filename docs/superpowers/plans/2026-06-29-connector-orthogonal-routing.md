# Connector Orthogonal (Elbow) Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `square` connector routing from a single elbow to a full orthogonal router (L / Z / C / U shapes) that exits each edge-anchored endpoint perpendicular to and outward from its edge.

**Architecture:** Pure geometry in `lib/annotations.ts`. A new `squareRoute(a, b, from, to)` returns the *interior* corners of a square route; `connectorPoints` splices them between the endpoints. Edge-anchored ends step outward by a fixed stub (`anchorDir` gives the outward normal); unanchored / mixed / perpendicular-axis ends fall back to the existing single elbow (`squareHorizontalFirst`). No schema change, no renderer change — `AnnotationLayer` (print) and `PreviewAnnotations` (editor) already draw any-length polylines from `connectorPoints`.

**Tech Stack:** TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-29-connector-orthogonal-routing-design.md`.

## Global Constraints

- This is **P1 of the FigJam-elbow epic.** P2 (rounded corners) and P3 (segment handles + offset storage) are separate, later plans. Do **not** touch the renderer, the schema, or add interaction here.
- **Immutability:** routing helpers are pure — return new point objects, never mutate inputs.
- **No schema change, no migration.** `connectorPoints` output is derived geometry; nothing is stored.
- **Print-accuracy guardrail:** do not edit `components/renderer/**` or `components/editor/PreviewAnnotations.tsx`. The route must render identically in editor and print purely because both consume `connectorPoints`.
- **Direction comes only from the anchor name** (`right→+x`, `left→−x`, `top→−y`, `bottom→+y`). Never consult the connected surface's bounds (that would be obstacle avoidance — out of scope).
- **`STUB = 0.04`** normalized (tunable). Used by C and U routes; Z uses the geometric midpoint (no stub needed).
- Verify with `pnpm typecheck` and `pnpm lint` (next lint) — both must be clean before each commit.

---

### Task 1: Orthogonal router — helpers + Z/C/L shapes

**Files:**
- Modify: `lib/annotations.ts` (add `STUB`, `anchorDir`, `horizontalRoute`, `verticalRoute`, `squareRoute`; rewire `connectorPoints` square branch at lines 202–206)
- Test: `lib/annotations.test.ts` (replace the both-anchored single-elbow test; add L / Z / C tests)

**Interfaces:**
- Consumes: existing `anchorAxis`, `squareHorizontalFirst`, `resolveEndpoint`, and the `Point` / `Endpoint` types already in scope in `lib/annotations.ts`.
- Produces:
  - `const STUB = 0.04`
  - `function anchorDir(ep: Endpoint): Point | null`
  - `function horizontalRoute(a: Point, b: Point, dax: number, dbx: number): Point[]`
  - `function verticalRoute(a: Point, b: Point, day: number, dby: number): Point[]`
  - `function squareRoute(a: Point, b: Point, from: Endpoint, to: Endpoint): Point[]`
  - `connectorPoints` square branch returns `[a, ...squareRoute(a, b, c.from, c.to), b]`

In this task `horizontalRoute` / `verticalRoute` handle **C** (parallel magnets) and **Z** (opposite magnets, midpoint) only. The facing-away **U** refinement is Task 2; until then, facing-away arrangements use the midpoint Z (the current backtracking behaviour), which is safe.

- [ ] **Step 1: Write/replace the failing tests**

In `lib/annotations.test.ts`, **delete** the existing test `it("the source anchor wins when both endpoints are anchored", …)` (lines ~110–119) — that exact case (both ends anchored to the same axis) now becomes a Z route, not a single elbow. Then add this new describe block after the existing `"square routing respects anchored edges"` block:

```ts
describe("connectorPoints — orthogonal routing (elbow shapes)", () => {
  it("routes a single elbow (L) when both ends anchor to perpendicular edges", () => {
    // boxA right (0.30, 0.175) → boxB top (0.70, 0.60): one horizontal magnet, one
    // vertical — a single elbow satisfies both, so there is no second corner.
    const surfaces: Annotation[] = [box("boxA", 0.1, 0.1, 0.2, 0.15), box("boxB", 0.6, 0.6, 0.2, 0.15)];
    const c = connector(
      { ref: "boxA", anchor: "right", style: "none" },
      { ref: "boxB", anchor: "top", style: "arrow" },
      "square",
    );
    const pts = connectorPoints(surfaces, c);
    expect(pts).toHaveLength(3);
    expect(pts[1].y).toBeCloseTo(pts[0].y, 10); // horizontal-first off the right edge
    expect(pts[1].x).toBeCloseTo(pts[2].x, 10); // vertical into the top edge
  });

  it("routes a Z when opposite horizontal magnets face toward each other", () => {
    // boxA right (0.30, 0.30) → boxB left (0.60, 0.50); B is to the right, so the
    // magnets face each other: a single elbow can't exit right AND enter left, so it
    // bends twice at the midpoint x.
    const surfaces: Annotation[] = [box("boxA", 0.1, 0.2, 0.2, 0.2), box("boxB", 0.6, 0.4, 0.2, 0.2)];
    const c = connector(
      { ref: "boxA", anchor: "right", style: "none" },
      { ref: "boxB", anchor: "left", style: "arrow" },
      "square",
    );
    const pts = connectorPoints(surfaces, c);
    expect(pts).toHaveLength(4);
    expect(pts[1].y).toBeCloseTo(pts[0].y, 10); // seg1 horizontal (exits right)
    expect(pts[1].x).toBeCloseTo(pts[2].x, 10); // seg2 vertical
    expect(pts[2].y).toBeCloseTo(pts[3].y, 10); // seg3 horizontal (enters left)
    expect(pts[1].x).toBeCloseTo((pts[0].x + pts[3].x) / 2, 10); // corner at midpoint x
  });

  it("routes a Z when opposite vertical magnets face toward each other", () => {
    // boxA bottom (0.20, 0.25) → boxB top (0.70, 0.60): both magnets vertical and
    // facing each other → two bends at the midpoint y (was a single elbow before P1).
    const surfaces: Annotation[] = [box("boxA", 0.1, 0.1, 0.2, 0.15), box("boxB", 0.6, 0.6, 0.2, 0.15)];
    const c = connector(
      { ref: "boxA", anchor: "bottom", style: "none" },
      { ref: "boxB", anchor: "top", style: "arrow" },
      "square",
    );
    const pts = connectorPoints(surfaces, c);
    expect(pts).toHaveLength(4);
    expect(pts[1].x).toBeCloseTo(pts[0].x, 10); // seg1 vertical (exits bottom)
    expect(pts[1].y).toBeCloseTo(pts[2].y, 10); // seg2 horizontal
    expect(pts[2].x).toBeCloseTo(pts[3].x, 10); // seg3 vertical (enters top)
    expect(pts[1].y).toBeCloseTo((pts[0].y + pts[3].y) / 2, 10); // corner at midpoint y
  });

  it("routes a C when both ends anchor to the same horizontal edge (parallel magnets)", () => {
    // boxA right (0.30, 0.30) and boxB right (0.90, 0.50): both exit +x, so the route
    // goes out past the farther right edge, down, and back in.
    const surfaces: Annotation[] = [box("boxA", 0.1, 0.2, 0.2, 0.2), box("boxB", 0.7, 0.4, 0.2, 0.2)];
    const c = connector(
      { ref: "boxA", anchor: "right", style: "none" },
      { ref: "boxB", anchor: "right", style: "arrow" },
      "square",
    );
    const pts = connectorPoints(surfaces, c);
    expect(pts).toHaveLength(4);
    expect(pts[1].y).toBeCloseTo(pts[0].y, 10); // seg1 horizontal
    expect(pts[1].x).toBeCloseTo(pts[2].x, 10); // seg2 vertical at the shared extreme x
    expect(pts[2].y).toBeCloseTo(pts[3].y, 10); // seg3 horizontal
    expect(pts[1].x).toBeGreaterThan(pts[0].x); // exits outward (right)
    expect(pts[1].x).toBeGreaterThan(pts[3].x); // beyond both right edges
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test run lib/annotations.test.ts`
Expected: the four new tests FAIL (the Z/C ones return a 3-point single elbow instead of 4 points; the L one already passes). The deleted test no longer runs.

- [ ] **Step 3: Add the routing helpers**

In `lib/annotations.ts`, immediately **above** `squareHorizontalFirst` (around line 166), add:

```ts
/** Outward stub length (normalized) an edge-anchored end steps off its edge
 *  before routing, so square routes don't backtrack over the box for parallel
 *  (C) or facing-away (U) arrangements. Tunable. */
const STUB = 0.04;

/** Outward edge normal for an endpoint's anchor, or null for free points and
 *  non-edge anchors (center / corners / line ends). Sign-aware sibling of
 *  anchorAxis: a `right` edge exits +x, a `top` edge exits −y, etc. */
function anchorDir(ep: Endpoint): Point | null {
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

/** Interior corners when both ends exit horizontally (dax/dbx are the x-signs of
 *  the two edge normals). Parallel magnets → C (route past the far right/left
 *  edge); opposite magnets → Z (corner at the midpoint x). */
function horizontalRoute(a: Point, b: Point, dax: number, dbx: number): Point[] {
  if (dax === dbx) {
    const extX = dax > 0 ? Math.max(a.x, b.x) + STUB : Math.min(a.x, b.x) - STUB;
    return [
      { x: extX, y: a.y },
      { x: extX, y: b.y },
    ];
  }
  const midX = (a.x + b.x) / 2;
  return [
    { x: midX, y: a.y },
    { x: midX, y: b.y },
  ];
}

/** Interior corners when both ends exit vertically (day/dby are the y-signs of
 *  the two edge normals). Mirror of horizontalRoute. */
function verticalRoute(a: Point, b: Point, day: number, dby: number): Point[] {
  if (day === dby) {
    const extY = day > 0 ? Math.max(a.y, b.y) + STUB : Math.min(a.y, b.y) - STUB;
    return [
      { x: a.x, y: extY },
      { x: b.x, y: extY },
    ];
  }
  const midY = (a.y + b.y) / 2;
  return [
    { x: a.x, y: midY },
    { x: b.x, y: midY },
  ];
}

/** Interior corner(s) of a square (orthogonal) route between resolved points a
 *  and b. Both ends edge-anchored to the SAME axis route via horizontalRoute /
 *  verticalRoute (a single elbow can't satisfy both); every other case (differing
 *  axes, or an unanchored / center / corner end) uses the single perpendicular
 *  elbow from squareHorizontalFirst. */
function squareRoute(a: Point, b: Point, from: Endpoint, to: Endpoint): Point[] {
  const dirA = anchorDir(from);
  const dirB = anchorDir(to);
  if (dirA && dirB) {
    if (dirA.x !== 0 && dirB.x !== 0) return horizontalRoute(a, b, dirA.x, dirB.x);
    if (dirA.y !== 0 && dirB.y !== 0) return verticalRoute(a, b, dirA.y, dirB.y);
  }
  return squareHorizontalFirst(a, b, from, to)
    ? [{ x: b.x, y: a.y }]
    : [{ x: a.x, y: b.y }];
}
```

- [ ] **Step 4: Rewire `connectorPoints`**

In `lib/annotations.ts`, replace the square branch (the current lines):

```ts
  if (c.routing !== "square") return [a, b];
  const corner = squareHorizontalFirst(a, b, c.from, c.to)
    ? { x: b.x, y: a.y }
    : { x: a.x, y: b.y };
  return [a, corner, b];
```

with:

```ts
  if (c.routing !== "square") return [a, b];
  return [a, ...squareRoute(a, b, c.from, c.to), b];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test run lib/annotations.test.ts`
Expected: PASS (all routing tests, including the unchanged free-point and mixed-anchor cases).

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test run`
Expected: typecheck clean; lint clean; full suite green (note `squareHorizontalFirst` and `anchorAxis` are still referenced — by `squareRoute` and the L/fallback path — so no "unused" warnings).

- [ ] **Step 7: Commit**

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: orthogonal connector routing — L/Z/C elbow shapes"
```

---

### Task 2: Facing-away U route

**Files:**
- Modify: `lib/annotations.ts` (`horizontalRoute`, `verticalRoute` — add the facing-away branch)
- Test: `lib/annotations.test.ts` (add two U tests)

**Interfaces:**
- Consumes: `STUB`, `horizontalRoute`, `verticalRoute` from Task 1.
- Produces: no new exports; `horizontalRoute` / `verticalRoute` now return a 4-corner route when opposite magnets face **away** from each other.

- [ ] **Step 1: Write the failing tests**

Append inside the `"orthogonal routing (elbow shapes)"` describe block in `lib/annotations.test.ts`:

```ts
it("routes a U when opposite horizontal magnets face away from each other", () => {
  // boxA right (0.80, 0.30) → boxB left (0.00, 0.60): B sits to the LEFT, so the
  // right/left magnets point away. Both ends stub outward; the route crosses at midY.
  const surfaces: Annotation[] = [box("boxA", 0.6, 0.2, 0.2, 0.2), box("boxB", 0.0, 0.5, 0.2, 0.2)];
  const c = connector(
    { ref: "boxA", anchor: "right", style: "none" },
    { ref: "boxB", anchor: "left", style: "arrow" },
    "square",
  );
  const pts = connectorPoints(surfaces, c);
  expect(pts).toHaveLength(6);
  expect(pts[1].y).toBeCloseTo(pts[0].y, 10); // seg1 horizontal (stub out right)
  expect(pts[1].x).toBeGreaterThan(pts[0].x); //   ...outward
  expect(pts[1].x).toBeCloseTo(pts[2].x, 10); // seg2 vertical
  expect(pts[2].y).toBeCloseTo(pts[3].y, 10); // seg3 horizontal (cross at midY)
  expect(pts[3].x).toBeCloseTo(pts[4].x, 10); // seg4 vertical
  expect(pts[4].y).toBeCloseTo(pts[5].y, 10); // seg5 horizontal (stub into left)
  expect(pts[4].x).toBeLessThan(pts[5].x); //     enters from the left
  expect(pts[2].y).toBeCloseTo((pts[0].y + pts[5].y) / 2, 10); // cross at midpoint y
});

it("routes a U when opposite vertical magnets face away from each other", () => {
  // boxA bottom (0.30, 0.80) → boxB top (0.60, 0.00): B sits ABOVE, so bottom/top
  // magnets point away. Both ends stub outward; the route crosses at midX.
  const surfaces: Annotation[] = [box("boxA", 0.2, 0.6, 0.2, 0.2), box("boxB", 0.5, 0.0, 0.2, 0.2)];
  const c = connector(
    { ref: "boxA", anchor: "bottom", style: "none" },
    { ref: "boxB", anchor: "top", style: "arrow" },
    "square",
  );
  const pts = connectorPoints(surfaces, c);
  expect(pts).toHaveLength(6);
  expect(pts[1].x).toBeCloseTo(pts[0].x, 10); // seg1 vertical (stub down)
  expect(pts[1].y).toBeGreaterThan(pts[0].y); //   ...outward (downward)
  expect(pts[1].y).toBeCloseTo(pts[2].y, 10); // seg2 horizontal
  expect(pts[2].x).toBeCloseTo(pts[3].x, 10); // seg3 vertical (cross at midX)
  expect(pts[3].y).toBeCloseTo(pts[4].y, 10); // seg4 horizontal
  expect(pts[4].x).toBeCloseTo(pts[5].x, 10); // seg5 vertical (stub into top)
  expect(pts[4].y).toBeLessThan(pts[5].y); //     enters from above
  expect(pts[2].x).toBeCloseTo((pts[0].x + pts[5].x) / 2, 10); // cross at midpoint x
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test run lib/annotations.test.ts`
Expected: the two U tests FAIL (`expect(pts).toHaveLength(6)` gets 4 — Task 1's midpoint Z).

- [ ] **Step 3: Add the facing-away branch to `horizontalRoute`**

Replace the opposite-magnet tail of `horizontalRoute` (the `const midX = …; return […]` after the `dax === dbx` block) with:

```ts
  const toward = dax > 0 ? b.x >= a.x : b.x <= a.x;
  if (!toward) {
    const ax = a.x + dax * STUB;
    const bx = b.x + dbx * STUB;
    const midY = (a.y + b.y) / 2;
    return [
      { x: ax, y: a.y },
      { x: ax, y: midY },
      { x: bx, y: midY },
      { x: bx, y: b.y },
    ];
  }
  const midX = (a.x + b.x) / 2;
  return [
    { x: midX, y: a.y },
    { x: midX, y: b.y },
  ];
```

- [ ] **Step 4: Add the facing-away branch to `verticalRoute`**

Replace the opposite-magnet tail of `verticalRoute` similarly:

```ts
  const toward = day > 0 ? b.y >= a.y : b.y <= a.y;
  if (!toward) {
    const ay = a.y + day * STUB;
    const by = b.y + dby * STUB;
    const midX = (a.x + b.x) / 2;
    return [
      { x: a.x, y: ay },
      { x: midX, y: ay },
      { x: midX, y: by },
      { x: b.x, y: by },
    ];
  }
  const midY = (a.y + b.y) / 2;
  return [
    { x: a.x, y: midY },
    { x: b.x, y: midY },
  ];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test run lib/annotations.test.ts`
Expected: PASS (all elbow-shape tests, including both U cases; Z/C/L unchanged).

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test run`
Expected: clean / clean / green.

- [ ] **Step 7: Commit**

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: facing-away (U) orthogonal connector route"
```

---

### Task 3: Docs — ADR-004 amendment + ROADMAP

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Amend ADR-004**

Open `docs/adr/ADR-004-annotation-canvas.md`. Find the orthogonal-routing entry added by the previous fix (its text ends with a deferral like *"Deferred: two-corner (Z) route when both endpoints anchor to conflicting axes."*). Replace that deferral sentence with a short paragraph recording the P1 router. Use this content (adapt the surrounding heading/format to match the file's existing amendment style):

```markdown
**Amendment (P1 — orthogonal elbow routing):** `connectorPoints` now produces a
full orthogonal route for `square` connectors via the pure helper `squareRoute`
(`lib/annotations.ts`). Each edge-anchored end exits perpendicular to and outward
from its edge; the shape is chosen deterministically from the two anchors and the
resolved endpoints: **L** (perpendicular axes, single elbow), **Z** (opposite
magnets facing toward each other, corner at the midpoint), **C** (parallel
magnets, route past the far edge by `STUB`), **U** (opposite magnets facing away,
stub out both ends and cross at the midpoint). Direction comes only from the
anchor name — the connected surface's bounds are never consulted, so true
obstacle avoidance is out of scope (a route may cross a box body in degenerate
overlaps; the planned P3 segment handles are the remedy). No schema change; the
route renders identically in `AnnotationLayer` (print) and `PreviewAnnotations`
(editor) because both consume `connectorPoints`. P1 of the FigJam-elbow epic;
P2 = rounded corners, P3 = interactive segment handles + relative-offset storage.
```

- [ ] **Step 2: Update ROADMAP**

In `ROADMAP.md`, under `## Backlog / next up`, update the connector items to reflect P1 done and the epic framing. Replace the existing **"Bug — square (orthogonal) connector routing"** done-entry's deferral note and the standalone routing references by marking the P1 router done and noting the epic. Concretely, append to the backlog (or fold into the existing connector block) this entry:

```markdown
- **FigJam-style elbow connectors (epic)** — P1 [done] (`feat/connector-elbow-routing`):
  full orthogonal auto-routing (L/Z/C/U) in `connectorPoints` via the pure
  `squareRoute` helper, outward-stub based, pure geometry (no schema/renderer
  change). Spec `docs/superpowers/specs/2026-06-29-connector-orthogonal-routing-design.md`.
  Remaining: **P2** rounded corners (`<path>` + `stroke-linejoin="round"`, pure
  render); **P3** interactive axis-constrained segment-midpoint handles +
  relative-offset storage that survives object moves (schema change + ADR).
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 + ROADMAP — P1 orthogonal elbow routing"
```

---

## Self-Review notes

- **Spec coverage:** L/Z/C/U all have tasks + tests (Task 1: L/Z/C; Task 2: U). Regressions (straight, waypoints, free/free dominant-axis, mixed anchored+free) are the pre-existing tests, kept. The one pre-existing both-anchored single-elbow test is intentionally replaced (Task 1 Step 1) because that case is exactly what changes. `STUB`, `anchorDir`, no-schema/no-renderer constraints all covered. Docs (ADR-004 + ROADMAP) = Task 3.
- **Type consistency:** `squareRoute(a, b, from, to)`, `anchorDir(ep)`, `horizontalRoute(a,b,dax,dbx)`, `verticalRoute(a,b,day,dby)` are used with identical signatures across tasks. `connectorPoints` returns `[a, ...squareRoute(...), b]` in both the prose and code.
- **No placeholders:** every code/test step shows complete code; every run step shows the command + expected result.
