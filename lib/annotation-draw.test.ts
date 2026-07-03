import { describe, it, expect } from "vitest";
import { buildDrawnShape } from "./annotation-draw";

const A = { x: 0.2, y: 0.2 };
const B = { x: 0.6, y: 0.5 };
const style = { color: "#cb4a47", width: 4, swatchId: "red" };

describe("buildDrawnShape", () => {
  it("returns null for the select tool", () => {
    expect(buildDrawnShape("select", A, B, style)).toBeNull();
  });

  it("builds a box carrying stroke, width, swatchId from the style", () => {
    const s = buildDrawnShape("box", A, B, style);
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("box");
    expect(s!.stroke).toBe("#cb4a47");
    expect(s!.width).toBe(4);
    expect(s!.swatchId).toBe("red");
  });

  it("builds text using color (not stroke) plus width + swatchId", () => {
    const s = buildDrawnShape("text", A, B, style);
    expect(s!.kind).toBe("text");
    // Surface.color is text-only; narrow to read it.
    expect((s as { color?: string }).color).toBe("#cb4a47");
    expect(s!.width).toBe(4);
    expect(s!.swatchId).toBe("red");
  });

  it("builds a connector with endpoints from the drag and style stroke/width/swatchId", () => {
    const c = buildDrawnShape("connector", A, B, style);
    expect(c!.kind).toBe("connector");
    expect(c!.stroke).toBe("#cb4a47");
    expect(c!.width).toBe(4);
    expect(c!.swatchId).toBe("red");
    const conn = c as { from: { x: number; y: number }; to: { x: number; y: number } };
    expect(conn.from.x).toBeCloseTo(0.2);
    expect(conn.from.y).toBeCloseTo(0.2);
    expect(conn.to.x).toBeCloseTo(0.6);
    expect(conn.to.y).toBeCloseTo(0.5);
  });
});
