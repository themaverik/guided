import { describe, it, expect } from "vitest";
import { cellPrimaryImage, imageFitClass } from "@/lib/grid-render";
import type { GridCell } from "@/lib/book-schema";

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
