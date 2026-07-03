import { describe, it, expect } from "vitest";
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS } from "./annotation-options";

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
});
