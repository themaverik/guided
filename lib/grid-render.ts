/** Pure helpers for the read-only grid renderer (Plan 3). */
import type { GridCell, ImageFit, StackedObject } from "./book-schema";

/** The cell's primary image object, or undefined for an empty / image-less cell. */
export function cellPrimaryImage(cell: GridCell): StackedObject | undefined {
  return cell.objects.find((o) => o.kind === "image" && o.role === "primary");
}

/** CSS modifier class for an image object's fit mode. "" for contain/undefined,
 *  which keeps the default `object-fit: contain` markup unchanged. */
export function imageFitClass(fit?: ImageFit): string {
  return fit === "fit-width" ? "fit-width" : fit === "fit-height" ? "fit-height" : "";
}
