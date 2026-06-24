// lib/book-migrate.ts
/**
 * Schema migration. Runs on load (before the store) to bring any older
 * book.json / window.BOOK up to CURRENT_SCHEMA_VERSION. ADDITIVE + lossless:
 * legacy fields are preserved; new fields are filled. Pure — returns a new
 * object and never mutates the input.
 *
 * Scope (Plan 1 / Phase A foundations): page config default, grid SKELETON
 * (rows×cells + primary image), connector routing rename. Moving callouts into
 * the object stack and the diamond→polygon data conversion are later phases.
 */
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_PAGE_CONFIG,
  resolveLayout,
  type Annotation,
  type Book,
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

/** Build the grid skeleton for a legacy step (single-image or images[]). */
export function legacyStepToGrid(step: Step): GridRow[] {
  const rows: (ImageRow | Step)[] =
    Array.isArray(step.images) && step.images.length > 0 ? step.images : [step];
  const heights = normalizeFractions(rows.map(() => 1));
  return rows.map((src, i) => {
    const layout = resolveLayout(src.layout, src.image);
    // P1 skeleton flattens non-double layouts (including single-wide) to a single full-width cell;
    // images[] without an image field yields a primary object with ref: undefined (Phase B object work, Plan 3).
    if (layout === "double") {
      return {
        heightFr: heights[i],
        cells: [
          { widthFr: 0.5, objects: [imageObject(src.image)] },
          { widthFr: 0.5, objects: [imageObject(src.image2)] },
        ],
      };
    }
    return {
      heightFr: heights[i],
      cells: [{ widthFr: 1, objects: [imageObject(src.image)] }],
    };
  });
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
