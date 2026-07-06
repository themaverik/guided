import { describe, expect, it } from "vitest";
import { pageInkVars } from "./book-render";

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
