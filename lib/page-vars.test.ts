import { describe, it, expect } from "vitest";
import { pageVars } from "@/lib/page-vars";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";

describe("pageVars", () => {
  it("emits mm CSS vars for the new-project default (A4 portrait)", () => {
    expect(pageVars(DEFAULT_PAGE_CONFIG)).toEqual({
      "--page-w": "210mm",
      "--page-h": "297mm",
      "--page-margin": "15mm",
      "--page-header-h": "15mm",
      "--page-footer-h": "10mm",
    });
  });
  it("falls back to legacy geometry when config is undefined", () => {
    expect(pageVars(undefined)).toEqual({
      "--page-w": "210mm",
      "--page-h": "297mm",
      "--page-margin": "18mm",
      "--page-header-h": "0mm",
      "--page-footer-h": "0mm",
    });
  });
});
