import { describe, it, expect } from "vitest";
import { resizeGridRow, resizeGridColumn } from "@/lib/book-mutations";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

function gridBook(): Book {
  return {
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [
        { heightFr: 0.5, cells: [
          { widthFr: 0.5, objects: [] },
          { widthFr: 0.5, objects: [] },
        ] },
        { heightFr: 0.5, cells: [{ widthFr: 1, objects: [] }] },
      ],
    }] }],
  };
}

describe("resizeGridRow", () => {
  it("moves height across the divider, conserving the total", () => {
    const out = resizeGridRow(gridBook(), 0, 0, 0, 0.1);
    const h = out.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h[0]).toBeCloseTo(0.6, 6);
    expect(h[1]).toBeCloseTo(0.4, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
  });
  it("does not mutate the input book", () => {
    const book = gridBook();
    resizeGridRow(book, 0, 0, 0, 0.1);
    expect(book.chapters[0].steps[0].grid![0].heightFr).toBe(0.5);
  });
});

describe("resizeGridColumn", () => {
  it("moves width across the divider within the row, conserving the total", () => {
    const out = resizeGridColumn(gridBook(), 0, 0, 0, 0, -0.1);
    const w = out.chapters[0].steps[0].grid![0].cells.map((c) => c.widthFr);
    expect(w[0]).toBeCloseTo(0.4, 6);
    expect(w[1]).toBeCloseTo(0.6, 6);
    expect(w[0] + w[1]).toBeCloseTo(1, 6);
  });
});
