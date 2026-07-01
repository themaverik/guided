import { describe, it, expect } from "vitest";
import { buildRoundedConnector, CORNER_RADIUS, connectorPoints, snapAxisVector, routeWithBends, squareBaseRoute, bendForDrag, snapAlign, nearestPoint, rectAnchors } from "@/lib/annotations";
import type { Annotation, Connector, Surface } from "@/lib/book-schema";

const deg = (d: number) => (d * Math.PI) / 180;

const box = (id: string, x: number, y: number, w: number, h: number): Surface => ({
  id,
  kind: "box",
  x,
  y,
  w,
  h,
  stroke: "#000",
  width: 2,
});

const connector = (from: Connector["from"], to: Connector["to"], routing: Connector["routing"]): Connector => ({
  id: "c1",
  kind: "connector",
  from,
  to,
  stroke: "#000",
  width: 2,
  routing,
});

describe("connectorPoints — routing basics", () => {
  it("straight routing is just the two endpoints", () => {
    const c = connector({ x: 0.2, y: 0.3, style: "none" }, { x: 0.8, y: 0.7, style: "arrow" }, "straight");
    expect(connectorPoints([], c)).toEqual([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.7 },
    ]);
  });

  it("manual waypoints take over the path shape", () => {
    const c: Connector = {
      ...connector({ x: 0.1, y: 0.1, style: "none" }, { x: 0.9, y: 0.9, style: "arrow" }, "square"),
      waypoints: [{ x: 0.5, y: 0.2 }],
    };
    expect(connectorPoints([], c)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.2 },
      { x: 0.9, y: 0.9 },
    ]);
  });
});

describe("connectorPoints — square routing of free points (dominant-axis heuristic)", () => {
  it("inserts a horizontal-first corner when the run is wider than tall", () => {
    const c = connector({ x: 0.2, y: 0.3, style: "none" }, { x: 0.8, y: 0.5, style: "arrow" }, "square");
    // wider than tall → go horizontal first: corner shares the start's y.
    expect(connectorPoints([], c)).toEqual([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.3 },
      { x: 0.8, y: 0.5 },
    ]);
  });

  it("inserts a vertical-first corner when the run is taller than wide", () => {
    const c = connector({ x: 0.3, y: 0.2, style: "none" }, { x: 0.5, y: 0.8, style: "arrow" }, "square");
    // taller than wide → go vertical first: corner shares the start's x.
    expect(connectorPoints([], c)).toEqual([
      { x: 0.3, y: 0.2 },
      { x: 0.3, y: 0.8 },
      { x: 0.5, y: 0.8 },
    ]);
  });
});

describe("connectorPoints — square routing respects anchored edges", () => {
  // A connector bound to a surface edge must leave/enter perpendicular to that
  // edge, regardless of the dominant-axis heuristic. Anchor points come from
  // box arithmetic (0.1 + 0.2 etc.), so assert the segment orientation with
  // toBeCloseTo rather than exact float coordinates.
  const surfaces: Annotation[] = [
    box("boxA", 0.1, 0.1, 0.2, 0.15), // right (0.30, 0.175), bottom (0.20, 0.25)
    box("boxB", 0.6, 0.6, 0.2, 0.15), // top   (0.70, 0.60)
  ];
  /** First segment horizontal (exits/enters along x), then vertical. */
  const expectHorizontalFirst = (pts: { x: number; y: number }[]) => {
    expect(pts).toHaveLength(3);
    expect(pts[1].y).toBeCloseTo(pts[0].y, 10); // segment 1 is horizontal
    expect(pts[1].x).toBeCloseTo(pts[2].x, 10); // segment 2 is vertical
  };
  it("exits a right-anchored source horizontally even when the run is taller than wide", () => {
    // from boxA right (0.30, 0.175) to a free point (0.70, 0.60): |dx|=0.40 < |dy|=0.425,
    // so the bare heuristic would go vertical-first and run down the box's edge. The
    // right anchor must force a horizontal-first exit.
    const c = connector({ ref: "boxA", anchor: "right", style: "none" }, { x: 0.7, y: 0.6, style: "arrow" }, "square");
    expectHorizontalFirst(connectorPoints(surfaces, c));
  });

  it("enters a top-anchored target vertically even when the run is taller than wide", () => {
    // free source (0.50, 0.10) to boxB top (0.70, 0.60): |dx|=0.20 < |dy|=0.50, so the
    // bare heuristic would go vertical-first and enter the top anchor from the side. The
    // top anchor must force the final segment to be vertical (horizontal-first overall).
    const c = connector({ x: 0.5, y: 0.1, style: "none" }, { ref: "boxB", anchor: "top", style: "arrow" }, "square");
    expectHorizontalFirst(connectorPoints(surfaces, c));
  });
});

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
});

