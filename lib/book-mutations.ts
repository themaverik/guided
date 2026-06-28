/*
 * Pure, immutable mutations on the Book model. Every function returns a new
 * Book (deep-cloned) — the store swaps the result in, the preview re-renders,
 * auto-fit re-runs. Kept separate from the store so the logic is testable.
 *
 * Row normalization: a Step has two authoring forms — legacy single-image
 * (row fields live directly on the step) and multi-row (`images: ImageRow[]`).
 * The editor edits a "rows" view; `ensureMulti` migrates a legacy step into the
 * multi-row form the first time a second row is needed, moving the row-level
 * fields into `images[0]` while leaving the page-level `title`/`instruction`.
 */
import {
  type Annotation,
  type Book,
  type Border,
  type Callout,
  type CalloutType,
  type Chapter,
  type Connector,
  type GridCell,
  type ImageFit,
  type ImageRow,
  type RowLayout,
  type StackedObject,
  type Step,
  type Surface,
  DEFAULT_PAGE_CONFIG,
  stepLayoutMode,
} from "./book-schema";
import { annotationId } from "./annotations";
import { resizeAdjacent, bodyRegion, MIN_CELL_MM, normalizeFractions } from "./grid-math";
import { legacyStepToGrid } from "./book-migrate";

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Set a step's layout mode. Switching INTO "grid" from a non-grid step rebuilds
 * `step.grid` from the step's legacy fields (via `legacyStepToGrid`), so callouts
 * carry over correctly. A step already in grid mode is NOT rebuilt — this preserves
 * any author edits to the grid structure.
 */
export function setStepLayoutMode(
  book: Book,
  ci: number,
  si: number,
  mode: "legacy" | "grid",
): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step) return book;
  const wasGrid = stepLayoutMode(step) === "grid";
  step.layoutMode = mode;
  // Switching INTO grid from a legacy step: (re)build the grid from the legacy
  // fields so callouts carry over. A step already in grid mode keeps its edits.
  if (mode === "grid" && !wasGrid) {
    step.grid = legacyStepToGrid(step);
  }
  return next;
}

/*
 * Fields that belong to a ROW (not the page), used to split a legacy step into
 * the multi-row form. NOTE: `title`/`instruction` are intentionally excluded —
 * on a legacy single-image step those are PAGE-level (the heading + numbered
 * intro), so they must stay on the step, not migrate into images[0].
 */
const ROW_FIELDS: (keyof ImageRow)[] = [
  "image",
  "image2",
  "layout",
  "arrow",
  "border",
  "callouts",
  "calloutLayout",
  "calloutCols",
  "imageWidth",
  "imageHeight",
  "imageGap",
  "imageSizes",
  "annotations",
];

export function blankRow(): ImageRow {
  return { image: "", layout: "single", border: true };
}

export function blankCallout(): Callout {
  return { type: "info", title: "", body: "" };
}

export function blankStep(): Step {
  return { title: "New step", instruction: "", image: "", layout: "single" };
}

export function blankChapter(index: number): Chapter {
  return {
    id: `chapter${index + 1}`,
    title: "New chapter",
    description: "",
    steps: [blankStep()],
  };
}

/** Extract the row-level fields from a legacy single-image step into an ImageRow. */
function extractRow(step: Step): ImageRow {
  const row: Record<string, unknown> = {};
  for (const f of ROW_FIELDS) {
    if (step[f as keyof Step] !== undefined) row[f] = step[f as keyof Step];
  }
  if (row.image === undefined) row.image = "";
  if (row.layout === undefined) row.layout = "single";
  if (row.border === undefined) row.border = true;
  return row as unknown as ImageRow;
}

/** Ensure a step is in multi-row form. Mutates the (already-cloned) step. */
function ensureMulti(step: Step): void {
  if (Array.isArray(step.images) && step.images.length > 0) return;
  step.images = [extractRow(step)];
  for (const f of ROW_FIELDS) delete step[f as keyof Step];
}

