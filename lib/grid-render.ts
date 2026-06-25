/** Pure helpers for the read-only grid renderer (Plan 3). */
import type { GridCell, StackedObject } from "./book-schema";

/** The cell's primary image object, or undefined for an empty / image-less cell. */
export function cellPrimaryImage(cell: GridCell): StackedObject | undefined {
  return cell.objects.find((o) => o.kind === "image" && o.role === "primary");
}
