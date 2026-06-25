import { describe, it, expect } from "vitest";
import { parseBookSource } from "@/lib/book-io";
import { CURRENT_SCHEMA_VERSION, LEGACY_PAGE_CONFIG } from "@/lib/book-schema";

describe("parseBookSource migrates on load", () => {
  it("stamps a legacy window.BOOK to the current schema version with legacy geometry", () => {
    const src = `window.BOOK = { title: "T", subtitle: "", author: "", edition: "", cover: "", chapters: [{ id: "c", title: "C", description: "", steps: [{ image: "a.jpg" }] }] };`;
    const book = parseBookSource(src);
    expect(book.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(book.pageConfig).toEqual(LEGACY_PAGE_CONFIG);
    expect(book.chapters[0].steps[0].grid).toBeDefined();
    // lossless: original field survives
    expect(book.chapters[0].steps[0].image).toBe("a.jpg");
  });
});
