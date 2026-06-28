import { describe, it, expect } from "vitest";
import { resizeGridRow, resizeGridColumn, addGridRow, removeGridRow, addGridColumn, removeGridColumn, setStepLayoutMode, setCellImage, removeCellImage, setCellImageFit, addCellCallout, updateCellCallout, removeCellObject, moveCellObject, updateCellObjectPlacement, addCellText, updateCellText, setCellTextAlign, setCellImageBorder } from "@/lib/book-mutations";
import { DEFAULT_PAGE_CONFIG, type Book, type StackedObject } from "@/lib/book-schema";

const bookWith = (step: Book["chapters"][0]["steps"][0]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps: [step] }],
});

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

describe("setStepLayoutMode — carries callouts", () => {
  it("rebuilds the grid (with callouts) when toggling a legacy step to grid", () => {
    // Simulate a migrated step: has an image-only grid skeleton (no callout cell)
    // but layoutMode is NOT "grid" yet. The callouts live on the legacy fields.
    const book = bookWith({
      image: "a.jpg", layout: "single",
      callouts: [{ type: "info", body: "hi" }], calloutLayout: "side",
      // Pre-existing image-only skeleton (as migration produces): only 1 cell (no callout cell)
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [{ id: "x", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.jpg" }] }] }],
    });
    const out = setStepLayoutMode(book, 0, 0, "grid");
    const grid = out.chapters[0].steps[0].grid!;
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "hi" });
    expect(out.chapters[0].steps[0].layoutMode).toBe("grid");
  });

  it("does not rebuild a step already in grid mode (preserves edits)", () => {
    const edited = bookWith({
      image: "a.jpg", layoutMode: "grid",
      grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
    });
    const out = setStepLayoutMode(edited, 0, 0, "grid");
    expect(out.chapters[0].steps[0].grid).toEqual(edited.chapters[0].steps[0].grid);
  });

  it("does not mutate the input book", () => {
    const book = bookWith({ image: "a.jpg", callouts: [{ type: "info", body: "x" }] });
    const snapshot = structuredClone(book);
    setStepLayoutMode(book, 0, 0, "grid");
    expect(book).toEqual(snapshot);
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

const gridBookCell = (objects: StackedObject[]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});
const cellObjs = (b: Book) => b.chapters[0].steps[0].grid![0].cells[0].objects;

describe("cell mutations", () => {
  it("setCellImage creates a primary image (first) on an empty cell", () => {
    const out = setCellImage(gridBookCell([]), 0, 0, 0, 0, "a.jpg");
    expect(cellObjs(out)[0]).toMatchObject({ role: "primary", kind: "image", ref: "a.jpg" });
  });
  it("setCellImage updates the existing primary ref", () => {
    const start = gridBookCell([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "old.jpg" }]);
    const out = setCellImage(start, 0, 0, 0, 0, "new.jpg");
    expect(cellObjs(out).filter((o) => o.kind === "image")).toHaveLength(1);
    expect(cellObjs(out)[0].ref).toBe("new.jpg");
  });
  it("removeCellImage drops the primary image", () => {
    const start = gridBookCell([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.jpg" }]);
    expect(cellObjs(removeCellImage(start, 0, 0, 0, 0))).toHaveLength(0);
  });
  it("setCellImageFit sets the image fit", () => {
    const start = gridBookCell([{ id: "i1", role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.jpg" }]);
    expect(cellObjs(setCellImageFit(start, 0, 0, 0, 0, "fit-width"))[0].fit).toBe("fit-width");
  });
  it("addCellCallout appends a secondary callout object", () => {
    const out = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(cellObjs(out)[0]).toMatchObject({ role: "secondary", kind: "callout" });
    expect(cellObjs(out)[0].callout).toBeDefined();
  });
  it("updateCellCallout patches the callout payload", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    const out = updateCellCallout(start, 0, 0, 0, 0, 0, { body: "hello", type: "warning" });
    expect(cellObjs(out)[0].callout).toMatchObject({ body: "hello", type: "warning" });
  });
  it("addCellText appends a secondary text object with empty text", () => {
    const out = addCellText(gridBookCell([]), 0, 0, 0, 0);
    expect(cellObjs(out)[0]).toMatchObject({ role: "secondary", kind: "text", text: "" });
  });
  it("updateCellText sets the text content", () => {
    const start = addCellText(gridBookCell([]), 0, 0, 0, 0);
    const out = updateCellText(start, 0, 0, 0, 0, 0, "## Hello");
    expect(cellObjs(out)[0].text).toBe("## Hello");
  });
  it("updateCellText no-ops on a non-text object (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(updateCellText(start, 0, 0, 0, 0, 0, "x")).toBe(start);
  });
  it("addCellText no-ops on a bad cell index (same reference)", () => {
    const start = gridBookCell([]);
    expect(addCellText(start, 0, 0, 9, 0)).toBe(start);
  });
  it("removeCellObject removes by index", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(cellObjs(removeCellObject(start, 0, 0, 0, 0, 0))).toHaveLength(0);
  });
  it("moveCellObject reorders within the cell", () => {
    let b = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    b = addCellCallout(b, 0, 0, 0, 0);
    b = updateCellCallout(b, 0, 0, 0, 0, 0, { body: "first" });
    b = updateCellCallout(b, 0, 0, 0, 0, 1, { body: "second" });
    const out = moveCellObject(b, 0, 0, 0, 0, 0, 1);
    expect(cellObjs(out).map((o) => o.callout?.body)).toEqual(["second", "first"]);
  });
  it("updateCellCallout no-ops on a bad objIndex (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(updateCellCallout(start, 0, 0, 0, 0, 9, { body: "x" })).toBe(start);
  });
  it("moveCellObject no-ops at the boundary (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(moveCellObject(start, 0, 0, 0, 0, 0, -1)).toBe(start);
  });
  it("does not mutate input and no-ops on a bad cell index", () => {
    const start = gridBookCell([]);
    const snap = structuredClone(start);
    const out = setCellImage(start, 0, 0, 0, 9, "x.jpg");
    expect(start).toEqual(snap);
    expect(out).toBe(start); // bad index → same reference
  });
  it("setCellTextAlign sets the alignment on a text block", () => {
    const start = addCellText(gridBookCell([]), 0, 0, 0, 0);
    const out = setCellTextAlign(start, 0, 0, 0, 0, 0, "center");
    expect(cellObjs(out)[0].align).toBe("center");
  });
  it("setCellTextAlign no-ops on a non-text object (same reference)", () => {
    const start = addCellCallout(gridBookCell([]), 0, 0, 0, 0);
    expect(setCellTextAlign(start, 0, 0, 0, 0, 0, "right")).toBe(start);
  });
  it("setCellImageBorder sets the primary image's border", () => {
    const start = setCellImage(gridBookCell([]), 0, 0, 0, 0, "a.jpg");
    const out = setCellImageBorder(start, 0, 0, 0, 0, { color: "#ff0000", shadow: false });
    const img = cellObjs(out).find((o) => o.kind === "image" && o.role === "primary");
    expect(img?.border).toEqual({ color: "#ff0000", shadow: false });
  });
  it("setCellImageBorder no-ops when the cell has no image (same reference)", () => {
    const start = gridBookCell([]);
    expect(setCellImageBorder(start, 0, 0, 0, 0, false)).toBe(start);
  });
});

const co = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const im = (id: string): StackedObject => ({ id, role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: "a.png" });
const bookWith2 = (objects: StackedObject[]): Book => ({
  title: "", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c1", title: "", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});
const objOf = (b: Book, id: string) =>
  b.chapters[0].steps[0].grid![0].cells[0].objects.find((o) => o.id === id)!;

describe("updateCellObjectPlacement", () => {
  it("float: sets positioned + x/y/w", () => {
    const book = bookWith2([co("a")]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: true, x: 0.2, y: 0.3, w: 0.4 });
    const o = objOf(out, "a");
    expect(o.positioned).toBe(true);
    expect([o.x, o.y, o.w]).toEqual([0.2, 0.3, 0.4]);
  });

  it("move: patches x/y only, leaves positioned", () => {
    const book = bookWith2([{ ...co("a"), positioned: true, x: 0.1, y: 0.1, w: 0.5 }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { x: 0.6, y: 0.7 });
    const o = objOf(out, "a");
    expect([o.x, o.y, o.w, o.positioned]).toEqual([0.6, 0.7, 0.5, true]);
  });

  it("resize: patches w only", () => {
    const book = bookWith2([{ ...co("a"), positioned: true, w: 0.5 }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { w: 0.3 });
    expect(objOf(out, "a").w).toBe(0.3);
  });

  it("dock: clears positioned", () => {
    const book = bookWith2([{ ...co("a"), positioned: true }]);
    const out = updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: false });
    expect(objOf(out, "a").positioned).toBe(false);
  });

  it("kind-guard: non-callout object returns the same book ref", () => {
    const book = bookWith2([im("img")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 0, "img", { positioned: true })).toBe(book);
  });

  it("bad cell index returns the same book ref", () => {
    const book = bookWith2([co("a")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 9, "a", { x: 0.5 })).toBe(book);
  });

  it("unknown objectId returns the same book ref", () => {
    const book = bookWith2([co("a")]);
    expect(updateCellObjectPlacement(book, 0, 0, 0, 0, "nope", { x: 0.5 })).toBe(book);
  });

  it("immutable: input book is unchanged", () => {
    const book = bookWith2([co("a")]);
    updateCellObjectPlacement(book, 0, 0, 0, 0, "a", { positioned: true, x: 0.9 });
    expect(objOf(book, "a").positioned).toBeUndefined();
    expect(objOf(book, "a").x).toBe(0);
  });
});
