import { describe, expect, it } from "vitest";
import { pageInkVars, resolvePageBackground } from "./book-render";

describe("pageInkVars", () => {
  it("returns no overrides when the color is unset", () => {
    expect(pageInkVars()).toEqual({});
    expect(pageInkVars(undefined)).toEqual({});
    expect(pageInkVars("")).toEqual({});
  });

  it("overrides the ink family and derives a translucent muted variant", () => {
    const v = pageInkVars("#ffffff") as Record<string, string>;
    expect(v["--ink"]).toBe("#ffffff");
    expect(v["--ink-text"]).toBe("#ffffff");
    expect(v["--accent"]).toBe("#ffffff");
    expect(v["--muted"]).toBe("color-mix(in srgb, #ffffff 70%, transparent)");
    expect(v["--rule"]).toBe("color-mix(in srgb, #ffffff 22%, transparent)");
    expect(v["--rule-strong"]).toBe(
      "color-mix(in srgb, #ffffff 40%, transparent)",
    );
  });
});

describe("resolvePageBackground", () => {
  const base = "/api/projects/s/assets";
  it("uses the page background when it has an image", () => {
    const r = resolvePageBackground(base, { image: "p.png", opacity: 0.5 }, { image: "book.png" });
    expect(r).toEqual({ image: `${base}/_background/p.png`, opacity: 0.5 });
  });
  it("falls back to the book background", () => {
    const r = resolvePageBackground(base, undefined, { image: "book.png" });
    expect(r!.image).toBe(`${base}/_background/book.png`);
  });
  it("returns undefined when neither has an image", () => {
    expect(resolvePageBackground(base, {}, undefined)).toBeUndefined();
  });
});
