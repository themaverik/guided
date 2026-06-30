# Connector Segment-Drag Handles + Relative-Offset Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author drag any segment of a `square` connector to reshape its orthogonal route, storing each drag as an offset that rides the recomputed auto-route when a connected box moves (FigJam-style elbow handles).

**Architecture:** Pure geometry in `lib/annotations.ts` — a new `routeWithBends(base, bends)` layers a list of per-segment perpendicular offsets onto the P1 `squareRoute` auto-route (interior runs displace in place; anchored runs insert a stub+jog detour for L-bending), and returns the rendered polyline plus per-segment provenance. `connectorPoints` delegates through it so the editor preview and the Playwright print path stay byte-identical; P2 rounded corners apply unchanged. The editor (`PreviewAnnotations.tsx`) renders a midpoint handle on every draggable segment and converts a perpendicular drag into a `ConnectorBend` via a pure `bendForDrag` helper.

**Tech Stack:** TypeScript, React 19, Next.js 15, Zustand store, Vitest (unit), Playwright (visual). Pure helpers tested with Vitest; the editor wiring verified by typecheck/lint + the `elbow-demo` print page.

## Global Constraints

- **Immutability:** every `Book` edit returns new objects; `bends` is rewritten as a new array each drag frame. Never mutate document state in place.
- **`Book` JSON is the single source of truth.** HTML/PDF are render-only. No derived output is stored.
- **Additive schema, no migration.** `bends?` absent → pure auto-route, byte-identical to today. Do **not** bump `CURRENT_SCHEMA_VERSION`.
- **Editor + print identical.** Both consume `connectorPoints`/`connectorRoute`; the renderer (`AnnotationLayer.tsx`) and print path are **not** touched.
- **Square-only.** `bends` applies to `routing: "square"`. `waypoints` (absolute) is left untouched as the `straight`-connector mechanism; legacy square+waypoints (no bends) still renders as today.
- **One bend per base segment.** Re-dragging a run updates its bend; bends never stack on one `seg`.
- **STUB reuse:** L-bending detours reuse the existing module constant `STUB = 0.04` in `lib/annotations.ts`.
- **Rounding:** bent-route output coordinates are rounded to 4 decimals via the existing `pt`/`round4` helpers. The no-bend path returns the base route **unrounded** (preserves existing `connectorPoints` output and its `toBeCloseTo(.,10)` tests).
- Commit type `feat` for code, `test` for test-only, `docs` for ADR/ROADMAP. No AI attribution in commit messages. Do not `git push`.

---

### Task 1: `routeWithBends` — schema + interior-run displacement