describe("snapAxisVector — angle-based axis snapping", () => {
  it("snaps a near-horizontal vector flat regardless of length", () => {
    const slope = Math.tan(deg(3)); // 3° off horizontal
    expect(snapAxisVector(0.05, 0.05 * slope, false).dy).toBe(0); // short
    expect(snapAxisVector(0.6, 0.6 * slope, false).dy).toBe(0); // long
  });

  it("does NOT snap a clearly diagonal short vector (the reported bug)", () => {
    // 30° on a short connector: |dy| ≈ 0.0289 < the old 0.04 distance rule, which
    // wrongly snapped it flat. Angle-based snapping keeps the diagonal.
    const dy = 0.05 * Math.tan(deg(30));
    expect(dy).toBeLessThan(0.04); // would have tripped the old distance snap
    expect(snapAxisVector(0.05, dy, false)).toEqual({ dx: 0.05, dy });
  });

  it("snaps a near-vertical vector to vertical", () => {
    const dx = 0.4 * Math.tan(deg(3));
    expect(snapAxisVector(dx, 0.4, false)).toEqual({ dx: 0, dy: 0.4 });
  });

  it("leaves a 45° vector unsnapped", () => {
    expect(snapAxisVector(0.3, 0.3, false)).toEqual({ dx: 0.3, dy: 0.3 });
  });

  it("shift hard-locks to the dominant axis even off-axis", () => {
    expect(snapAxisVector(0.3, 0.29, true)).toEqual({ dx: 0.3, dy: 0 });
    expect(snapAxisVector(0.29, 0.3, true)).toEqual({ dx: 0, dy: 0.3 });
  });

  it("preserves sign when snapping (lines allow negative extent)", () => {
    expect(snapAxisVector(-0.5, 0.01, false)).toEqual({ dx: -0.5, dy: 0 });
  });

  it("returns a zero vector unchanged", () => {
    expect(snapAxisVector(0, 0, false)).toEqual({ dx: 0, dy: 0 });
  });
});

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
    // moving centerX = 0.49; target centerX = 0.5 (target edges 0.45/0.55 kept clear
    // of the moving lines so any-to-any doesn't grab an edge first).
    const res = snapAlign(r(0.39, 0.4, 0.2, 0.2), [r(0.45, 0.0, 0.1, 0.02)], T, T, "move");
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
    // moving left = 0.5; guide lines at 0.515 (d 0.015) and 0.49 (d 0.01) → pick 0.49.
    // Degenerate rects (w=h=0) act as single vertical guide lines; y=0.9 keeps them
    // clear of the moving Y lines.
    const res = snapAlign(r(0.5, 0.3, 0.1, 0.1), [r(0.515, 0.9, 0, 0), r(0.49, 0.9, 0, 0)], T, T, "move");
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
      // Single guide lines: one vertical at x=0.5, one horizontal at y=0.5.
      [r(0.5, 0.9, 0, 0) /* x-line 0.5 */, r(0.9, 0.5, 0, 0) /* y-line 0.5 */],
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
