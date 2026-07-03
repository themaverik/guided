/*
 * Annotation color + width palette (DESIGN.md §2.2). Single source of truth for
 * the on-canvas AnnotationPalette and its tests. Paired OKLCH tokens: `fill`
 * paints the swatch chip; only `stroke` is applied to shapes in this slice
 * (fill tint / export-opacity split are a later color-system slice).
 */
export interface Swatch {
  id: string;
  label: string;
  fill: string;
  stroke: string;
}

export const SWATCHES: readonly Swatch[] = [
  { id: "ink", label: "Ink", fill: "#e6f1f2", stroke: "#024450" },
  { id: "red", label: "Red", fill: "#ffe8e4", stroke: "#cb4a47" },
  { id: "orange", label: "Orange", fill: "#ffecd8", stroke: "#b56410" },
  { id: "amber", label: "Amber", fill: "#fef3d2", stroke: "#957800" },
  { id: "green", label: "Green", fill: "#e0f7e4", stroke: "#369150" },
  { id: "teal", label: "Teal", fill: "#daf7f6", stroke: "#188d8d" },
  { id: "blue", label: "Blue", fill: "#e2f2ff", stroke: "#217fd0" },
  { id: "violet", label: "Violet", fill: "#f1edff", stroke: "#8464cf" },
];

export interface WidthPreset {
  label: string;
  value: number;
}

export const WIDTH_PRESETS: readonly WidthPreset[] = [
  { label: "Thin", value: 1 },
  { label: "Medium", value: 2 },
  { label: "Thick", value: 4 },
  { label: "Heavy", value: 6 },
];

export const DEFAULT_SWATCH_ID = "ink";

/** Default stroke width for new draws — the Medium preset. */
export const DEFAULT_WIDTH = 2;

/** Stroke hex of the default swatch — the initial on-canvas draw color. */
export const DEFAULT_STROKE = SWATCHES.find(
  (s) => s.id === DEFAULT_SWATCH_ID,
)!.stroke;

/** Resolve a stroke hex to its swatch id (case-insensitive), or undefined. */
export function swatchByStroke(hex: string): string | undefined {
  const h = hex.toLowerCase();
  return SWATCHES.find((s) => s.stroke.toLowerCase() === h)?.id;
}

/** The immutable patch a swatch applies to a shape: stroke + swatchId, plus
 *  `color` for text (whose visible color is `color`, not `stroke`). */
export function swatchPatch(
  sw: Swatch,
  kind: string,
): { stroke: string; swatchId: string; color?: string } {
  const patch: { stroke: string; swatchId: string; color?: string } = {
    stroke: sw.stroke,
    swatchId: sw.id,
  };
  if (kind === "text") patch.color = sw.stroke;
  return patch;
}