/** The object a row's fields should be written to (step itself for legacy ri 0). */
function rowTarget(step: Step, ri: number): ImageRow | Step | null {
  if (Array.isArray(step.images) && step.images.length > 0) {
    return step.images[ri] ?? null;
  }
  return ri === 0 ? step : null;
}

/** Read the rows of a step as a list (without mutating). */
export function rowsOf(step: Step): ImageRow[] {
  if (Array.isArray(step.images) && step.images.length > 0) return step.images;
  return [extractRow(step)];
}

const swap = <T>(arr: T[], a: number, b: number): void => {
  [arr[a], arr[b]] = [arr[b], arr[a]];
};

// ── Chapters ───────────────────────────────────────────────
export function addChapter(book: Book): Book {
  const next = clone(book);
  next.chapters.push(blankChapter(next.chapters.length));
  return next;
}

export function removeChapter(book: Book, ci: number): Book {
  const next = clone(book);
  next.chapters.splice(ci, 1);
  return next;
}

export function moveChapter(book: Book, ci: number, dir: -1 | 1): Book {
  const next = clone(book);
  const j = ci + dir;
  if (j < 0 || j >= next.chapters.length) return book;
  swap(next.chapters, ci, j);
  return next;
}

export function updateChapter(
  book: Book,
  ci: number,
  patch: Partial<Pick<Chapter, "id" | "title" | "description">>,
): Book {
  const next = clone(book);
  Object.assign(next.chapters[ci], patch);
  return next;
}

// ── Steps ──────────────────────────────────────────────────
export function addStep(book: Book, ci: number): Book {
  const next = clone(book);
  next.chapters[ci].steps.push(blankStep());
  return next;
}

export function removeStep(book: Book, ci: number, si: number): Book {
  const next = clone(book);
  next.chapters[ci].steps.splice(si, 1);
  return next;
}

export function moveStep(
  book: Book,
  ci: number,
  si: number,
  dir: -1 | 1,
): Book {
  const next = clone(book);
  const steps = next.chapters[ci].steps;
  const j = si + dir;
  if (j < 0 || j >= steps.length) return book;
  swap(steps, si, j);
  return next;
}

export function updateStep(
  book: Book,
  ci: number,
  si: number,
  patch: Partial<Pick<Step, "title" | "instruction" | "layoutMode">>,
): Book {
  const next = clone(book);
  Object.assign(next.chapters[ci].steps[si], patch);
  return next;
}

// ── Rows ───────────────────────────────────────────────────
export function updateRow(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  patch: Partial<ImageRow>,
): Book {
  const next = clone(book);
  const target = rowTarget(next.chapters[ci].steps[si], ri);
  if (!target) return book;
  Object.assign(target, patch);
  return next;
}

export function addRow(book: Book, ci: number, si: number): Book {
  const next = clone(book);
  const step = next.chapters[ci].steps[si];
  ensureMulti(step);
  step.images!.push(blankRow());
  return next;
}

export function removeRow(book: Book, ci: number, si: number, ri: number): Book {
  const next = clone(book);
  const step = next.chapters[ci].steps[si];
  if (Array.isArray(step.images) && step.images.length > 1) {
    step.images.splice(ri, 1);
  }
  // A single legacy/multi row is the minimum; removing the last is a no-op.
  return next;
}

export function moveRow(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  dir: -1 | 1,
): Book {
  const next = clone(book);
  const step = next.chapters[ci].steps[si];
  ensureMulti(step);
  const rows = step.images!;
  const j = ri + dir;
  if (j < 0 || j >= rows.length) return book;
  swap(rows, ri, j);
  return next;
}

