import { describe, it, expect } from "vitest";
import { resizeGridRow, resizeGridColumn, addGridRow, removeGridRow, addGridColumn, removeGridColumn, setStepLayoutMode } from "@/lib/book-mutations";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

function legacyBook(): Book {
  return {
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      title: "S", instruction: "", image: "a.jpg", layout: "single",
    }] }],
  };
}

describe("setStepLayoutMode", () => {
  it("seeds a grid from the step content when switching to grid with no grid", () => {
    const out = setStepLayoutMode(legacyBook(), 0, 0, "grid");
    const step = out.chapters[0].steps[0];
    expect(step.layoutMode).toBe("grid");
    expect(step.grid).toBeDefined();
    expect(step.grid!.length).toBeGreaterThan(0);
    // the existing image carries over as the primary object
    expect(step.grid![0].cells[0].objects[0]?.ref).toBe("a.jpg");
  });

  it("does not overwrite an existing grid", () => {
    const seeded = setStepLayoutMode(legacyBook(), 0, 0, "grid");
    const before = seeded.chapters[0].steps[0].grid;
    const again = setStepLayoutMode(seeded, 0, 0, "grid");
    expect(again.chapters[0].steps[0].grid).toEqual(before);
  });

  it("does not mutate the input book", () => {
    const book = legacyBook();
    setStepLayoutMode(book, 0, 0, "grid");
    expect(book.chapters[0].steps[0].layoutMode).toBeUndefined();
    expect(book.chapters[0].steps[0].grid).toBeUndefined();
  });
});

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

function oneByOne(): Book {
  return {
    schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
    title: "T", subtitle: "", author: "", edition: "", cover: "",
    chapters: [{ id: "c", title: "C", description: "", steps: [{
      layoutMode: "grid",
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
    }] }],
  };
}

describe("grid structure mutations", () => {
  it("addGridRow appends a row and renormalizes heights to sum 1", () => {
    const out = addGridRow(oneByOne(), 0, 0);
    const h = out.chapters[0].steps[0].grid!.map((r) => r.heightFr);
    expect(h).toHaveLength(2);
    expect(h[0]).toBeCloseTo(0.5, 6);
    expect(h[0] + h[1]).toBeCloseTo(1, 6);
    expect(out.chapters[0].steps[0].grid![1].cells).toHaveLength(1);
  });

  it("removeGridRow drops a row and renormalizes; keeps at least one", () => {
    const two = addGridRow(oneByOne(), 0, 0);
    const out = removeGridRow(two, 0, 0, 1);
    expect(out.chapters[0].steps[0].grid).toHaveLength(1);
    expect(out.chapters[0].steps[0].grid![0].heightFr).toBeCloseTo(1, 6);
    // removing the last remaining row is a no-op
    const same = removeGridRow(out, 0, 0, 0);
    expect(same.chapters[0].steps[0].grid).toHaveLength(1);
  });

  it("addGridColumn appends a cell to the row and renormalizes widths", () => {
    const out = addGridColumn(oneByOne(), 0, 0, 0);
    const w = out.chapters[0].steps[0].grid![0].cells.map((c) => c.widthFr);
    expect(w).toHaveLength(2);
    expect(w[0]).toBeCloseTo(0.5, 6);
    expect(w[0] + w[1]).toBeCloseTo(1, 6);
  });

  it("removeGridColumn drops a cell and renormalizes; keeps at least one", () => {
    const two = addGridColumn(oneByOne(), 0, 0, 0);
    const out = removeGridColumn(two, 0, 0, 0, 1);
    expect(out.chapters[0].steps[0].grid![0].cells).toHaveLength(1);
    expect(out.chapters[0].steps[0].grid![0].cells[0].widthFr).toBeCloseTo(1, 6);
    const same = removeGridColumn(out, 0, 0, 0, 0);
    expect(same.chapters[0].steps[0].grid![0].cells).toHaveLength(1);
  });

  it("does not mutate the input book", () => {
    const book = oneByOne();
    addGridRow(book, 0, 0);
    expect(book.chapters[0].steps[0].grid).toHaveLength(1);
  });
});
