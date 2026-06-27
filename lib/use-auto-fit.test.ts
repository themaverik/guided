import { describe, it, expect } from "vitest";
import { gridFitScale, MIN_GRID_SCALE } from "@/lib/use-auto-fit";

describe("gridFitScale", () => {
  it("returns 1 when every cell fits (empty or ratio ≤ 1)", () => {
    expect(gridFitScale([], 0.5)).toBe(1);
    expect(gridFitScale([0.8, 1], 0.5)).toBe(1);
  });
  it("returns 1/worst for the worst overflow", () => {
    expect(gridFitScale([1.25, 1.5], 0.5)).toBeCloseTo(1 / 1.5, 6);
  });
  it("floors at minScale", () => {
    expect(gridFitScale([3], 0.5)).toBe(0.5);
  });
  it("MIN_GRID_SCALE is 0.5", () => {
    expect(MIN_GRID_SCALE).toBe(0.5);
  });
});