**Files:**
- Modify: `lib/book-schema.ts` (add `ConnectorBend`, `Connector.bends?`)
- Modify: `lib/annotations.ts` (add `SegmentMeta`, `segAxis`, `routeWithBends`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: existing `Point` (`lib/annotations.ts`), `Endpoint`/`Connector` (`lib/book-schema.ts`), module-private `round4`/`pt` (`lib/annotations.ts`).
- Produces:
  - `interface ConnectorBend { seg: number; axis: "h" | "v"; offset: number }` (exported from `lib/book-schema.ts`)
  - `Connector.bends?: ConnectorBend[]`
  - `interface SegmentMeta { baseSeg: number; bend: number | null; draggable: boolean }` (exported from `lib/annotations.ts`)
  - `function routeWithBends(base: Point[], bends: ConnectorBend[]): { points: Point[]; segments: SegmentMeta[] }` — **interior bends only in this task** (seg `0` and the last segment are dropped until Task 2).

- [ ] **Step 1: Add the schema types**

In `lib/book-schema.ts`, immediately above `export interface Connector {`, add:

```ts
/** A manual adjustment to one segment of a square connector's auto-route (P3).
 *  Stored as a perpendicular offset FROM the recomputed auto-route, so it rides
 *  along when a connected surface moves. Dropped at render time if a reflow
 *  changes the route so this segment no longer exists or no longer matches `axis`. */
export interface ConnectorBend {
  /** Index of the auto-route segment this bend adjusts (0-based). */
  seg: number;
  /** Run orientation: "h" = horizontal (offset shifts it in Y), "v" = vertical (offset shifts it in X). */
  axis: "h" | "v";
  /** Signed perpendicular offset from the auto-route, normalized page units. */
  offset: number;
}
```

Then inside `interface Connector`, after the `waypoints?` field, add:

```ts
  /** Manual segment adjustments for square routing (P3). Square-only — each rides
   *  the recomputed auto-route. `waypoints` remains the `straight`-connector path. */
  bends?: ConnectorBend[];
```

- [ ] **Step 2: Write the failing tests**

In `lib/annotations.test.ts`, add `routeWithBends` and the `ConnectorBend` type to the existing import from `@/lib/annotations` / `@/lib/book-schema`, then add this describe block:

```ts
describe("routeWithBends — interior runs", () => {
  // Z route: a(0.2,0.3) → corner(0.5,0.3) → corner(0.5,0.7) → b(0.8,0.7)
  const zBase = [
    { x: 0.2, y: 0.3 },
    { x: 0.5, y: 0.3 },
    { x: 0.5, y: 0.7 },
    { x: 0.8, y: 0.7 },
  ];

  it("returns the base route unchanged when there are no bends", () => {
    const r = routeWithBends(zBase, []);
    expect(r.points).toEqual(zBase);
    expect(r.segments).toEqual([
      { baseSeg: 0, bend: null, draggable: true },
      { baseSeg: 1, bend: null, draggable: true },
      { baseSeg: 2, bend: null, draggable: true },
    ]);
  });

  it("displaces an interior vertical cross-run by its offset", () => {
    const r = routeWithBends(zBase, [{ seg: 1, axis: "v", offset: 0.1 }]);
    expect(r.points).toEqual([
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.3 },
      { x: 0.6, y: 0.7 },
      { x: 0.8, y: 0.7 },
    ]);
    expect(r.segments[1]).toEqual({ baseSeg: 1, bend: 0, draggable: true });
  });

  it("drops a bend whose seg is out of range", () => {
    expect(routeWithBends(zBase, [{ seg: 9, axis: "v", offset: 0.1 }]).points).toEqual(zBase);
  });

  it("drops a bend whose axis disagrees with the base segment", () => {
    // seg 1 is vertical; an "h" bend there is invalid.
    expect(routeWithBends(zBase, [{ seg: 1, axis: "h", offset: 0.1 }]).points).toEqual(zBase);
  });

  it("rides the recomputed base: same offset, shifted base → shifted run", () => {
    const shifted = [
      { x: 0.2, y: 0.3 },
      { x: 0.55, y: 0.3 },
      { x: 0.55, y: 0.7 },
      { x: 0.9, y: 0.7 },
    ];
    const r = routeWithBends(shifted, [{ seg: 1, axis: "v", offset: 0.1 }]);
    expect(r.points[1].x).toBeCloseTo(0.65, 10);
    expect(r.points[2].x).toBeCloseTo(0.65, 10);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "routeWithBends"`
Expected: FAIL — `routeWithBends is not a function`.

- [ ] **Step 4: Implement interior-only `routeWithBends`**

In `lib/annotations.ts`, add `ConnectorBend` to the type import from `./book-schema`, and add after `buildRoundedConnector` (before `resolveEndpoint`):

```ts
/** Orientation of a base route segment, or null if degenerate (zero-length). */
function segAxis(p: Point, q: Point): "h" | "v" | null {
  if (p.y === q.y && p.x !== q.x) return "h";
  if (p.x === q.x && p.y !== q.y) return "v";
  return null;
}

/** Provenance of one rendered route segment, so the editor can map a handle drag
 *  back to a bend. `draggable` is false for the structural stub/jog of an inserted
 *  detour. `bend` is the index into the connector's `bends` array governing this
 *  run, or null for an un-adjusted base run. */
export interface SegmentMeta {
  baseSeg: number;
  bend: number | null;
  draggable: boolean;
}

/** Apply manual segment bends to a square connector's auto-route `base` (the
 *  `[a, ...squareRoute, b]` polyline). Interior runs displace perpendicular in
 *  place. Returns the rendered polyline plus per-segment provenance. Pure.
 *  NOTE: anchored runs (seg 0 / last) are added in Task 2; here they are dropped. */
export function routeWithBends(
  base: Point[],
  bends: ConnectorBend[],
): { points: Point[]; segments: SegmentMeta[] } {
  const segCount = base.length - 1;
  const bySeg = new Map<number, { idx: number; bend: ConnectorBend }>();
  bends.forEach((b, idx) => {
    if (b.seg <= 0 || b.seg >= segCount - 1) return; // interior only (Task 2 widens this)
    if (segAxis(base[b.seg], base[b.seg + 1]) !== b.axis) return;
    if (!bySeg.has(b.seg)) bySeg.set(b.seg, { idx, bend: b });
  });

  if (bySeg.size === 0) {
    return {
      points: base.map((p) => ({ x: p.x, y: p.y })),
      segments: base.slice(1).map((_, i) => ({ baseSeg: i, bend: null, draggable: true })),
    };
  }

  const pts = base.map((p) => ({ x: p.x, y: p.y }));
  for (const [seg, { bend }] of bySeg) {
    const k = bend.axis === "h" ? "y" : "x";
    pts[seg][k] += bend.offset;
    pts[seg + 1][k] += bend.offset;
  }

  const points: Point[] = [pt(pts[0].x, pts[0].y)];
  const segments: SegmentMeta[] = [];
  for (let i = 0; i < segCount; i++) {
    const bm = bySeg.get(i);
    points.push(pt(pts[i + 1].x, pts[i + 1].y));
    segments.push({ baseSeg: i, bend: bm ? bm.idx : null, draggable: true });
  }
  return { points, segments };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "routeWithBends"`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add lib/book-schema.ts lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: ConnectorBend schema + routeWithBends interior-run displacement (P3)"
```

---

### Task 2: `routeWithBends` — anchored-run insertion (L-bending)

**Files:**
- Modify: `lib/annotations.ts` (replace `routeWithBends` body with the full algorithm)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `STUB` (module constant), `pt`/`round4`, `segAxis`, `SegmentMeta` (Task 1).
- Produces: the final `routeWithBends(base, bends)` — handles interior **and** anchored runs (seg `0` and last). An anchored bend inserts a stub+jog detour; the displaced run is the only draggable segment of the detour.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotations.test.ts` a new describe block:

```ts
describe("routeWithBends — anchored runs (L-bending)", () => {
  // L route: a(0.2,0.3) →[right exit, h] corner(0.7,0.3) →[v] b(0.7,0.8) [top exit]
  const lBase = [
    { x: 0.2, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.7, y: 0.8 },
  ];

  it("inserts a stub+jog detour when bending the from-anchored run", () => {
    const r = routeWithBends(lBase, [{ seg: 0, axis: "h", offset: 0.1 }]);
    expect(r.points).toEqual([
      { x: 0.2, y: 0.3 },  // a
      { x: 0.24, y: 0.3 }, // stub (perpendicular exit preserved)
      { x: 0.24, y: 0.4 }, // jog
      { x: 0.7, y: 0.4 },  // displaced run end (corner, y shifted)
      { x: 0.7, y: 0.8 },  // b
    ]);
    // Only the displaced run is draggable; stub + jog are structural.
    expect(r.segments).toEqual([
      { baseSeg: 0, bend: 0, draggable: false },
      { baseSeg: 0, bend: 0, draggable: false },
      { baseSeg: 0, bend: 0, draggable: true },
      { baseSeg: 1, bend: null, draggable: true },
    ]);
  });

  it("inserts a detour at the to-anchored end", () => {
    const r = routeWithBends(lBase, [{ seg: 1, axis: "v", offset: 0.1 }]);
    expect(r.points).toEqual([
      { x: 0.2, y: 0.3 },   // a
      { x: 0.8, y: 0.3 },   // run end (corner, x shifted)
      { x: 0.8, y: 0.76 },  // displaced run / jog start
      { x: 0.7, y: 0.76 },  // jog
      { x: 0.7, y: 0.8 },   // stub (perpendicular exit preserved) → b
    ]);
    expect(r.segments).toEqual([
      { baseSeg: 0, bend: null, draggable: true },
      { baseSeg: 1, bend: 0, draggable: true },
      { baseSeg: 1, bend: 0, draggable: false },
      { baseSeg: 1, bend: 0, draggable: false },
    ]);
  });

  it("bends both legs of an L into an S (multi-bend, shared corner)", () => {
    const r = routeWithBends(lBase, [
      { seg: 0, axis: "h", offset: 0.1 },
      { seg: 1, axis: "v", offset: 0.1 },
    ]);
    expect(r.points).toEqual([
      { x: 0.2, y: 0.3 },
      { x: 0.24, y: 0.3 },
      { x: 0.24, y: 0.4 },
      { x: 0.8, y: 0.4 },   // shared corner: x shifted by seg1, y shifted by seg0
      { x: 0.8, y: 0.76 },
      { x: 0.7, y: 0.76 },
      { x: 0.7, y: 0.8 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "anchored runs"`
Expected: FAIL — anchored bends are currently dropped, so `points` equals `lBase`.

- [ ] **Step 3: Replace `routeWithBends` with the full algorithm**

In `lib/annotations.ts`, replace the entire `routeWithBends` function (keep `segAxis` and `SegmentMeta` as-is) with:

```ts
/** Apply manual segment bends to a square connector's auto-route `base` (the
 *  `[a, ...squareRoute, b]` polyline). Interior runs displace perpendicular in
 *  place; a bend on an anchored run (touching `a` or `b`) inserts a stub+jog
 *  detour so the perpendicular exit is preserved (L-bending). Returns the
 *  rendered polyline plus per-segment provenance. Pure; at most one bend per
 *  base segment (first wins). Output coordinates rounded to 4 decimals. */
export function routeWithBends(
  base: Point[],
  bends: ConnectorBend[],
): { points: Point[]; segments: SegmentMeta[] } {
  const segCount = base.length - 1;
  const bySeg = new Map<number, { idx: number; bend: ConnectorBend }>();
  bends.forEach((b, idx) => {
    if (b.seg < 0 || b.seg >= segCount) return; // out of range → drop
    if (segAxis(base[b.seg], base[b.seg + 1]) !== b.axis) return; // axis mismatch → drop
    if (!bySeg.has(b.seg)) bySeg.set(b.seg, { idx, bend: b });
  });

  if (bySeg.size === 0) {
    return {
      points: base.map((p) => ({ x: p.x, y: p.y })),
      segments: base.slice(1).map((_, i) => ({ baseSeg: i, bend: null, draggable: true })),
    };
  }

  const perpKey = (axis: "h" | "v") => (axis === "h" ? "y" : "x") as "x" | "y";
  // Working corners with perpendicular pre-shifts (interior: both ends; anchored:
  // the inner corner only — the anchor itself stays fixed for its perpendicular exit).
  const pts = base.map((p) => ({ x: p.x, y: p.y }));
  for (const [seg, { bend }] of bySeg) {
    const k = perpKey(bend.axis);
    if (seg === 0) pts[1][k] += bend.offset;
    else if (seg === segCount - 1) pts[segCount - 1][k] += bend.offset;
    else {
      pts[seg][k] += bend.offset;
      pts[seg + 1][k] += bend.offset;
    }
  }

  // Unit step off an endpoint along its segment's axis (toward the inner corner).
  const along = (p: Point, q: Point): Point =>
    Math.abs(q.x - p.x) >= Math.abs(q.y - p.y)
      ? { x: Math.sign(q.x - p.x), y: 0 }
      : { x: 0, y: Math.sign(q.y - p.y) };

  const points: Point[] = [pt(pts[0].x, pts[0].y)];
  const segments: SegmentMeta[] = [];
  const addSeg = (p: Point, meta: SegmentMeta) => {
    points.push(pt(p.x, p.y));
    segments.push(meta);
  };

  // HEAD (seg 0).
  const head = bySeg.get(0);
  if (head) {
    const k = perpKey(head.bend.axis);
    const dir = along(base[0], base[1]);
    const stub = { x: base[0].x + dir.x * STUB, y: base[0].y + dir.y * STUB };
    const jog = { x: stub.x, y: stub.y };
    jog[k] = stub[k] + head.bend.offset;
    addSeg(stub, { baseSeg: 0, bend: head.idx, draggable: false });
    addSeg(jog, { baseSeg: 0, bend: head.idx, draggable: false });
    addSeg(pts[1], { baseSeg: 0, bend: head.idx, draggable: true });
  } else {
    addSeg(pts[1], { baseSeg: 0, bend: null, draggable: true });
  }

  // INTERIOR runs (seg 1 .. segCount-2).
  for (let i = 1; i <= segCount - 2; i++) {
    const bm = bySeg.get(i);
    addSeg(pts[i + 1], { baseSeg: i, bend: bm ? bm.idx : null, draggable: true });
  }

  // TAIL (last segment), when the route has more than one segment.
  if (segCount >= 2) {
    const tail = bySeg.get(segCount - 1);
    if (tail) {
      const k = perpKey(tail.bend.axis);
      const bEnd = base[segCount];
      const dir = along(bEnd, base[segCount - 1]);
      const stub = { x: bEnd.x + dir.x * STUB, y: bEnd.y + dir.y * STUB };
      const jog = { x: stub.x, y: stub.y };
      jog[k] = stub[k] + tail.bend.offset;
      addSeg(jog, { baseSeg: segCount - 1, bend: tail.idx, draggable: true });
      addSeg(stub, { baseSeg: segCount - 1, bend: tail.idx, draggable: false });
      addSeg(bEnd, { baseSeg: segCount - 1, bend: tail.idx, draggable: false });
    } else {
      addSeg(pts[segCount], { baseSeg: segCount - 1, bend: null, draggable: true });
    }
  }

  return { points, segments };
}
```

- [ ] **Step 4: Run the full annotations suite to verify pass + no regression**

Run: `pnpm exec vitest run lib/annotations.test.ts`
Expected: PASS — all prior `routeWithBends` interior tests still green, plus the 3 anchored tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: routeWithBends anchored-run insertion for L-bending (P3)"
```

---

### Task 3: Wire `connectorRoute` + `connectorPoints` + `squareBaseRoute`

**Files:**
- Modify: `lib/annotations.ts` (`connectorPoints`; add `connectorRoute`, `squareBaseRoute`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `resolveEndpoint`, `squareRoute`, `routeWithBends` (existing/Task 2).
- Produces:
  - `function connectorRoute(annotations: Annotation[], c: Connector): { points: Point[]; segments: SegmentMeta[] }`
  - `function squareBaseRoute(annotations: Annotation[], c: Connector): Point[]` — the unbent `[a, ...squareRoute, b]`, used by the editor to compute offsets.
  - `connectorPoints` keeps its `Point[]` signature, now delegating to `connectorRoute`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotations.test.ts` (import `connectorRoute`, `squareBaseRoute`):

```ts
describe("connectorRoute / connectorPoints wiring", () => {
  const boxA = { id: "A", kind: "box", x: 0.1, y: 0.2, w: 0.2, h: 0.2, stroke: "#000", width: 2 } as const;
  const boxB = { id: "B", kind: "box", x: 0.6, y: 0.6, w: 0.2, h: 0.2, stroke: "#000", width: 2 } as const;
  const sq = (extra: object): Connector => ({
    id: "c", kind: "connector", stroke: "#000", width: 2, routing: "square",
    from: { ref: "A", anchor: "right", style: "arrow" },
    to: { ref: "B", anchor: "left", style: "arrow" },
    ...extra,
  });

  it("square + no bends is identical to [a, ...squareRoute, b]", () => {
    const c = sq({});
    const anns = [boxA, boxB, c];
    expect(connectorPoints(anns, c)).toEqual(squareBaseRoute(anns, c));
  });

  it("square + a bend reshapes the route", () => {
    const c = sq({ bends: [{ seg: 1, axis: "v", offset: 0.05 }] });
    const anns = [boxA, boxB, c];
    const base = squareBaseRoute(anns, c);
    const bent = connectorPoints(anns, c);
    expect(bent).not.toEqual(base);
    expect(bent.length).toBe(base.length); // interior displacement keeps point count
  });

  it("straight connector is unchanged (free waypoints through points)", () => {
    const c: Connector = {
      id: "c", kind: "connector", stroke: "#000", width: 2, routing: "straight",
      from: { x: 0.1, y: 0.1, style: "arrow" },
      to: { x: 0.9, y: 0.9, style: "arrow" },
      waypoints: [{ x: 0.5, y: 0.2 }],
    };
    expect(connectorPoints([c], c)).toEqual([
      { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.9 },
    ]);
  });

  it("legacy square + waypoints (no bends) still renders the waypoint route", () => {
    const c = sq({ waypoints: [{ x: 0.5, y: 0.2 }] });
    const anns = [boxA, boxB, c];
    const pts = connectorPoints(anns, c);
    expect(pts[1]).toEqual({ x: 0.5, y: 0.2 });
    expect(pts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "wiring"`
Expected: FAIL — `connectorRoute`/`squareBaseRoute` are not functions.

- [ ] **Step 3: Implement the wiring**

In `lib/annotations.ts`, replace the existing `connectorPoints` function with:

```ts
/** The unbent square auto-route `[a, ...squareRoute, b]` for a connector. Used by
 *  the editor to compute bend offsets relative to the auto-route. */
export function squareBaseRoute(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): Point[] {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  return [a, ...squareRoute(a, b, c.from, c.to), b];
}

/** The rendered polyline of a connector plus per-segment provenance. `square`
 *  routes through `routeWithBends` (auto-route + manual bends); a `square`
 *  connector still carrying legacy `waypoints` (and no `bends`) renders the
 *  waypoint route for back-compat; `straight` routes through its waypoints. */
export function connectorRoute(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): { points: Point[]; segments: SegmentMeta[] } {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  const wps = c.waypoints ?? [];
  const passThrough = (pts: Point[]) => ({
    points: pts,
    segments: pts.slice(1).map((_, i) => ({ baseSeg: i, bend: null, draggable: false })),
  });
  if (c.routing !== "square") {
    return passThrough([a, ...wps.map((p) => ({ x: p.x, y: p.y })), b]);
  }
  if (wps.length > 0 && !(c.bends && c.bends.length)) {
    return passThrough([a, ...wps.map((p) => ({ x: p.x, y: p.y })), b]);
  }
  return routeWithBends([a, ...squareRoute(a, b, c.from, c.to), b], c.bends ?? []);
}

/** The polyline points of a connector in normalized coords (see connectorRoute). */
export function connectorPoints(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): Point[] {
  return connectorRoute(annotations, c).points;
}
```

Keep the existing doc comment above `connectorPoints` (or move it above `connectorRoute`). Add `Annotation` to the type import from `./book-schema` if not already present (it is imported).

- [ ] **Step 4: Run the full suite to verify pass + no regression**

Run: `pnpm exec vitest run`
Expected: PASS — all 145 prior tests plus the new wiring tests. (Existing `connectorPoints` square/straight tests stay green because the no-bend path returns the base route unrounded.)

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: connectorRoute/squareBaseRoute wiring with bends + back-compat (P3)"
```

---

### Task 4: `bendForDrag` pure helper

**Files:**
- Modify: `lib/annotations.ts` (add `bendForDrag`)
- Test: `lib/annotations.test.ts`

**Interfaces:**
- Consumes: `Point`, `round4`, `ConnectorBend`.
- Produces: `function bendForDrag(base: Point[], baseSeg: number, axis: "h" | "v", pointer: Point, tol?: number): ConnectorBend | null` — the new bend for a perpendicular drag of base segment `baseSeg` to `pointer`, or `null` when within `tol` of the auto-route (snap-to-auto / remove the bend). `tol` defaults to `0.01`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/annotations.test.ts` (import `bendForDrag`):

```ts
describe("bendForDrag", () => {
  const lBase = [
    { x: 0.2, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.7, y: 0.8 },
  ];

  it("offsets a horizontal run by pointer.y minus the base perpendicular", () => {
    expect(bendForDrag(lBase, 0, "h", { x: 0.5, y: 0.45 })).toEqual({
      seg: 0, axis: "h", offset: 0.15,
    });
  });

  it("offsets a vertical run by pointer.x minus the base perpendicular", () => {
    expect(bendForDrag(lBase, 1, "v", { x: 0.85, y: 0.5 })).toEqual({
      seg: 1, axis: "v", offset: 0.15,
    });
  });

  it("returns null (snap-to-auto / remove) within tolerance", () => {
    expect(bendForDrag(lBase, 0, "h", { x: 0.5, y: 0.305 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "bendForDrag"`
Expected: FAIL — `bendForDrag is not a function`.

- [ ] **Step 3: Implement `bendForDrag`**

In `lib/annotations.ts`, add after `routeWithBends`:

```ts
/** Build the bend for dragging base segment `baseSeg` (orientation `axis`) to
 *  `pointer`. The offset is the perpendicular delta from the auto-route; within
 *  `tol` of the auto-route it returns null (snap back / remove the bend). Pure. */
export function bendForDrag(
  base: Point[],
  baseSeg: number,
  axis: "h" | "v",
  pointer: Point,
  tol = 0.01,
): ConnectorBend | null {
  const basePerp = axis === "h" ? base[baseSeg].y : base[baseSeg].x;
  const ptrPerp = axis === "h" ? pointer.y : pointer.x;
  const offset = round4(ptrPerp - basePerp);
  if (Math.abs(offset) < tol) return null;
  return { seg: baseSeg, axis, offset };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/annotations.test.ts -t "bendForDrag"`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: bendForDrag — perpendicular drag to ConnectorBend with snap-to-auto (P3)"
```

---

### Task 5: Editor — segment handles + axis-constrained drag

**Files:**
- Modify: `components/editor/PreviewAnnotations.tsx`
- Modify: `components/editor/editor.css`

**Interfaces:**
- Consumes: `connectorRoute`, `squareBaseRoute`, `bendForDrag` (Tasks 3–4); existing `updateAnnotation` store action.
- Produces: segment midpoint handles for focused `square` connectors; perpendicular drag writes `Connector.bends`. No new exports. Verified by typecheck/lint + the Task 6 visual gate (the editor drag is pointer-driven and not unit-tested, consistent with the existing untested handle code; the geometry it relies on is covered by Tasks 1–4).

- [ ] **Step 1: Extend imports and the drag state**

In `components/editor/PreviewAnnotations.tsx`:

Add to the `@/lib/annotations` import: `bendForDrag`, `connectorRoute`, `squareBaseRoute`.

Change the `Part` type:

```ts
type Part = "move" | "resize" | "from" | "to" | "wp" | "seg";
```

Extend the `drag` ref shape to carry the segment provenance:

```ts
  const drag = useRef<{
    id: string;
    part: Part;
    grabX: number;
    grabY: number;
    wp?: number;
    baseSeg?: number;
    axis?: "h" | "v";
  } | null>(null);
```

- [ ] **Step 2: Add a `startSeg` drag initiator**

Next to `startWp` (after it), add:

```ts
  const startSeg =
    (id: string, baseSeg: number, axis: "h" | "v") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { id, part: "seg", grabX: 0, grabY: 0, baseSeg, axis };
      svgRef.current?.setPointerCapture(e.pointerId);
    };
