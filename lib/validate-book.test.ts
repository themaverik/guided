import { describe, expect, test } from "vitest";
import type { Book } from "./book-schema";
import { DEFAULT_PAGE_CONFIG } from "./book-schema";
import { clampPageConfig, isSafeCssColor, sanitizeBookInput } from "./validate-book";

const base: Book = {
  title: "T",
  subtitle: "",
  author: "",
  edition: "",
  cover: "",
  chapters: [],
};

describe("isSafeCssColor", () => {
  test("accepts the colors the editor produces", () => {
    expect(isSafeCssColor("#0a84ff")).toBe(true);
    expect(isSafeCssColor("#fff")).toBe(true);
    expect(isSafeCssColor("#FFFFFF80")).toBe(true);
    expect(isSafeCssColor("white")).toBe(true);
    expect(isSafeCssColor("oklch(0.7 0.1 200)")).toBe(true);
    expect(isSafeCssColor("rgb(1, 2, 3)")).toBe(true);
  });

  test("rejects CSS-injection payloads", () => {
    expect(isSafeCssColor("red; background: url(https://evil.test/x)")).toBe(false);
    expect(isSafeCssColor("url(javascript:alert(1))")).toBe(false);
    expect(isSafeCssColor('"><script>')).toBe(false);
    expect(isSafeCssColor("var(--x)")).toBe(false);
    expect(isSafeCssColor("")).toBe(false);
    expect(isSafeCssColor(42)).toBe(false);
  });
});

describe("clampPageConfig", () => {
  test("passes a valid config through unchanged", () => {
    expect(clampPageConfig(DEFAULT_PAGE_CONFIG)).toEqual(DEFAULT_PAGE_CONFIG);
  });

  test("coerces junk fields back to defaults and clamps numbers", () => {
    const clamped = clampPageConfig({
      size: "Tabloid",
      orientation: "diagonal",
      margins: { top: -5, right: 1e9, bottom: NaN, left: 15 },
      headerH: -1,
      footerH: "x",
      custom: { w: 1, h: 99999 },
    });
    expect(clamped).toBeDefined();
    expect(clamped!.size).toBe(DEFAULT_PAGE_CONFIG.size);
    expect(clamped!.orientation).toBe("portrait");
    expect(clamped!.margins.top).toBe(0);
    expect(clamped!.margins.right).toBeLessThanOrEqual(2000);
    expect(clamped!.margins.bottom).toBe(DEFAULT_PAGE_CONFIG.margins.bottom);
    expect(clamped!.headerH).toBe(0);
    expect(clamped!.footerH).toBe(DEFAULT_PAGE_CONFIG.footerH);
    // custom dims go through clampPageMm (10–2000 mm)
    expect(clamped!.custom).toEqual({ w: 10, h: 2000 });
  });

  test("returns undefined for non-objects", () => {
    expect(clampPageConfig(null)).toBeUndefined();
    expect(clampPageConfig("A4")).toBeUndefined();
  });
});

describe("sanitizeBookInput", () => {
  test("drops unsafe pageTextColor everywhere, keeps safe ones", () => {
    const dirty: Book = {
      ...base,
      pageTextColor: "red; background: url(https://evil.test)",
      coverTextColor: "#fff",
      ending: { pageTextColor: "url(x)" },
      chapters: [
        {
          id: "c1",
          title: "C",
          description: "",
          steps: [],
          pageTextColor: "#024450",
        },
        {
          id: "c2",
          title: "D",
          description: "",
          steps: [],
          pageTextColor: "expression(alert(1))",
        },
      ],
    };
    const clean = sanitizeBookInput(dirty);
    expect(clean.pageTextColor).toBeUndefined();
    expect(clean.coverTextColor).toBe("#fff");
    expect(clean.ending?.pageTextColor).toBeUndefined();
    expect(clean.chapters[0].pageTextColor).toBe("#024450");
    expect(clean.chapters[1].pageTextColor).toBeUndefined();
    // input is not mutated
    expect(dirty.pageTextColor).toContain("evil.test");
  });

  test("clamps a present pageConfig and leaves an absent one absent", () => {
    const clean = sanitizeBookInput({
      ...base,
      pageConfig: { ...DEFAULT_PAGE_CONFIG, headerH: -10 },
    });
    expect(clean.pageConfig?.headerH).toBe(0);
    expect(sanitizeBookInput(base).pageConfig).toBeUndefined();
  });
});
