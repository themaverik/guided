import { describe, it, expect } from "vitest";
import { pageDimensions, bodyRegion } from "@/lib/grid-math";
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
});

describe("bodyRegion", () => {
  it("subtracts margins and header/footer", () => {
    const cfg = { ...DEFAULT_PAGE_CONFIG, headerH: 10, footerH: 20 };
    // A4 210×297; x=left margin=15; y=top margin+header=25; w=210−15−15=180;
    // h = 297 − 15(top) − 15(bottom) − 10(header) − 20(footer) = 237
    expect(bodyRegion(cfg)).toEqual({ x: 15, y: 25, w: 180, h: 237 });
  });
});