// ── Callouts (within a row) ────────────────────────────────
export function setCalloutCount(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  n: number,
): Book {
  const next = clone(book);
  const target = rowTarget(next.chapters[ci].steps[si], ri);
  if (!target) return book;
  const cur = target.callouts ?? [];
  const count = Math.max(0, Math.min(12, n));
  if (count === 0) {
    delete target.callouts;
    return next;
  }
  const out = cur.slice(0, count);
  while (out.length < count) out.push(blankCallout());
  target.callouts = out;
  if (!target.calloutLayout) target.calloutLayout = "side";
  return next;
}

export function updateCallout(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  k: number,
  patch: Partial<Callout>,
): Book {
  const next = clone(book);
  const target = rowTarget(next.chapters[ci].steps[si], ri);
  if (!target?.callouts?.[k]) return book;
  Object.assign(target.callouts[k], patch);
  return next;
}

export function removeCallout(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  k: number,
): Book {
  const next = clone(book);
  const target = rowTarget(next.chapters[ci].steps[si], ri);
  if (!target?.callouts) return book;
  target.callouts.splice(k, 1);
  if (target.callouts.length === 0) delete target.callouts;
  return next;
}

export function moveCallout(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  k: number,
  dir: -1 | 1,
): Book {
  const next = clone(book);
  const target = rowTarget(next.chapters[ci].steps[si], ri);
  const list = target?.callouts;
  if (!list) return book;
  const j = k + dir;
  if (j < 0 || j >= list.length) return book;
  swap(list, k, j);
  return next;
}

// --- Annotations (ADR-004) ---

const ANNO_STROKE = "#658995";

export function newSurface(kind: Surface["kind"]): Surface {
  const base = { id: annotationId(), stroke: ANNO_STROKE, width: 2 };
  if (kind === "box") return { ...base, kind, x: 0.3, y: 0.3, w: 0.4, h: 0.3 };
  if (kind === "diamond") return { ...base, kind, x: 0.35, y: 0.3, w: 0.3, h: 0.3 };
  if (kind === "text")
    return {
      ...base,
      kind,
      x: 0.35,
      y: 0.4,
      w: 0.3,
      h: 0.1,
      width: 0,
      text: "Text",
      fontSize: 16,
      fontFamily: "sans",
      color: "#555555",
      align: "left",
    };
  if (kind === "line") return { ...base, kind, x: 0.2, y: 0.5, w: 0.6, h: 0 };
  // bracket: vertical + inverted, centered on the page by default.
  return {
    ...base,
    kind,
    x: 0.5,
    y: 0.3,
    w: 0.05,
    h: 0.4,
    orientation: "vertical",
    flip: true,
  };
}

export function newConnector(): Connector {
  return {
    id: annotationId(),
    kind: "connector",
    from: { x: 0.3, y: 0.3, style: "none", size: "medium" },
    to: { x: 0.6, y: 0.6, style: "arrow", size: "medium" },
    stroke: ANNO_STROKE,
    width: 2,
    routing: "straight",
  };
}

// Annotations are page-level: stored on the step, drawn over the whole page,
// so connectors can span images and callouts.
export function addAnnotation(
  book: Book,
  ci: number,
  si: number,
  ann: Annotation,
): Book {
  const next = clone(book);
  const step = next.chapters[ci].steps[si];
  step.annotations = [...(step.annotations ?? []), ann];
  return next;
}

export function updateAnnotation(
  book: Book,
  ci: number,
  si: number,
  id: string,
  patch: Partial<Surface> & Partial<Connector>,
): Book {
  const next = clone(book);
  const list = next.chapters[ci].steps[si].annotations;
  if (!list) return book;
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return book;
  list[idx] = { ...list[idx], ...patch } as Annotation;
  return next;
}

export function removeAnnotation(
  book: Book,
  ci: number,
  si: number,
  id: string,
): Book {
  const next = clone(book);
  const step = next.chapters[ci].steps[si];
  if (!step.annotations) return book;
  step.annotations = step.annotations.filter((a) => a.id !== id);
  if (step.annotations.length === 0) delete step.annotations;
  return next;
}

