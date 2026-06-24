import { describe, it, expect } from "vitest";
import { createEditorStore } from "@/lib/store";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

const book: Book = {
  schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c", title: "C", description: "", steps: [] }],
};

describe("updatePageConfig", () => {
  it("patches the page config immutably", () => {
    const store = createEditorStore(book, "slug");
    store.getState().updatePageConfig({ size: "Letter", orientation: "landscape" });
    expect(store.getState().book.pageConfig).toMatchObject({ size: "Letter", orientation: "landscape" });
    // unrelated fields preserved
    expect(store.getState().book.pageConfig?.margins).toEqual(DEFAULT_PAGE_CONFIG.margins);
    // input book object not mutated
    expect(book.pageConfig).toBe(DEFAULT_PAGE_CONFIG);
  });
});
