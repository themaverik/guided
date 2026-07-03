/*
 * Pure builder for an on-canvas-drawn annotation (SP1 + swatch/width slice).
 * Tool + drag bounds + the current draw style (color, width, swatchId) → a
 * fully-formed shape, or null for Select. Extracted from use-annotation-draw so
 * it is unit-tested under the lib/** vitest include. Editor-only.
 */
import type { Annotation } from "@/lib/book-schema";
import type { AnnotationTool } from "@/lib/store";
import { type Point, boundsFromDrag } from "@/lib/annotations";
import { newConnector, newSurface } from "@/lib/book-mutations";

export interface DrawStyle {
  color: string;
  width: number;
  swatchId: string;
}

export function buildDrawnShape(
  tool: AnnotationTool,
  a: Point,
  b: Point,
  style: DrawStyle,
): Annotation | null {
  if (tool === "select") return null;
  const { color, width, swatchId } = style;
  if (tool === "connector") {
    const nc = newConnector();
    // Reuse the line floor: a real drag is a signed vector; a bare click yields
    // a default-length connector so a click still makes a visible shape.
    const seg = boundsFromDrag(a, b, "line");
    return {
      ...nc,
      from: { ...nc.from, x: a.x, y: a.y },
      to: { ...nc.to, x: seg.x + seg.w, y: seg.y + seg.h },
      stroke: color,
      width,
      swatchId,
    };
  }
  const bd = boundsFromDrag(a, b, tool);
  const s = newSurface(tool);
  // Text's visible color is `color`; every other surface uses `stroke`.
  if (tool === "text")
    return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, color, width, swatchId };
  return {
    ...s,
    x: bd.x,
    y: bd.y,
    w: bd.w,
    h: bd.h,
    stroke: color,
    width,
    swatchId,
  };
}
