// lib/book-migrate.test.ts
import { describe, it, expect } from "vitest";
import { migrateBook, legacyStepToGrid } from "@/lib/book-migrate";
import { CURRENT_SCHEMA_VERSION, LEGACY_PAGE_CONFIG, DEFAULT_CALLOUT_COLS, type Book } from "@/lib/book-schema";

const baseBook = (steps: Book["chapters"][0]["steps"]): Book => ({
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "ch1", title: "C", description: "", steps }],
});

describe("legacyStepToGrid", () => {
  it("single-image step → 1 row, 1 cell, image as primary", () => {
    const grid = legacyStepToGrid({ image: "a.jpg" });
    expect(grid).toHaveLength(1);
    expect(grid[0].heightFr).toBe(1);
    expect(grid[0].cells).toHaveLength(1);
    expect(grid[0].cells[0].widthFr).toBe(1);
    expect(grid[0].cells[0].objects[0]).toMatchObject({
      role: "primary", kind: "image", ref: "a.jpg",
    });
  });
  it("double row → 1 row, 2 cells each widthFr 0.5", () => {
    const grid = legacyStepToGrid({ images: [{ image: "l.jpg", image2: "r.jpg", layout: "double" }] });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells.map((c) => c.widthFr)).toEqual([0.5, 0.5]);
    expect(grid[0].cells[1].objects[0].ref).toBe("r.jpg");
  });
  it("N image rows → N rows, equal heightFr", () => {
    const grid = legacyStepToGrid({ images: [{ image: "a" }, { image: "b" }, { image: "c" }] });
    expect(grid).toHaveLength(3);
    grid.forEach((r) => expect(r.heightFr).toBeCloseTo(1 / 3, 6));
  });
});

describe("migrateBook", () => {
  it("adds the legacy page config, grid, and stamps the version", () => {
    const out = migrateBook(baseBook([{ image: "a.jpg" }]));
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.pageConfig).toEqual(LEGACY_PAGE_CONFIG);
    expect(out.chapters[0].steps[0].grid).toBeDefined();
  });
  it("is idempotent for an already-migrated book", () => {
    const once = migrateBook(baseBook([{ image: "a.jpg" }]));
    expect(migrateBook(once)).toEqual(once);
  });
  it("preserves legacy fields (lossless)", () => {
    const out = migrateBook(baseBook([{ image: "a.jpg", title: "keep me" }]));
    expect(out.chapters[0].steps[0].image).toBe("a.jpg");
    expect(out.chapters[0].steps[0].title).toBe("keep me");
  });
  it("maps connector routing elbow → square", () => {
    const book = baseBook([{
      image: "a.jpg",
      annotations: [{ id: "c1", kind: "connector", from: { x: 0, y: 0, style: "none" }, to: { x: 1, y: 1, style: "arrow" }, stroke: "#000", width: 2, routing: "elbow" } as never],
    }]);
    const out = migrateBook(book);
    const conn = out.chapters[0].steps[0].annotations![0] as { routing: string };
    expect(conn.routing).toBe("square");
  });
});

describe("legacyStepToGrid — callouts", () => {
  const info = (body: string) => ({ type: "info" as const, body });

  it("side callouts → [image | callouts] cells, image narrow", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [info("one"), info("two")], calloutLayout: "side",
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "a.jpg" });
    expect(grid[0].cells[0].widthFr).toBeCloseTo(60 / 170, 6);
    expect(grid[0].cells[1].widthFr).toBeCloseTo(110 / 170, 6);
    expect(grid[0].cells[1].objects).toHaveLength(2);
    expect(grid[0].cells[1].objects[0]).toMatchObject({
      role: "secondary", kind: "callout",
    });
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "one" });
  });

  it("below callouts → image row + Rule-1 callout row, round-robin", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [info("c0"), info("c1"), info("c2")],
      calloutLayout: "below", calloutCols: 2,
    });
    expect(grid).toHaveLength(2);
    // image row
    expect(grid[0].cells).toHaveLength(1);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "a.jpg" });
    // callout row: 2 cells, round-robin c0->cell0, c1->cell1, c2->cell0
    expect(grid[1].cells).toHaveLength(2);
    expect(grid[1].cells[0].objects.map((o) => o.callout?.body)).toEqual(["c0", "c2"]);
    expect(grid[1].cells[1].objects.map((o) => o.callout?.body)).toEqual(["c1"]);
    // height 2:1
    expect(grid[0].heightFr).toBeCloseTo(2 / 3, 6);
    expect(grid[1].heightFr).toBeCloseTo(1 / 3, 6);
  });

  it("mixed side+below → image+side row, then below row", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg", layout: "single",
      callouts: [
        { type: "info", body: "s", placement: "side" },
        { type: "note", body: "b", placement: "below" },
      ],
      calloutCols: 2,
    });
    expect(grid).toHaveLength(2);
    expect(grid[0].cells).toHaveLength(2); // image + side-callouts
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "s" });
    expect(grid[1].cells[0].objects[0].callout).toMatchObject({ body: "b" });
  });

  it("single-wide side callouts → [wide image | callouts], image wide", () => {
    const grid = legacyStepToGrid({
      image: "w.jpg", layout: "single-wide",
      callouts: [info("one")], calloutLayout: "side",
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(2);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "w.jpg" });
    expect(grid[0].cells[0].widthFr).toBeCloseTo(110 / 170, 6);
    expect(grid[0].cells[1].widthFr).toBeCloseTo(60 / 170, 6);
    expect(grid[0].cells[1].objects[0].callout).toMatchObject({ body: "one" });
  });

  it("double side callouts → [imgL | imgR | callouts] cells 55:55:60", () => {
    const grid = legacyStepToGrid({
      images: [{
        image: "l.jpg", image2: "r.jpg", layout: "double",
        callouts: [info("one")], calloutLayout: "side",
      }],
    });
    expect(grid).toHaveLength(1);
    expect(grid[0].cells).toHaveLength(3);
    expect(grid[0].cells[0].objects[0]).toMatchObject({ kind: "image", ref: "l.jpg" });
    expect(grid[0].cells[1].objects[0]).toMatchObject({ kind: "image", ref: "r.jpg" });
    expect(grid[0].cells[2].objects[0].callout).toMatchObject({ body: "one" });
    expect(grid[0].cells[0].widthFr).toBeCloseTo(55 / 170, 6);
    expect(grid[0].cells[1].widthFr).toBeCloseTo(55 / 170, 6);
    expect(grid[0].cells[2].widthFr).toBeCloseTo(60 / 170, 6);
  });

  it("heightFr and widthFr each sum to 1", () => {
    const grid = legacyStepToGrid({
      image: "a.jpg",
      callouts: [{ type: "info", body: "x", placement: "below" }],
      calloutCols: DEFAULT_CALLOUT_COLS,
    });
    const hSum = grid.reduce((a, r) => a + r.heightFr, 0);
    expect(hSum).toBeCloseTo(1, 6);
    grid.forEach((r) =>
      expect(r.cells.reduce((a, c) => a + c.widthFr, 0)).toBeCloseTo(1, 6),
    );
  });
});
