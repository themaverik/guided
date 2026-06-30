# Connector Rounded Corners — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `square` connector elbows with a visible, tunable rounded corner in both the editor overlay and print.

**Architecture:** A pure `buildRoundedConnector` helper splits a connector polyline into outer marker-carrying straight end-segments (rendered in `%`, markers undistorted) and a rounded *middle* `<path>` (rendered in a nested `<svg viewBox="0 0 1 1">` with `vector-effect="non-scaling-stroke"`, reusing the existing diamond-surface pattern). Only `AnnotationLayer.ConnectorLine` changes; both editor and print go through it.

**Tech Stack:** TypeScript, React, SVG, Vitest, Playwright (print PDF). Spec: `docs/superpowers/specs/2026-06-30-connector-rounded-corners-design.md`.

## Global Constraints

- **P2 of the FigJam-elbow epic.** Do **not** touch routing geometry (P1), the schema, markers' definitions, `PreviewAnnotations`, or any other annotation kind.
- **No schema change, no migration.** Radius is a global constant `CORNER_RADIUS = 0.02` (normalized).
- **Immutability / purity:** `buildRoundedConnector` returns new point objects; no mutation.
- **Markers stay in the outer `%` space** (nested-viewBox would distort them) — the helper exposes the trimmed end-segments for exactly this.
- **Editor + print identical** — the only render change is `AnnotationLayer.ConnectorLine`; verify the print path with an actual PDF render before the docs commit.
- Verify with `pnpm typecheck` and `pnpm lint` — both clean before each commit.

---

### Task 1: `buildRoundedConnector` helper

**Files:**
- Modify: `lib/annotations.ts` (add `CORNER_RADIUS`, `buildRoundedConnector`, local `round4`/`pt`)
- Test: `lib/annotations.test.ts` (new describe block)

**Interfaces:**
- Consumes: the `Point` type already in scope.
- Produces:
  - `export const CORNER_RADIUS = 0.02`
  - `export function buildRoundedConnector(points: Point[], radius: number): { d: string; startSeg: [Point, Point]; endSeg: [Point, Point] }`

- [ ] **Step 1: Write the failing tests**

Append to `lib/annotations.test.ts`. First add `buildRoundedConnector` and `CORNER_RADIUS` to the import on line 2:

```ts
import { buildRoundedConnector, CORNER_RADIUS, connectorPoints, snapAxisVector } from "@/lib/annotations";
```

Then add this describe block at the end of the file:

```ts
describe("buildRoundedConnector — rounded elbow path", () => {
  it("a straight (2-point) connector has no corners and both end-segments equal the whole line", () => {
    const r = buildRoundedConnector([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.2);
    expect(r.d).toBe("");
    expect(r.startSeg).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(r.endSeg).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });

  it("rounds a single (L) corner with a quadratic bend and trims both end-segments", () => {
    const r = buildRoundedConnector(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      0.2,
    );
    expect(r.d).toBe("M 0.8,0 Q 1,0 1,0.2");
    expect(r.startSeg).toEqual([{ x: 0, y: 0 }, { x: 0.8, y: 0 }]);
    expect(r.endSeg).toEqual([{ x: 1, y: 0.2 }, { x: 1, y: 1 }]);
  });

  it("rounds both corners of a Z route", () => {
    const r = buildRoundedConnector(
      [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }],
      0.2,
    );
    expect(r.d).toBe("M 0.3,0 Q 0.5,0 0.5,0.2 L 0.5,0.8 Q 0.5,1 0.7,1");
    expect(r.startSeg).toEqual([{ x: 0, y: 0 }, { x: 0.3, y: 0 }]);
    expect(r.endSeg).toEqual([{ x: 0.7, y: 1 }, { x: 1, y: 1 }]);
  });

  it("clamps the radius to half the shorter adjoining segment", () => {
    const r = buildRoundedConnector(
      [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 1 }],
      0.2, // would overshoot the 0.1-long first segment; clamps to 0.05
    );
    expect(r.d).toBe("M 0.05,0 Q 0.1,0 0.1,0.05");
    expect(r.startSeg).toEqual([{ x: 0, y: 0 }, { x: 0.05, y: 0 }]);
    expect(r.endSeg).toEqual([{ x: 0.1, y: 0.05 }, { x: 0.1, y: 1 }]);
  });

  it("CORNER_RADIUS is the tunable default", () => {
    expect(CORNER_RADIUS).toBe(0.02);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test run lib/annotations.test.ts`
Expected: FAIL — `buildRoundedConnector`/`CORNER_RADIUS` not exported.

- [ ] **Step 3: Implement the helper**

In `lib/annotations.ts`, add near the other connector helpers (e.g. just below `connectorPoints`):

