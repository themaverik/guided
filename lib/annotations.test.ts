import { describe, it, expect } from "vitest";
import { connectorPoints } from "@/lib/annotations";
import type { Annotation, Connector, Surface } from "@/lib/book-schema";

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
  /** First segment vertical (exits/enters along y), then horizontal. */
  const expectVerticalFirst = (pts: { x: number; y: number }[]) => {
    expect(pts).toHaveLength(3);
    expect(pts[1].x).toBeCloseTo(pts[0].x, 10); // segment 1 is vertical
    expect(pts[1].y).toBeCloseTo(pts[2].y, 10); // segment 2 is horizontal
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

  it("the source anchor wins when both endpoints are anchored", () => {
    // from boxA bottom (vertical exit) to boxB top (vertical entry): both agree on
    // vertical, so the corner is vertical-first off the source.
    const c = connector(
      { ref: "boxA", anchor: "bottom", style: "none" },
      { ref: "boxB", anchor: "top", style: "arrow" },
      "square",
    );
    expectVerticalFirst(connectorPoints(surfaces, c));
  });
});
