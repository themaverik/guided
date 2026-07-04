import { describe, it, expect } from "vitest";
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS, SIZES, ANCHORS, FONTS, FONT_LABELS, ALIGNS } from "./annotation-options";

describe("annotation options", () => {
  it("lists the six endpoint styles", () => {
    expect(ENDPOINT_STYLES).toEqual(["none", "arrow", "circle", "diamond", "point", "bar"]);
  });
  it("has straight + square routings", () => {
    expect(ROUTINGS.map((r) => r.value)).toEqual(["straight", "square"]);
  });
  it("has auto + four directions, auto first with empty value", () => {
    expect(DIRECTION_OPTIONS.map((d) => d.value)).toEqual(["", "left", "right", "up", "down"]);
  });

  it("routing labels are straight and rectangular", () => {
    expect(ROUTINGS.map((r) => r.label)).toEqual(["straight", "rectangular"]);
  });

  it("direction labels carry the auto + arrow-prefixed set", () => {
    expect(DIRECTION_OPTIONS.map((d) => d.label)).toEqual([
      "auto dir",
      "← left",
      "→ right",
      "↑ up",
      "↓ down",
    ]);
  });
});

describe("annotation options — sizes/anchors/fonts/aligns", () => {
  it("endpoint sizes are small/medium/large", () => {
    expect(SIZES).toEqual(["small", "medium", "large"]);
  });
  it("anchors include center + edges + connector ends", () => {
    expect(ANCHORS).toEqual([
      "center", "top", "bottom", "left", "right",
      "top-left", "top-right", "bottom-left", "bottom-right",
      "start", "end", "mid",
    ]);
  });
  it("fonts each have a label", () => {
    expect(FONTS).toEqual(["sans", "serif", "mono", "open-sans", "montserrat", "roboto"]);
    for (const f of FONTS) expect(FONT_LABELS[f].length).toBeGreaterThan(0);
  });
  it("aligns are left/center/right", () => {
    expect(ALIGNS).toEqual(["left", "center", "right"]);
  });
});
