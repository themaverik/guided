// lib/book-migrate.test.ts
import { describe, it, expect } from "vitest";
import { migrateBook, legacyStepToGrid } from "@/lib/book-migrate";
import { CURRENT_SCHEMA_VERSION, LEGACY_PAGE_CONFIG, type Book } from "@/lib/book-schema";

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