// ── Grid resize ────────────────────────────────────────────

/** Resize the divider between rows `dividerIndex` and `dividerIndex+1` of a
 *  step's grid by `deltaFr`. Conserved-total, floored at MIN_CELL_MM. */
export function resizeGridRow(
  book: Book,
  ci: number,
  si: number,
  dividerIndex: number,
  deltaFr: number,
): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid) return book;
  const minFr = MIN_CELL_MM / bodyRegion(next.pageConfig ?? DEFAULT_PAGE_CONFIG).h;
  const sizes = step.grid.map((r) => r.heightFr);
  const out = resizeAdjacent(sizes, dividerIndex, deltaFr, minFr);
  step.grid = step.grid.map((r, i) => ({ ...r, heightFr: out[i] }));
  return next;
}

/** Resize the divider between cells `dividerIndex` and `dividerIndex+1` within
 *  row `ri` of a step's grid by `deltaFr`. Conserved-total, floored. */
export function resizeGridColumn(
  book: Book,
  ci: number,
  si: number,
  ri: number,
  dividerIndex: number,
  deltaFr: number,
): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row) return book;
  const minFr = MIN_CELL_MM / bodyRegion(next.pageConfig ?? DEFAULT_PAGE_CONFIG).w;
  const sizes = row.cells.map((c) => c.widthFr);
  const out = resizeAdjacent(sizes, dividerIndex, deltaFr, minFr);
  row.cells = row.cells.map((c, i) => ({ ...c, widthFr: out[i] }));
  return next;
}

// ── Grid structure ─────────────────────────────────────────

/** Append a row (one empty cell) and renormalize row heights to Σ = 1. */
export function addGridRow(book: Book, ci: number, si: number): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid) return book;
  const oldN = step.grid.length;
  const heights = normalizeFractions([...step.grid.map((r) => r.heightFr), 1 / oldN]);
  step.grid = [...step.grid, { heightFr: 0, cells: [{ widthFr: 1, objects: [] }] }]
    .map((r, i) => ({ ...r, heightFr: heights[i] }));
  return next;
}

/** Remove row `ri` and renormalize; keeps at least one row. */
export function removeGridRow(book: Book, ci: number, si: number, ri: number): Book {
  const next = clone(book);
  const step = next.chapters[ci]?.steps[si];
  if (!step?.grid || step.grid.length <= 1) return book;
  const kept = step.grid.filter((_, i) => i !== ri);
  const heights = normalizeFractions(kept.map((r) => r.heightFr));
  step.grid = kept.map((r, i) => ({ ...r, heightFr: heights[i] }));
  return next;
}

/** Append a cell to row `ri` and renormalize cell widths to Σ = 1. */
export function addGridColumn(book: Book, ci: number, si: number, ri: number): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row) return book;
  const oldN = row.cells.length;
  const widths = normalizeFractions([...row.cells.map((c) => c.widthFr), 1 / oldN]);
  row.cells = [...row.cells, { widthFr: 0, objects: [] }].map((c, i) => ({ ...c, widthFr: widths[i] }));
  return next;
}

/** Remove cell `cellIndex` from row `ri` and renormalize; keeps at least one cell. */
export function removeGridColumn(
  book: Book, ci: number, si: number, ri: number, cellIndex: number,
): Book {
  const next = clone(book);
  const row = next.chapters[ci]?.steps[si]?.grid?.[ri];
  if (!row || row.cells.length <= 1) return book;
  const kept = row.cells.filter((_, i) => i !== cellIndex);
  const widths = normalizeFractions(kept.map((c) => c.widthFr));
  row.cells = kept.map((c, i) => ({ ...c, widthFr: widths[i] }));
  return next;
}

// ── Cell objects (Plan 7) ──────────────────────────────────

