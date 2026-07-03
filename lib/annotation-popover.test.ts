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
