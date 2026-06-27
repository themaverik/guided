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

/** A callout that floats at an absolute x/y/w within its cell (out of flow). */
export function isFloatingCallout(obj: StackedObject): boolean {
  return obj.kind === "callout" && obj.positioned === true;
}

/** Objects that render in the cell's flow stack — everything except floating callouts. */
export function flowObjects(cell: GridCell): StackedObject[] {
  return cell.objects.filter((o) => !isFloatingCallout(o));
}

/** Callouts that float at absolute x/y/w (positioned === true && kind === "callout"). */
export function floatingCallouts(cell: GridCell): StackedObject[] {
  return cell.objects.filter(isFloatingCallout);
}