```

- [ ] **Step 3: Handle the `seg` drag in `apply`**

In `apply`, inside the `a.kind === "connector"` block, immediately before the existing `if (d.part === "wp" ...)`, add:

```ts
    if (d.part === "seg" && d.baseSeg != null && d.axis) {
      const base = squareBaseRoute(annotations, a);
      const nb = bendForDrag(base, d.baseSeg, d.axis, p);
      const merged = (a.bends ?? []).filter((bd) => bd.seg !== d.baseSeg);
      if (nb) merged.push(nb);
      updateAnnotation(ci, si, d.id, { bends: merged });
      return;
    }
```

- [ ] **Step 4: Render segment handles for focused square connectors**

In the focused-connector JSX branch, replace the `waypoints?.map(...)` diamond block with a square-vs-other split. The current block is:

```tsx
            {(focused as Connector).waypoints?.map((wp, i) => (
              <rect
                key={i}
                x={wp.x * W - 5}
                y={wp.y * H - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${wp.x * W} ${wp.y * H})`}
                className="preview-anno-wp"
                onPointerDown={startWp(focused.id, i)}
              />
            ))}
```

Replace it with:

```tsx
            {(focused as Connector).routing === "square"
              ? (() => {
                  const route = connectorRoute(annotations, focused as Connector);
                  return route.segments.map((m, i) => {
                    if (!m.draggable) return null;
                    const p1 = route.points[i];
                    const p2 = route.points[i + 1];
                    const ax: "h" | "v" =
                      Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "h" : "v";
                    const mx = ((p1.x + p2.x) / 2) * W;
                    const my = ((p1.y + p2.y) / 2) * H;
                    return (
                      <rect
                        key={`seg-${i}`}
                        x={mx - 5}
                        y={my - 5}
                        width={10}
                        height={10}
                        rx={2}
                        className={`preview-anno-seg ${ax}`}
                        onPointerDown={startSeg(focused.id, m.baseSeg, ax)}
                      />
                    );
                  });
                })()
              : (focused as Connector).waypoints?.map((wp, i) => (
                  <rect
                    key={i}
                    x={wp.x * W - 5}
                    y={wp.y * H - 5}
                    width={10}
                    height={10}
                    transform={`rotate(45 ${wp.x * W} ${wp.y * H})`}
                    className="preview-anno-wp"
                    onPointerDown={startWp(focused.id, i)}
                  />
                ))}
```

(The `from`/`to` endpoint `Handle`s above this block are unchanged.)

- [ ] **Step 5: Add the handle style**

In `components/editor/editor.css`, after the `.preview-anno-wp:active` rule (around line 663), add:

```css
.preview-anno-seg {
  fill: #fff;
  stroke: var(--color-accent, #658995);
  stroke-width: 2;
  pointer-events: auto;
}
.preview-anno-seg.h {
  cursor: ns-resize;
}
.preview-anno-seg.v {
  cursor: ew-resize;
}
.preview-anno-seg:active {
  cursor: grabbing;
}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds (no SSR/type breakage in the editor route).

- [ ] **Step 7: Commit**

```bash
git add components/editor/PreviewAnnotations.tsx components/editor/editor.css
git commit -m "feat: editor segment-drag handles for square connectors (P3)"
```

---

### Task 6: ADR-004 amendment, ROADMAP, visual verification

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`
- (Verify only) `data/projects/elbow-demo` via the print page

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–5.
- Produces: documentation + a recorded visual gate. No code.

- [ ] **Step 1: Visual gate — drag + reflow on the print path**

Start the dev server (`pnpm dev`). In the editor at `http://localhost:3000/elbow-demo`, for each of the L/Z/C/U demo connectors: focus it, drag a segment handle perpendicular (confirm the run moves on its axis and the route stays orthogonal), then move a connected box and confirm the manual run rides along. Then open `http://localhost:3000/elbow-demo/print` and confirm the same shapes render identically (orthogonal, rounded corners intact, arrowheads correct).

If the browser extension/Playwright is available, capture `/elbow-demo/print` to a throwaway screenshot script in the **project root** (so node resolves `node_modules`), Read the PNG to confirm by eye, then remove the script. Record the outcome in the commit message.

Expected: dragged runs sit where placed; a moved box carries its manual run; editor preview matches print; corners still rounded.

- [ ] **Step 2: Amend ADR-004**

Append a new amendment section to `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-06-30): interactive segment handles + relative-offset bends (P3)

`square` connectors gain manual segment adjustment (FigJam-style elbow handles),
the final phase of the elbow epic (after P1 routing, P2 rounding).

- **Schema (additive, no migration):** `Connector.bends?: ConnectorBend[]`, each
  `{ seg, axis, offset }`. `offset` is a perpendicular displacement **from the
  recomputed auto-route**, not an absolute coordinate — so a bend rides along when
  a connected surface moves. A bend is dropped at render time if a reflow puts its
  `seg` out of range or changes that segment's axis (graceful degradation on
  L↔Z↔C↔U class change). At most one bend per base segment.
- **Geometry (`lib/annotations.ts`, pure):** `routeWithBends(base, bends)` layers
  bends onto the `squareRoute` auto-route — interior runs displace in place;
  anchored runs insert a `STUB`-length stub + perpendicular jog (L-bending) so the
  endpoint exit stays perpendicular (the P1 invariant). It returns the rendered
  polyline plus `SegmentMeta` provenance. `connectorRoute` wires it; `connectorPoints`
  delegates; `squareBaseRoute` exposes the unbent route for offset computation;
  `bendForDrag` converts a perpendicular drag into a bend (or null to snap-to-auto).
- **Render parity:** editor preview and the Playwright print path both consume
  `connectorPoints`; `AnnotationLayer.tsx` and the print path are unchanged, and P2
  rounded corners apply to the bent polyline unchanged. `waypoints` (absolute) is
  retained for `straight` connectors; legacy square+waypoints (no bends) renders as
  before.
- **Editor:** `PreviewAnnotations.tsx` renders a midpoint handle per draggable
  rendered segment; the drag is axis-constrained (horizontal run moves in Y,
  vertical in X) and writes `bends` immutably.
```

- [ ] **Step 3: Mark the ROADMAP epic complete**

In `ROADMAP.md`, under the "FigJam-style elbow connectors (epic)" block, mark **P3 — interactive segment handles** done with the commit range, and note the epic is complete.

- [ ] **Step 4: Run the full suite once more**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 P3 amendment + ROADMAP epic complete (connector segment handles)"
```

---

## Self-Review

**1. Spec coverage:**
- Storage model (`ConnectorBend`, offset-from-auto-route, one-bend cap) → Task 1 (schema + interior) + Task 2 (anchored).
- Graceful drop (out-of-range / axis-mismatch) → Task 1 tests.
- Ride-with-reflow → Task 1 test (shifted base, same offset).
- L-bending (insert detour, perpendicular-exit stub) → Task 2.
- `routeWithBends` provenance (`SegmentMeta`) → Tasks 1–2.
- `connectorRoute`/`squareBaseRoute`/`connectorPoints` wiring + back-compat (straight, legacy square+waypoints) → Task 3.
- P2 rounding unaffected; `AnnotationLayer` untouched → no task changes them (verified in Task 6 visual gate).
- Interaction: segment handles, axis-constrained drag, snap-to-auto → Task 4 (`bendForDrag`) + Task 5 (wiring).
- ADR-004 amendment + ROADMAP → Task 6.
- Out-of-scope items (multi-bend-per-seg, endpoint anchoring, straight rounding, obstacle avoidance) → not implemented. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every test shows exact expected values. ✓

**3. Type consistency:** `ConnectorBend { seg, axis, offset }`, `SegmentMeta { baseSeg, bend, draggable }`, `routeWithBends(base, bends)`, `connectorRoute(annotations, c) → { points, segments }`, `squareBaseRoute(annotations, c) → Point[]`, `bendForDrag(base, baseSeg, axis, pointer, tol?) → ConnectorBend | null` are used identically across Tasks 1–5. The editor passes `axis` from rendered-segment orientation and `baseSeg` from `SegmentMeta`, matching `bendForDrag`/`routeWithBends`. ✓
