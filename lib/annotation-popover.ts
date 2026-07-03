/*
 * Pure geometry for the annotation selection popover (SP2): where to anchor the
 * popover relative to a selected shape, and the shape's normalized bounding box.
 * Editor-only; no rendering here.
 */
import type { Annotation } from "@/lib/book-schema";
import { resolveEndpoint } from "@/lib/annotations";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Viewport {
  w: number;
  h: number;
}
export interface Placement {
  top: number;
  left: number;
  side: "above" | "below";
}

/** Anchor a popover to `box` (container-relative px): above-centered by default,
 *  flipping below when it would clip the top, with `left` clamped inside the
 *  viewport by `gap`. */
export function popoverPlacement(
  box: Box,
  size: Size,
  viewport: Viewport,
  gap = 8,
): Placement {
  const aboveTop = box.y - size.h - gap;
  const side: "above" | "below" = aboveTop >= 0 ? "above" : "below";
  const top = side === "above" ? aboveTop : box.y + box.h + gap;
  const centered = box.x + box.w / 2 - size.w / 2;
  const maxLeft = viewport.w - size.w - gap;
  const left = Math.max(gap, Math.min(centered, maxLeft));
  return { top, left, side };
}

/** Normalized 0–1 bounding box of a shape. Surfaces use their own rect
 *  (normalized for lines' signed extent); connectors span their resolved
 *  endpoints + waypoints. */
export function shapeBounds(shape: Annotation, all: Annotation[]): Box {
  if (shape.kind !== "connector") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
  }
  const pts = [
    resolveEndpoint(all, shape.from),
    resolveEndpoint(all, shape.to),
    ...(shape.waypoints ?? []),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
