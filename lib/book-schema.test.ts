import { describe, it, expect } from "vitest";
import { DEFAULT_PAGE_CONFIG, CURRENT_SCHEMA_VERSION } from "@/lib/book-schema";

describe("schema defaults", () => {
  it("defaults to A4 portrait, 15mm margins, no header/footer", () => {
    expect(DEFAULT_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      headerH: 0,
      footerH: 0,
    });
  });
  it("current schema version is 2", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
