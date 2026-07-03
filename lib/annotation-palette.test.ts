import { describe, it, expect } from "vitest";
import {
  SWATCHES,
  WIDTH_PRESETS,
  DEFAULT_SWATCH_ID,
  DEFAULT_STROKE,
  swatchByStroke,
} from "./annotation-palette";

describe("annotation palette", () => {
  it("has 8 swatches with unique ids and 6-digit hex fill + stroke", () => {
    expect(SWATCHES).toHaveLength(8);
    expect(new Set(SWATCHES.map((s) => s.id)).size).toBe(8);
    for (const s of SWATCHES) {
      expect(s.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.stroke).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("maps every swatch stroke back to its id (case-insensitive)", () => {
    for (const s of SWATCHES) {
      expect(swatchByStroke(s.stroke)).toBe(s.id);
      expect(swatchByStroke(s.stroke.toUpperCase())).toBe(s.id);
    }
  });

  it("returns undefined for an off-palette color", () => {
    expect(swatchByStroke("#123456")).toBeUndefined();
    expect(swatchByStroke("#658995")).toBeUndefined();
  });

  it("width presets are exactly 1 / 2 / 4 / 6", () => {
    expect(WIDTH_PRESETS.map((w) => w.value)).toEqual([1, 2, 4, 6]);
  });

  it("default swatch resolves to a real swatch whose stroke is DEFAULT_STROKE", () => {
    const d = SWATCHES.find((s) => s.id === DEFAULT_SWATCH_ID);
    expect(d).toBeDefined();
    expect(DEFAULT_STROKE).toBe(d!.stroke);
    expect(DEFAULT_STROKE).toBe("#024450");
  });
});