const cellOf = (book: Book, ci: number, si: number, ri: number, cellIndex: number): GridCell | undefined =>
  book.chapters[ci]?.steps[si]?.grid?.[ri]?.cells?.[cellIndex];

/** Set (or create) the cell's primary image; a new image goes first in the stack. */
export function setCellImage(book: Book, ci: number, si: number, ri: number, cellIndex: number, filename: string): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx >= 0) cell.objects[idx] = { ...cell.objects[idx], ref: filename };
  else cell.objects.unshift({ id: annotationId(), role: "primary", kind: "image", x: 0, y: 0, w: 1, h: 1, ref: filename });
  return next;
}

export function removeCellImage(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects = cell.objects.filter((o) => !(o.kind === "image" && o.role === "primary"));
  return next;
}

export function setCellImageFit(book: Book, ci: number, si: number, ri: number, cellIndex: number, fit: ImageFit): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx < 0) return book;
  cell.objects[idx] = { ...cell.objects[idx], fit };
  return next;
}

export function addCellCallout(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects.push({ id: annotationId(), role: "secondary", kind: "callout", x: 0, y: 0, w: 1, h: 1, callout: blankCallout() });
  return next;
}

export function updateCellCallout(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, patch: Partial<Callout>): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "callout") return book;
  obj.callout = { ...(obj.callout ?? blankCallout()), ...patch };
  return next;
}

export function removeCellObject(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell || objIndex < 0 || objIndex >= cell.objects.length) return book;
  cell.objects.splice(objIndex, 1);
  return next;
}

export function moveCellObject(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, dir: -1 | 1): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  if (objIndex < 0 || objIndex >= cell.objects.length) return book;
  const j = objIndex + dir;
  if (j < 0 || j >= cell.objects.length) return book;
  swap(cell.objects, objIndex, j);
  return next;
}

/** Patch a cell callout's placement (float / move / resize / dock). Immutable;
 *  kind-guarded to callouts; bad index or non-callout returns the same book ref. */
export function updateCellObjectPlacement(
  book: Book, ci: number, si: number, ri: number, cellIndex: number,
  objectId: string,
  patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>,
): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects.find((o) => o.id === objectId);
  if (!obj || obj.kind !== "callout") return book;
  Object.assign(obj, patch);
  return next;
}

/** Append an empty text block to a cell's object stack (flow-stacked). */
export function addCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  cell.objects.push({ id: annotationId(), role: "secondary", kind: "text", x: 0, y: 0, w: 1, h: 1, text: "" });
  return next;
}

/** Set a text block's content. Kind-guarded; bad index or non-text returns the same book ref. */
export function updateCellText(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, text: string): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "text") return book;
  obj.text = text;
  return next;
}

/** Set a text block's alignment. Kind-guarded to "text"; bad index / non-text → same book ref. */
export function setCellTextAlign(book: Book, ci: number, si: number, ri: number, cellIndex: number, objIndex: number, align: "left" | "center" | "right"): Book {
  const next = clone(book);
  const obj = cellOf(next, ci, si, ri, cellIndex)?.objects[objIndex];
  if (!obj || obj.kind !== "text") return book;
  obj.align = align;
  return next;
}

/** Set the cell's primary image border. No image in the cell → same book ref. */
export function setCellImageBorder(book: Book, ci: number, si: number, ri: number, cellIndex: number, border: Border): Book {
  const next = clone(book);
  const cell = cellOf(next, ci, si, ri, cellIndex);
  if (!cell) return book;
  const idx = cell.objects.findIndex((o) => o.kind === "image" && o.role === "primary");
  if (idx < 0) return book;
  cell.objects[idx] = { ...cell.objects[idx], border };
  return next;
}

export const CALLOUT_TYPES: CalloutType[] = [
  "info",
  "note",
  "success",
  "warning",
  "danger",
];
export const ROW_LAYOUTS: RowLayout[] = ["single", "double", "single-wide"];