```ts
/** Corner radius (normalized) for rounded square-connector elbows. Clamped per
 *  corner to half the shorter adjoining segment. Tunable. */
export const CORNER_RADIUS = 0.02;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const pt = (x: number, y: number): Point => ({ x: round4(x), y: round4(y) });

/** Split a connector polyline into outer marker-carrying end segments and a
 *  rounded middle path. The first/last straight segments render as plain lines
 *  (carrying the arrowhead markers in the outer % space, undistorted); the middle
 *  replaces each interior corner with a quadratic bend of `radius` (clamped to
 *  half the shorter adjoining segment) and renders as the returned path `d` (in
 *  0..1 units for a nested viewBox). `d` is "" when there are no corners. Pure;
 *  all output coordinates are rounded to 4 decimals for stable output. */
export function buildRoundedConnector(
  points: Point[],
  radius: number,
): { d: string; startSeg: [Point, Point]; endSeg: [Point, Point] } {
  const n = points.length;
  const p0 = points[0];
  const pLast = points[n - 1];
  if (n < 3) {
    const a = pt(p0.x, p0.y);
    const b = pt(pLast.x, pLast.y);
    return { d: "", startSeg: [a, b], endSeg: [a, b] };
  }
  const f = (p: Point) => `${round4(p.x)},${round4(p.y)}`;
  const cmds: string[] = [];
  let firstPullback = pt(p0.x, p0.y);
  let lastPullback = pt(pLast.x, pLast.y);
  for (let i = 1; i < n - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dIn = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dOut = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, dIn / 2, dOut / 2);
    const inX = dIn === 0 ? 0 : (prev.x - curr.x) / dIn;
    const inY = dIn === 0 ? 0 : (prev.y - curr.y) / dIn;
    const outX = dOut === 0 ? 0 : (next.x - curr.x) / dOut;
    const outY = dOut === 0 ? 0 : (next.y - curr.y) / dOut;
    const pin = pt(curr.x + r * inX, curr.y + r * inY);
    const pout = pt(curr.x + r * outX, curr.y + r * outY);
    if (i === 1) {
      firstPullback = pin;
      cmds.push(`M ${f(pin)}`);
    } else {
      cmds.push(`L ${f(pin)}`);
    }
    cmds.push(`Q ${f(curr)} ${f(pout)}`);
    lastPullback = pout;
  }
  return {
    d: cmds.join(" "),
    startSeg: [pt(p0.x, p0.y), firstPullback],
    endSeg: [lastPullback, pt(pLast.x, pLast.y)],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test run lib/annotations.test.ts`
Expected: PASS (all five new tests; existing tests unaffected).

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test run`
Expected: typecheck clean; lint clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add lib/annotations.ts lib/annotations.test.ts
git commit -m "feat: buildRoundedConnector — rounded elbow path helper"
```

---

### Task 2: Render rounded corners in `ConnectorLine`

**Files:**
- Modify: `components/renderer/AnnotationLayer.tsx` (import + replace `ConnectorLine`)

**Interfaces:**
- Consumes: `buildRoundedConnector`, `CORNER_RADIUS` (Task 1); existing `connectorPoints`, `pct`, `endpointMarker`.
- Produces: rounded connector rendering (no new exports).

- [ ] **Step 1: Add the imports**

In `components/renderer/AnnotationLayer.tsx`, extend the `@/lib/annotations` import (lines 17–23) to include the two new names:

```ts
import {
  CORNER_RADIUS,
  FONT_STACKS,
  MARKER_PX,
  bracketSegments,
  buildRoundedConnector,
  connectorPoints,
  pct,
} from "@/lib/annotations";
```

- [ ] **Step 2: Replace `ConnectorLine`**

Replace the whole `ConnectorLine` function with:

```tsx
function ConnectorLine({
  c,
  annotations,
}: {
  c: Connector;
  annotations: Annotation[];
}) {
  const pts = connectorPoints(annotations, c);
  const { d, startSeg, endSeg } = buildRoundedConnector(pts, CORNER_RADIUS);
  const startId = `m-${c.id}-s`;
  const endId = `m-${c.id}-e`;
  return (
    <g fill="none">
      <defs>
        {endpointMarker(startId, c.from.style, c.from.size, c.stroke)}
        {endpointMarker(endId, c.to.style, c.to.size, c.stroke)}
      </defs>
      {d ? (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          overflow="visible"
          width="100%"
          height="100%"
        >
          <path
            d={d}
            stroke={c.stroke}
            strokeWidth={c.width}
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </svg>
      ) : null}
      <line
        x1={pct(startSeg[0].x)}
        y1={pct(startSeg[0].y)}
        x2={pct(startSeg[1].x)}
        y2={pct(startSeg[1].y)}
        stroke={c.stroke}
        strokeWidth={c.width}
        markerStart={
          c.from.style !== "none" ? `url(#${startId})` : undefined
        }
      />
      <line
        x1={pct(endSeg[0].x)}
        y1={pct(endSeg[0].y)}
        x2={pct(endSeg[1].x)}
        y2={pct(endSeg[1].y)}
        stroke={c.stroke}
        strokeWidth={c.width}
        markerEnd={c.to.style !== "none" ? `url(#${endId})` : undefined}
      />
    </g>
  );
}
```

- [ ] **Step 3: Typecheck, lint, full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test run`
Expected: clean / clean / green (140 tests + the 5 from Task 1 = 145).

- [ ] **Step 4: Structural check on the print SVG**

Make sure the dev server is running (`pnpm dev`), then:

Run: `curl -s http://localhost:3000/elbow-demo/print | grep -c 'vector-effect="non-scaling-stroke"'`
Expected: a count ≥ 4 (one rounded `<path>` per L/Z/C/U connector — the straight-only connectors would have none, but all four demo connectors have corners).

Run: `curl -s http://localhost:3000/elbow-demo/print | grep -oE '<path d="M[^"]*Q[^"]*"' | head`
Expected: connector paths containing `Q` (quadratic corners), e.g. the Z route's two `Q` commands.

- [ ] **Step 5: Visual verify via PDF (the gate)**

Run: `curl -s -o /tmp/elbow-demo-p2.pdf -w "%{http_code} %{size_download}\n" http://localhost:3000/api/projects/elbow-demo/pdf`
Expected: `200` and a non-trivial byte count.

Open `/tmp/elbow-demo-p2.pdf` (page 3) and confirm by eye:
- corners visibly **rounded** (not sharp 90°),
- arrowhead on the `U`/`Z` targets is **correct size and orientation** (not giant, not squished),
- **no seam/gap** where the straight end-lines meet the rounded middle,
- stroke crisp at width 2.

If the arrowhead is wrong or a seam shows, STOP and fix before committing (fallbacks: for seams add `strokeLinecap="round"` to the path and end-lines or overlap the join slightly; the marker path is already isolated in the outer `%` space so it should be unaffected).

- [ ] **Step 6: Commit**

```bash
git add components/renderer/AnnotationLayer.tsx
git commit -m "feat: render rounded connector corners (nested-path middle + outer marker end-lines)"
```

---

### Task 3: Docs — ADR-004 amendment + ROADMAP

**Files:**
- Modify: `docs/adr/ADR-004-annotation-canvas.md`
- Modify: `ROADMAP.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Amend ADR-004**

Append a new amendment section at the end of `docs/adr/ADR-004-annotation-canvas.md`:

```markdown
## Amendment (2026-06-30): rounded connector corners (P2)

`square` connector elbows now render with a visible rounded corner. Because
`AnnotationLayer` is `viewBox`-free and uses percentage coordinates (so it never
measures the DOM — required for the static print path), and SVG `<path d>` forbids
percentages, the rounded geometry is built by the pure helper
`buildRoundedConnector` (`lib/annotations.ts`) and rendered in a nested
`<svg viewBox="0 0 1 1" preserveAspectRatio="none">` with
`vector-effect="non-scaling-stroke"` — the same pattern the diamond surface uses.
Each interior corner becomes a quadratic bend of `CORNER_RADIUS = 0.02`
(normalized; clamped per corner to half the shorter adjoining segment).

Arrowhead markers use `markerUnits="userSpaceOnUse"` with px sizes, which a nested
`viewBox` would blow up and distort, so the **first and last straight segments are
drawn as outer percentage `<line>`s that carry the markers**, and only the rounded
*middle* lives in the nested path. The two meet collinearly at the corner
pull-back points, so the join is seamless and markers stay undistorted. Straight
(2-point) connectors emit no path and are unchanged. No schema change; editor and
print render identically through `ConnectorLine`. Corner arcs are slightly
elliptical under the page's non-square aspect (accepted; small radius).

P2 of the FigJam-style elbow-connector epic. Remaining: **P3** interactive
axis-constrained segment-midpoint handles + relative-offset storage (schema change
+ its own amendment).
```

- [ ] **Step 2: Update ROADMAP**

In `ROADMAP.md`, in the FigJam-elbow epic block under `## Backlog / next up`, mark P2 done. Replace the `- **P2 — rounded corners** …` bullet with:

```markdown
  - **P2 — rounded corners** — [done] (`feat/connector-rounded-corners`). Pure
    `buildRoundedConnector` helper (`lib/annotations.ts`) + `ConnectorLine` render:
    each elbow is a quadratic bend of `CORNER_RADIUS=0.02` (clamped per corner) in a
    nested `<svg viewBox="0 0 1 1">` path with `vector-effect="non-scaling-stroke"`;
    arrowhead markers kept in the outer `%` space via trimmed end-`<line>`s (nested
    viewBox would distort them), meeting the rounded middle seamlessly. No schema
    change; editor + print identical; verified in the `elbow-demo` PDF. Spec/plan
    `docs/superpowers/{specs,plans}/2026-06-30-connector-rounded-corners*`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-004-annotation-canvas.md ROADMAP.md
git commit -m "docs: ADR-004 + ROADMAP — P2 rounded connector corners"
```

---

## Self-Review notes

- **Spec coverage:** helper (Task 1) + render with marker split (Task 2) + visual gate (Task 2 Step 5) + docs (Task 3). All spec sections map to a task.
- **Type consistency:** `buildRoundedConnector(points, radius) → { d, startSeg, endSeg }` used identically in Task 1 (definition/tests) and Task 2 (render). `CORNER_RADIUS` exported in Task 1, imported in Task 2.
- **No placeholders:** every code/test step is complete; run steps give commands + expected output. The one human-judgment step (visual PDF) is explicitly a gate with a defined fallback.
