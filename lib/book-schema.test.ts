import { describe, it, expect } from "vitest";
import { DEFAULT_PAGE_CONFIG, LEGACY_PAGE_CONFIG, CURRENT_SCHEMA_VERSION } from "@/lib/book-schema";

describe("schema defaults", () => {
  it("new-project default: A4 portrait, 15mm margins, header 15mm, footer 10mm", () => {
    expect(DEFAULT_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      headerH: 15,
      footerH: 10,
    });
  });
  it("legacy-migration config preserves current geometry: 18mm margins, no header/footer", () => {
    expect(LEGACY_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 18, right: 18, bottom: 18, left: 18 },
      headerH: 0,
      footerH: 0,
    });
  });
  it("current schema version is 2", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
