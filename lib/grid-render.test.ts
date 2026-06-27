import { describe, it, expect } from "vitest";
import { cellPrimaryImage, imageFitClass, isFloatingCallout, flowObjects, floatingCallouts } from "@/lib/grid-render";
import type { GridCell, StackedObject } from "@/lib/book-schema";

const imageObj = (ref?: string) => ({
  id: "o1", role: "primary" as const, kind: "image" as const,
  x: 0, y: 0, w: 1, h: 1, ref,
});

describe("cellPrimaryImage", () => {
  it("returns the primary image object", () => {
    const cell: GridCell = { widthFr: 1, objects: [imageObj("a.jpg")] };
    expect(cellPrimaryImage(cell)?.ref).toBe("a.jpg");
  });
  it("returns undefined for an empty cell", () => {
    const cell: GridCell = { widthFr: 1, objects: [] };
    expect(cellPrimaryImage(cell)).toBeUndefined();
  });
  it("ignores secondary / non-image objects", () => {
    const cell: GridCell = {
      widthFr: 1,
      objects: [{ id: "c", role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1 }],
    };
    expect(cellPrimaryImage(cell)).toBeUndefined();
  });
});

describe("imageFitClass", () => {
  it("returns '' for contain / undefined (markup unchanged)", () => {
    expect(imageFitClass()).toBe("");
    expect(imageFitClass("contain")).toBe("");
  });
  it("maps the crop modes to their class", () => {
    expect(imageFitClass("fit-width")).toBe("fit-width");
    expect(imageFitClass("fit-height")).toBe("fit-height");
  });
});

const img = (id: string): StackedObject => ({ id, role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.png" });
const flowCo = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const floatCo = (id: string): StackedObject => ({ ...flowCo(id), positioned: true, x: 0.2, y: 0.3, w: 0.4 });
const cellWith = (objects: StackedObject[]): GridCell => ({ widthFr: 1, objects });

describe("grid-render floating partition", () => {
  it("isFloatingCallout: only positioned callouts", () => {
    expect(isFloatingCallout(floatCo("a"))).toBe(true);
    expect(isFloatingCallout(flowCo("b"))).toBe(false);
    // a positioned IMAGE is NOT a floating callout (kind guard)
    expect(isFloatingCallout({ ...img("c"), positioned: true })).toBe(false);
  });

  it("flowed-only cell: all flow, none floating", () => {
    const cell = cellWith([img("i"), flowCo("c")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i", "c"]);
    expect(floatingCallouts(cell)).toEqual([]);
  });

  it("floating-only callout: not in flow", () => {
    const cell = cellWith([img("i"), floatCo("f")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i"]);
    expect(floatingCallouts(cell).map((o) => o.id)).toEqual(["f"]);
  });

  it("mixed cell: partitions flow vs floating, preserves order", () => {
    const cell = cellWith([img("i"), flowCo("c"), floatCo("f")]);
    expect(flowObjects(cell).map((o) => o.id)).toEqual(["i", "c"]);
    expect(floatingCallouts(cell).map((o) => o.id)).toEqual(["f"]);
  });

  it("empty cell: both empty", () => {
    const cell = cellWith([]);
    expect(flowObjects(cell)).toEqual([]);
    expect(floatingCallouts(cell)).toEqual([]);
  });
});
