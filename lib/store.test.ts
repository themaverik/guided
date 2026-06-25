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

const bookWithStep: Book = {
  schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c", title: "C", description: "", steps: [{ title: "S" }] }],
};

describe("updateStep layoutMode", () => {
  it("sets layoutMode on the step immutably", () => {
    const store = createEditorStore(bookWithStep, "slug");
    store.getState().updateStep(0, 0, { layoutMode: "grid" });
    expect(store.getState().book.chapters[0].steps[0].layoutMode).toBe("grid");
    // input book not mutated
    expect(bookWithStep.chapters[0].steps[0].layoutMode).toBeUndefined();
  });
});

describe("grid resize actions", () => {
  const gridBook = (): Book => ({
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
      ],
    }] }],
  });

  it("resizeGridRow updates row fractions on the store", () => {
    const store = createEditorStore(gridBook(), "slug");
    store.getState().resizeGridRow(0, 0, 0, 0.1);
    const h = store.getState().book.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h[0]).toBeCloseTo(0.6, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
  });
});
