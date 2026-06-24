import { describe, it, expect } from "vitest";
import { pageDimensions, bodyRegion, resizeAdjacent } from "@/lib/grid-math";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";

describe("pageDimensions", () => {
  it("returns A4 portrait mm", () => {
    expect(pageDimensions(DEFAULT_PAGE_CONFIG)).toEqual({ w: 210, h: 297 });
  });
  it("swaps W/H in landscape", () => {
    expect(pageDimensions({ ...DEFAULT_PAGE_CONFIG, orientation: "landscape" }))
      .toEqual({ w: 297, h: 210 });
  });
  it("uses custom dimensions", () => {
    expect(pageDimensions({ ...DEFAULT_PAGE_CONFIG, size: "Custom", custom: { w: 100, h: 200 } }))
      .toEqual({ w: 100, h: 200 });
  });
  it("applies landscape to custom dimensions", () => {
    expect(
      pageDimensions({ ...DEFAULT_PAGE_CONFIG, size: "Custom", custom: { w: 100, h: 200 }, orientation: "landscape" }),
    ).toEqual({ w: 200, h: 100 });
  });
  it("falls back to A4 when size is Custom but custom dims are missing (deliberate safe default)", () => {
    expect(pageDimensions({ ...DEFAULT_PAGE_CONFIG, size: "Custom" })).toEqual({ w: 210, h: 297 });
  });
});

describe("bodyRegion", () => {
  it("subtracts margins and header/footer", () => {
    const cfg = { ...DEFAULT_PAGE_CONFIG, headerH: 10, footerH: 20 };
    // A4 210×297; x=left margin=15; y=top margin+header=25; w=210−15−15=180;
    // h = 297 − 15(top) − 15(bottom) − 10(header) − 20(footer) = 237
    expect(bodyRegion(cfg)).toEqual({ x: 15, y: 25, w: 180, h: 237 });
  });
});

describe("resizeAdjacent", () => {
  it("transfers delta from one neighbor to the other (Σ unchanged)", () => {
    const result = resizeAdjacent([0.5, 0.5], 0, 0.1, 0.1);
    expect(result[0]).toBeCloseTo(0.6);
    expect(result[1]).toBeCloseTo(0.4);
  });
  it("blocks at the floor when shrinking past minSize", () => {
    // row1 would go to 0.05 < floor 0.1 → clamp: row0 max = total2 - floor = 0.9
    const result = resizeAdjacent([0.5, 0.5], 0, 0.45, 0.1);
    expect(result[0]).toBeCloseTo(0.9);
    expect(result[1]).toBeCloseTo(0.1);
  });
  it("leaves untouched rows alone", () => {
    const result = resizeAdjacent([0.3, 0.3, 0.4], 1, 0.1, 0.05);
    expect(result[0]).toBeCloseTo(0.3);
    expect(result[1]).toBeCloseTo(0.4);
    expect(result[2]).toBeCloseTo(0.3);
  });
  it("handles a negative delta (shrinks the dragged side, floored)", () => {
    const result = resizeAdjacent([0.5, 0.5], 0, -0.45, 0.1);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(0.9);
  });
});
