import { describe, it, expect } from "vitest";
import { createEditorStore } from "@/lib/store";
import { DEFAULT_PAGE_CONFIG, type Book, type StackedObject } from "@/lib/book-schema";

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

const oneByOne = (): Book => ({
  schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c", title: "C", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }],
  }] }],
});

describe("grid structure actions", () => {

  it("addGridRow then addGridColumn update the store grid", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridRow(0, 0);
    expect(store.getState().book.chapters[0].steps[0].grid).toHaveLength(2);
    store.getState().addGridColumn(0, 0, 0);
    expect(store.getState().book.chapters[0].steps[0].grid![0].cells).toHaveLength(2);
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

describe("cell selection and cell-object actions", () => {
  it("selectCell sets cellIndex and clears the annotation selection", () => {
    const store = createEditorStore(bookWithStep, "slug");
    store.getState().selectCell(0, 0, 1, 2);
    expect(store.getState().selection.cellIndex).toBe(2);
    expect(store.getState().selection.rowIndex).toBe(1);
    expect(store.getState().selectedAnnotation).toBeNull();
  });

  it("selecting a step clears the cell selection", () => {
    const store = createEditorStore(bookWithStep, "slug");
    store.getState().selectCell(0, 0, 1, 2);
    store.getState().selectStep(0, 0);
    expect(store.getState().selection.cellIndex ?? null).toBeNull();
  });

  it("addCellCallout action updates the book", () => {
    const store = createEditorStore(bookWithStep, "slug");
    store.getState().setStepLayoutMode(0, 0, "grid");
    store.getState().addCellCallout(0, 0, 0, 0);
    const cell = store.getState().book.chapters[0].steps[0].grid![0].cells[0];
    expect(cell.objects.some((o) => o.kind === "callout")).toBe(true);
  });
});

describe("grid row/column removal selection reconciliation", () => {
  it("removeGridColumn clears the selection when the selected column is removed", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridColumn(0, 0, 0); // row 0 now has 2 cells
    store.getState().selectCell(0, 0, 0, 1);
    store.getState().removeGridColumn(0, 0, 0, 1);
    expect(store.getState().selection.cellIndex ?? null).toBeNull();
  });

  it("removeGridColumn decrements cellIndex when an earlier column is removed", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridColumn(0, 0, 0); // 2 cells
    store.getState().selectCell(0, 0, 0, 1);
    store.getState().removeGridColumn(0, 0, 0, 0); // remove cell before the selected
    expect(store.getState().selection.cellIndex).toBe(0);
  });

  it("removeGridRow clears the cell selection when the selected row is removed", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridRow(0, 0); // 2 rows
    store.getState().selectCell(0, 0, 1, 0);
    store.getState().removeGridRow(0, 0, 1);
    expect(store.getState().selection.cellIndex ?? null).toBeNull();
  });

  it("removeGridRow decrements rowIndex when an earlier row is removed", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridRow(0, 0); // 2 rows
    store.getState().selectCell(0, 0, 1, 0);
    store.getState().removeGridRow(0, 0, 0); // remove the row before the selected one
    expect(store.getState().selection.rowIndex).toBe(0);
  });

  it("removeGridColumn leaves an unrelated selection untouched", () => {
    const store = createEditorStore(oneByOne(), "slug");
    store.getState().addGridColumn(0, 0, 0);
    store.getState().selectCell(0, 0, 0, 0);
    store.getState().removeGridColumn(0, 0, 0, 1); // remove a later column
    expect(store.getState().selection.cellIndex).toBe(0);
  });
});

const co = (id: string): StackedObject => ({ id, role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: { type: "info" } });
const gridBook = (objects: StackedObject[]): Book => ({
  title: "", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c1", title: "", description: "", steps: [{
    layoutMode: "grid",
    grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects }] }],
  }] }],
});

describe("store: floating cell callouts", () => {
  it("selectCellObject sets cellIndex + objectId and clears selectedAnnotation", () => {
    const store = createEditorStore(gridBook([co("a")]), "demo");
    store.getState().selectAnnotation("x");
    store.getState().selectCellObject(0, 0, 0, 0, "a");
    const sel = store.getState().selection;
    expect(sel.cellIndex).toBe(0);
    expect(sel.objectId).toBe("a");
    expect(store.getState().selectedAnnotation).toBe(null);
  });

  it("updateCellObjectPlacement action floats the callout in the book", () => {
    const store = createEditorStore(gridBook([co("a")]), "demo");
    store.getState().updateCellObjectPlacement(0, 0, 0, 0, "a", { positioned: true, x: 0.25, y: 0.5, w: 0.4 });
    const o = store.getState().book.chapters[0].steps[0].grid![0].cells[0].objects[0];
    expect(o.positioned).toBe(true);
    expect([o.x, o.y, o.w]).toEqual([0.25, 0.5, 0.4]);
  });
});

describe("notices channel", () => {
  it("pushNotice appends immutably with unique ids; dismissNotice removes", () => {
    const store = createEditorStore(book, "slug");
    store.getState().pushNotice("danger", "Upload failed");
    const afterFirst = store.getState().notices;
    store.getState().pushNotice("success", "Image uploaded.");
    expect(store.getState().notices).toHaveLength(2);
    expect(afterFirst).toHaveLength(1); // prior array not mutated
    const [a, b] = store.getState().notices;
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ tone: "danger", message: "Upload failed" });
    store.getState().dismissNotice(a.id);
    expect(store.getState().notices.map((n) => n.id)).toEqual([b.id]);
  });
});
