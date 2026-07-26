import { describe, it, expect } from "vitest";
import {
  SWATCHES,
  WIDTH_PRESETS,
  DEFAULT_SWATCH_ID,
  DEFAULT_STROKE,
  swatchByStroke,
  swatchPatch,
  fillForStroke,
  mixToWhite,
  rgbaFromHex,
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

describe("fill tint", () => {
  it("mixToWhite lightens each channel toward white by amount", () => {
    expect(mixToWhite("#000000", 1)).toBe("#ffffff");
    expect(mixToWhite("#000000", 0)).toBe("#000000");
    expect(mixToWhite("#ffffff", 0.5)).toBe("#ffffff");
    expect(mixToWhite("not-a-hex", 0.5)).toBe("not-a-hex");
  });

  it("fillForStroke returns the exact paired fill for every swatch stroke", () => {
    for (const s of SWATCHES) {
      expect(fillForStroke(s.stroke)).toBe(s.fill);
      expect(fillForStroke(s.stroke.toUpperCase())).toBe(s.fill);
    }
  });

  it("fillForStroke lightens an off-palette stroke", () => {
    const out = fillForStroke("#123456");
    expect(out).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out).not.toBe("#123456");
    // all channels strictly lightened (none is 255 in #123456)
    const src = [0x12, 0x34, 0x56];
    const got = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    got.forEach((c, i) => expect(c).toBeGreaterThan(src[i]));
  });

  it("swatchPatch adds fill only for filled closed shapes", () => {
    const sw = SWATCHES[1]; // red
    expect(swatchPatch(sw, "box", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "diamond", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "ellipse", true).fill).toBe(sw.fill);
    expect(swatchPatch(sw, "box", false).fill).toBeUndefined();
    expect(swatchPatch(sw, "line", true).fill).toBeUndefined();
    expect(swatchPatch(sw, "text", true).fill).toBeUndefined();
    expect(swatchPatch(sw, "box").fill).toBeUndefined(); // default filled=false
  });
});

describe("rgbaFromHex", () => {
  it("converts a hex + alpha to rgba", () => {
    expect(rgbaFromHex("#1A5FB4", 0.5)).toBe("rgba(26, 95, 180, 0.5)");
  });
  it("passes a malformed hex through unchanged", () => {
    expect(rgbaFromHex("nope", 0.5)).toBe("nope");
  });
  it("handles alpha 0 and 1", () => {
    expect(rgbaFromHex("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
    expect(rgbaFromHex("#ffffff", 0)).toBe("rgba(255, 255, 255, 0)");
  });
});

describe("swatchPatch", () => {
  const red = SWATCHES.find((s) => s.id === "red")!;

  it("sets stroke + swatchId and no color for non-text shapes", () => {
    const p = swatchPatch(red, "box");
    expect(p).toEqual({ stroke: red.stroke, swatchId: "red" });
    expect("color" in p).toBe(false);
  });

  it("adds color for text shapes", () => {
    const p = swatchPatch(red, "text");
    expect(p).toEqual({ stroke: red.stroke, swatchId: "red", color: red.stroke });
  });
});
