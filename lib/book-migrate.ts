// lib/book-migrate.ts
/**
 * Schema migration. Runs on load (before the store) to bring any older
 * book.json / window.BOOK up to CURRENT_SCHEMA_VERSION. ADDITIVE + lossless:
 * legacy fields are preserved; new fields are filled. Pure — returns a new
 * object and never mutates the input.
 *
 * Scope: page config default, grid skeleton (rows×cells + primary image),
 * connector routing rename (Plan 1), and legacy-callout migration into cell
 * object stacks — side callouts become [image│callouts] column splits, below
 * callouts become a Rule-1 row beneath the image row (Plan 6).
 */
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_PAGE_CONFIG,
  DEFAULT_CALLOUT_LAYOUT,
  DEFAULT_CALLOUT_COLS,
  resolveLayout,
  type Annotation,
  type Book,
  type Callout,
  type CalloutLayout,
  type GridCell,
  type GridRow,
  type ImageRow,
  type StackedObject,
  type Step,
} from "./book-schema";
import { annotationId } from "./annotations";
import { normalizeFractions } from "./grid-math";

function imageObject(ref: string | undefined): StackedObject {
  return {
    id: annotationId(),
    role: "primary",
    kind: "image",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    ref,
  };
}

function calloutObject(c: Callout): StackedObject {
  return {
    id: annotationId(),
    role: "secondary",
    kind: "callout",
    x: 0, y: 0, w: 1, h: 1,
    callout: { ...c },
  };
}

/** Image cell(s) for a source row's layout (no callouts). */
function imageCells(src: ImageRow | Step): GridCell[] {
  const layout = resolveLayout(src.layout, src.image);
  if (layout === "double") {
    return [
      { widthFr: 0.5, objects: [imageObject(src.image)] },
      { widthFr: 0.5, objects: [imageObject(src.image2)] },
    ];
  }
  return [{ widthFr: 1, objects: [imageObject(src.image)] }];
}

/** The grid rows for ONE legacy source row, as {weight, cells} blocks.
 *  weight = relative height within the source's allocation (image:callout = 2:1). */
function rowBlocks(src: ImageRow | Step): { weight: number; cells: GridCell[] }[] {
  const callouts = src.callouts ?? [];
  if (callouts.length === 0) {
    return [{ weight: 1, cells: imageCells(src) }];
  }
  const layout = resolveLayout(src.layout, src.image);
  const calloutLayout: CalloutLayout = src.calloutLayout ?? DEFAULT_CALLOUT_LAYOUT;
  const cols = src.calloutCols ?? DEFAULT_CALLOUT_COLS;
  const placementOf = (c: Callout) => c.placement ?? calloutLayout;
  const side = callouts.filter((c) => placementOf(c) === "side");
  const below = callouts.filter((c) => placementOf(c) === "below");

  // Image row: image cell(s) + (if any) one side-callouts cell, sized from legacy mm.
  let imageRowCells = imageCells(src);
  if (side.length > 0) {
    imageRowCells = [...imageRowCells, { widthFr: 0, objects: side.map(calloutObject) }];
    const imageMm = layout === "single-wide" ? 110 : layout === "double" ? 55 : 60;
    const weights = layout === "double" ? [imageMm, imageMm, 60] : [imageMm, 170 - imageMm];
    const wf = normalizeFractions(weights);
    imageRowCells = imageRowCells.map((c, i) => ({ ...c, widthFr: wf[i] }));
  }

  const blocks: { weight: number; cells: GridCell[] }[] = [
    { weight: below.length > 0 ? 2 : 1, cells: imageRowCells },
  ];

  // Below callouts → one callout row of `cols` equal cells, round-robin (span dropped).
  if (below.length > 0) {
    const cells: GridCell[] = Array.from({ length: cols }, () => ({
      widthFr: 0,
      objects: [] as StackedObject[],
    }));
    below.forEach((c, k) => cells[k % cols].objects.push(calloutObject(c)));
    const wf = normalizeFractions(cells.map(() => 1));
    blocks.push({ weight: 1, cells: cells.map((c, i) => ({ ...c, widthFr: wf[i] })) });
  }

  return blocks;
}

/** Build the grid for a legacy step. Each source row gets an equal 1/N of the
 *  page height, subdivided 2:1 when it carries below callouts. */
export function legacyStepToGrid(step: Step): GridRow[] {
  const sources: (ImageRow | Step)[] =
    Array.isArray(step.images) && step.images.length > 0 ? step.images : [step];
  const n = sources.length;
  const rows: GridRow[] = [];
  sources.forEach((src) => {
    const blocks = rowBlocks(src);
    const intra = normalizeFractions(blocks.map((b) => b.weight));
    blocks.forEach((b, i) => rows.push({ heightFr: intra[i] / n, cells: b.cells }));
  });
  const heights = normalizeFractions(rows.map((r) => r.heightFr));
  return rows.map((r, i) => ({ ...r, heightFr: heights[i] }));
}

function migrateConnectorRouting(annotations: Annotation[] | undefined): Annotation[] | undefined {
  if (!annotations) return annotations;
  let changed = false;
  const next = annotations.map((a) => {
    if (a.kind === "connector" && (a as { routing?: string }).routing === "elbow") {
      changed = true;
      return { ...a, routing: "square" as const };
    }
    return a;
  });
  return changed ? next : annotations;
}

function migrateStep(step: Step): Step {
  return {
    ...step,
    annotations: migrateConnectorRouting(step.annotations),
    grid: step.grid ?? legacyStepToGrid(step),
  };
}

/**
 * Bring a Book up to the current schema version. Idempotent + lossless.
 * Idempotency holds via the schemaVersion early-return: legacyStepToGrid mints random ids (annotationId), so re-running migration on an un-stamped v1 book is NOT value-stable — the version gate is what guarantees no-op on already-migrated books.
 */
export function migrateBook(book: Book): Book {
  if ((book.schemaVersion ?? 1) >= CURRENT_SCHEMA_VERSION) return book;
  return {
    ...book,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pageConfig: book.pageConfig ?? LEGACY_PAGE_CONFIG,
    chapters: book.chapters.map((ch) => ({
      ...ch,
      steps: ch.steps.map(migrateStep),
    })),
  };
}

/** Force every step of a book into grid layout mode (building a grid skeleton from
 *  any legacy fields where one isn't already present). Additive + idempotent, like
 *  `migrateStep`, but — unlike `migrateBook` — always flips `layoutMode`, so it is
 *  NOT part of the ordinary load-time schema migration. Used only where grid-by-
 *  default content is wanted outright (the /demo seed). */
export function forceGridLayout(book: Book): Book {
  return {
    ...book,
    chapters: book.chapters.map((ch) => ({
      ...ch,
      steps: ch.steps.map((step) => ({
        ...step,
        layoutMode: "grid" as const,
        grid: step.grid ?? legacyStepToGrid(step),
      })),
    })),
  };
}
