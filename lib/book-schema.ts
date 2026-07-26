/**
 * The guidebook data model — the single source of truth for the whole document.
 *
 * Ported from design_handoff_guidebook_editor/README.md ("The data model").
 * The editor mutates a `Book`; the renderer consumes it; `public/book.js`
 * persists it in a hand-editable form (`window.BOOK = { ... }`).
 *
 * Deviations from the prototype (intentional, per the README NOTE on `layout`):
 *  - `layout` is an explicit field, preferred over filename-suffix inference.
 *  - `image2` stores the second slot of a `double` row explicitly, instead of
 *    relying on the `-2`-before-extension filename convention.
 *
 * Image references stay as BARE filenames; the renderer composes the full path
 * as `public/<chapter.id>/<image>` (and the cover as `public/<book.cover>`).
 */

/**
 * Callout types. `warn` is a deprecated alias for `warning` (kept so existing
 * configs render unchanged) — normalize via normalizeCalloutType().
 */
export type CalloutType =
  | "info"
  | "note"
  | "success"
  | "warning"
  | "danger"
  | "warn";

/** The canonical types (excludes the `warn` alias) — used by editor controls. */
export const CALLOUT_TYPE_OPTIONS = [
  "info",
  "note",
  "success",
  "warning",
  "danger",
] as const;

export type RowLayout = "single" | "double" | "single-wide";

/** Per-slot image frame. `boolean` keeps back-compat; the object adds overrides. */
export interface BorderStyle {
  color?: string;
  width?: string;
  radius?: string;
  /** Drop shadow under the framed image. */
  shadow?: boolean;
}
export type Border = boolean | BorderStyle;

export type CalloutLayout = "side" | "below";

export type CalloutCols = 1 | 2 | 3;

export interface Callout {
  /** Default 'info'. */
  type: CalloutType;
  title?: string;
  /** Body text — may contain the markdown subset (bold/italic, lists). */
  body?: string;
  /** Overrides the row's calloutLayout for this one callout (mixed placement). */
  placement?: CalloutLayout;
  /** below-mode only: how many grid columns this callout spans (clamped to calloutCols). */
  span?: CalloutCols;
  /** side-mode only: width as a percentage of the side column (1–100). */
  widthPct?: number;
}

/** CSS lengths, e.g. "360px", "70mm". */
export interface SizeOverride {
  width?: string;
  height?: string;
}

/**
 * A ROW = one horizontal band on a step page: one image (single / single-wide)
 * or two (double).
 */
// --- Annotation canvas (ADR-004) ---

export type Anchor =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "start"
  | "end"
  | "mid";

export type EndpointStyle =
  | "none"
  | "arrow"
  | "circle"
  | "diamond"
  | "point"
  | "bar";

export type EndpointSize = "small" | "medium" | "large";

/** A connector endpoint: a free point (normalized 0–1) or bound to a surface. */
export interface Endpoint {
  x?: number;
  y?: number;
  /** id of a Surface this endpoint snaps to. */
  ref?: string;
  anchor?: Anchor;
  style: EndpointStyle;
  /** Marker size (default "medium"). */
  size?: EndpointSize;
  /** Overrides square-routing direction at this end (Phase 1). The way the
   *  connector runs here — for `to` the arrowhead points this way; for `from` it
   *  leaves this way. Absent = auto (dominant-axis heuristic). Square routing only. */
  dir?: "left" | "right" | "up" | "down";
}

/** Default font size (px at natural page scale) for text annotations + labels. */
export const DEFAULT_TEXT_SIZE = 12;

/** Font families offered for text annotations (CSS font-family stacks). */
export type TextFont =
  | "sans"
  | "serif"
  | "mono"
  | "open-sans"
  | "montserrat"
  | "roboto";

/** The optional text-label role shared by every annotation (Surface + Connector). */
export interface TextLabel {
  /** Label / content text. */
  text?: string;
  /** Font size in px at natural page scale (default DEFAULT_TEXT_SIZE). */
  fontSize?: number;
  fontFamily?: TextFont;
  /** Text color (defaults to `stroke` when unset). */
  color?: string;
  align?: "left" | "center" | "right";
}

/**
 * A snap-target shape that is also drawn: box, line, square bracket, diamond,
 * ellipse, polygon, or a free-floating text label.
 */
export interface Surface extends TextLabel {
  id: string;
  kind: "box" | "line" | "bracket" | "diamond" | "text" | "polygon" | "ellipse";
  /** Normalized 0–1 bounds relative to the image slot. */
  x: number;
  y: number;
  w: number;
  h: number;
  orientation?: "horizontal" | "vertical";
  /** bracket only: invert tick direction (spine swaps side). */
  flip?: boolean;
  stroke: string;
  width: number;
  fill?: string;
  /** Fill alpha 0–1 (default 1). Applied as SVG fill-opacity so a shape beneath
   *  shows through; stroke + label stay fully opaque. */
  fillOpacity?: number;
  /** polygon only: closed-shape vertices, normalized 0–1. */
  vertices?: { x: number; y: number }[];
  /** polygon only: preset that constrains authoring (e.g. a decision diamond). */
  preset?: "diamond";
  /** Rounded corners (px at natural scale); 0 = sharp. */
  cornerRadius?: number;
  /** Palette token id; resolved stroke/fill remain the render source. */
  swatchId?: string;
}

/** A manual adjustment to one segment of a square connector's auto-route (P3).
 *  Stored as a perpendicular offset FROM the recomputed auto-route, so it rides
 *  along when a connected surface moves. Dropped at render time if a reflow
 *  changes the route so this segment no longer exists or no longer matches `axis`. */
export interface ConnectorBend {
  /** Index of the auto-route segment this bend adjusts (0-based). */
  seg: number;
  /** Run orientation: "h" = horizontal (offset shifts it in Y), "v" = vertical (offset shifts it in X). */
  axis: "h" | "v";
  /** Signed perpendicular offset from the auto-route, normalized page units. */
  offset: number;
}

/** An arrow/line drawn between two endpoints (each free or surface-bound). */
export interface Connector extends TextLabel {
  id: string;
  kind: "connector";
  from: Endpoint;
  to: Endpoint;
  stroke: string;
  width: number;
  /** Path style: a straight line or an orthogonal (square) route. */
  routing?: "straight" | "square";
  /** Default true — endpoints snap to object anchors without a modifier. */
  snapToAnchors?: boolean;
  /** Default endpoint style for new connectors (default "arrow"). */
  defaultEndpoint?: EndpointStyle;
  /** Palette token id; resolved stroke/fill remain the render source. */
  swatchId?: string;
  /** Intermediate points the path passes through (normalized 0–1). Editor-only
   *  handles shape these; they print as the resulting bent path. */
  waypoints?: { x: number; y: number }[];
  /** Manual segment adjustments for square routing (P3). Square-only — each rides
   *  the recomputed auto-route. `waypoints` remains the `straight`-connector path. */
  bends?: ConnectorBend[];
}

export type Annotation = Surface | Connector;

export type PageSize = "A4" | "Letter" | "A5" | "Legal" | "Custom";

export interface PageConfig {
  size: PageSize;
  /** Required when size = "Custom" (mm). */
  custom?: { w: number; h: number };
  /** landscape swaps W/H. */
  orientation: "portrait" | "landscape";
  /** mm. */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Fixed author-set header height (mm), default 0. Not content-measured. */
  headerH: number;
  /** Fixed author-set footer height (mm), default 0. Not content-measured. */
  footerH: number;
}

/** How an image object fills its cell. `fit-width`/`fit-height` crop the overflow
 *  axis (bottom / right respectively); `contain` letterboxes (never crops). */
export type ImageFit = "contain" | "fit-width" | "fit-height";

/** One stacked object inside a cell: a primary anchor or a companion. */
export interface StackedObject {
  id: string;
  role: "primary" | "secondary";
  kind: "image" | "callout" | "text";
  /** 0–1 within the cell. In-cell drag clamps to these bounds. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** image filename / callout payload ref. */
  ref?: string;
  /** Callout payload when kind === "callout". */
  callout?: Callout;
  /** Image fit mode (kind === "image"); default "contain". */
  fit?: ImageFit;
  /** Callout only: true = floats at absolute x/y/w within the cell (out of the
   *  flow stack). Absent/false = flowed (x/y/w ignored). Height is content-driven. */
  positioned?: boolean;
  /** Text block content (markdown subset) when kind === "text". */
  text?: string;
  /** Text block alignment when kind === "text"; absent = left. Applies to the
   *  whole block (paragraphs + lists). */
  align?: "left" | "center" | "right";
  /** Per-image frame when kind === "image" (reuses the Border model); absent =
   *  ImageSlot's default frame. */
  border?: Border;
  /** Cell-anchored annotations (0–1 of the cell). */
  annotations?: Annotation[];
}

/** A grid cell: a fractional-width column holding an object stack. */
export interface GridCell {
  /** Fraction of the row width; Σ across a row = 1. */
  widthFr: number;
  objects: StackedObject[];
}

/** A grid row: a fractional-height band of cells. */
export interface GridRow {
  /** Fraction of bodyH; Σ across a step = 1. */
  heightFr: number;
  cells: GridCell[];
}

export interface ImageRow {
  /** Bare filename, e.g. "01-double.jpg" (slot A). */
  image: string;
  /** Second slot for `double` rows (preferred over the `-2` filename convention). */
  image2?: string;
  /**
   * Resolution order: use `layout` if set, else infer from the filename suffix,
   * else default 'single'.
   */
  layout?: RowLayout;
  /** Double only: draw a connecting arrow between the two images. */
  arrow?: boolean;
  /** Default true (6px frame); false = no frame; object = framed with overrides. */
  border?: Border;
  /** Small row sub-heading. */
  title?: string;
  /** Row body copy. */
  instruction?: string;
  callouts?: Callout[];
  /** Default 'side'. */
  calloutLayout?: CalloutLayout;
  /** Grid columns when layout = 'below' (default 2). */
  calloutCols?: CalloutCols;
  /** Override slot width for all slots in the row. */
  imageWidth?: string;
  /** Override slot height (e.g. a long scrolling capture). */
  imageHeight?: string;
  /** Gap between the two images of a `double` row (CSS length, default 8mm). */
  imageGap?: string;
  /** Per-slot override, indexed by slot position. */
  imageSizes?: SizeOverride[];
  /** Canvas annotations drawn over the row's primary image (ADR-004). */
  annotations?: Annotation[];
}

/**
 * A STEP = one page. Two authoring forms are supported (the renderer handles
 * BOTH):
 *  (A) legacy single image: `image` + step-level layout fields, or
 *  (B) multi-row: an `images: ImageRow[]` array (overrides the single-image
 *      fields when present).
 */
export interface Step {
  /** Page heading. */
  title?: string;
  /** Numbered intro under the heading. */
  instruction?: string;

  // form (A) single — same fields as ImageRow, directly on the step:
  image?: string;
  image2?: string;
  layout?: RowLayout;
  arrow?: boolean;
  border?: Border;
  callouts?: Callout[];
  calloutLayout?: CalloutLayout;
  calloutCols?: CalloutCols;
  imageWidth?: string;
  imageHeight?: string;
  imageGap?: string;
  imageSizes?: SizeOverride[];
  annotations?: Annotation[];

  // form (B) multi-row — when present, overrides the single-image fields:
  images?: ImageRow[];

  /** Flexible grid (rows × cells). Rendered only when layoutMode === "grid"
   *  (see stepLayoutMode); presence alone does not switch rendering. */
  grid?: GridRow[];
  /** Free annotation layer (0–1 of the body region), constrained to grid bounds. */
  freeAnnotations?: Annotation[];
  /** Which renderer lays out this step. Unset → "legacy" (the proven ImageRow
   *  path). "grid" renders `grid` via <GridStep>. Gated explicitly so migrated
   *  books (which all carry a grid skeleton) stay pixel-identical. */
  layoutMode?: "legacy" | "grid";
}

export interface Chapter {
  /** Folder slug — images load from public/<id>/. */
  id: string;
  title: string;
  /** Shown on the chapter-intro page and in the TOC. */
  description: string;
  steps: Step[];
}

export type WatermarkPosition =
  | "center"
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

/** New feature (not in the prototype) — see README "Watermark". */
export interface Watermark {
  enabled: boolean;
  /** e.g. "CONFIDENTIAL — DRAFT". */
  text?: string;
  /** Path/filename of a small mark, optional. */
  icon?: string;
  position?: WatermarkPosition;
  /** 0–1, default 0.06. */
  opacity?: number;
  /** Size multiplier for the text/icon mark, default 1. */
  scale?: number;
}

/** Per-section font override. */
export interface SectionFont {
  /**
   * CSS font-family value. For next/font-loaded families use the CSS variable
   * (e.g. "var(--font-roboto)"); for system fonts use a literal stack
   * (e.g. "Arial, sans-serif"). The editor offers presets; hand-editing any
   * valid CSS font-family value is supported.
   */
  family?: string;
  /** CSS length, e.g. "16pt" / "1.2em". */
  size?: string;
  /** CSS color. */
  color?: string;
}

export type ThemeSection = "cover" | "chapter" | "step" | "row" | "callout";

export type Theme = Partial<Record<ThemeSection, SectionFont>>;

/** How a background image is sized against the (fixed-size) printed page.
 *  `auto`/`crop` fill the page and crop overflow; `shrink` fits within the page
 *  without ever enlarging a small image; `fit` letterboxes to show the whole
 *  image; `stretch` fills both axes exactly, distorting if needed. */
export type BackgroundFit = "auto" | "crop" | "shrink" | "fit" | "stretch";

/** Full-page background image rendered behind content (above the page color). */
export interface Background {
  /** Bare filename (resolved against the current project at render time, like
   *  Watermark.icon) so it survives download/re-import. */
  image?: string;
  /** 0–1, default 1. */
  opacity?: number;
  /** Default "auto" (fills the page, crops overflow — the original behavior). */
  fit?: BackgroundFit;
}

/** The closing (back-cover) page content. All optional with sensible defaults. */
export interface Ending {
  /** Small eyebrow label (default "End"). */
  eyebrow?: string;
  /** Heading (default "Thank you for reading."). */
  title?: string;
  /** Body text — may contain the markdown subset. */
  body?: string;
}

export interface Book {
  title: string;
  subtitle: string;
  author: string;
  edition: string;
  /** public/<cover> — optional hero (the TOC carries the cover today). */
  cover: string;
  watermark?: Watermark;
  /** Per-section font overrides (size/color/family). */
  theme?: Theme;
  /** Full-page background image. */
  background?: Background;
  /** Closing-page content (title, ending text). */
  ending?: Ending;
  chapters: Chapter[];
  /** Schema generation; absent/1 = pre-grid. Migrated to CURRENT_SCHEMA_VERSION on load. */
  schemaVersion?: number;
  /** Page size/orientation/margins/header-footer. Defaults to DEFAULT_PAGE_CONFIG. */
  pageConfig?: PageConfig;
  /** Base text color for ALL pages. Overrides the default dark ink across
   *  titles, body, labels, eyebrows, and hairline rules for legibility over a
   *  dark background image. Per-section theme colors still win; callouts keep
   *  their palette. Unset = default dark ink. */
  pageTextColor?: string;
}

// --- Defaults (centralize the README's documented fallbacks) ---

export const CURRENT_SCHEMA_VERSION = 2;

/** New-project page defaults (PRD Decision 13). Author-editable. */
export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  headerH: 15,
  footerH: 10,
};

/** Migration target for pre-grid books — reproduces the current rendered
 *  geometry (18mm margins, no header/footer) so existing books are pixel-identical. */
export const LEGACY_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 18, right: 18, bottom: 18, left: 18 },
  headerH: 0,
  footerH: 0,
};

export const DEFAULT_CALLOUT_TYPE: CalloutType = "info";
export const DEFAULT_ROW_LAYOUT: RowLayout = "single";
export const DEFAULT_CALLOUT_LAYOUT: CalloutLayout = "side";
export const DEFAULT_CALLOUT_COLS: CalloutCols = 2;
export const DEFAULT_BORDER = true;
export const DEFAULT_IMAGE_FIT: ImageFit = "contain";
export const DEFAULT_WATERMARK_OPACITY = 0.06;
export const DEFAULT_WATERMARK_SCALE = 1;
export const DEFAULT_BACKGROUND_FIT: BackgroundFit = "auto";

/**
 * Resolve a row/step layout per the README's resolution order:
 * explicit `layout` → filename suffix → default 'single'.
 */
export function resolveLayout(
  layout: RowLayout | undefined,
  image: string | undefined,
): RowLayout {
  if (layout) return layout;
  if (image) {
    if (/-single-wide(\.|$)/.test(image)) return "single-wide";
    if (/-double(-\d+)?(\.|$)/.test(image)) return "double";
    if (/-single(\.|$)/.test(image)) return "single";
  }
  return DEFAULT_ROW_LAYOUT;
}

/** Effective layout mode for a step. Unset/any non-"grid" → "legacy"
 *  (the zero-regression default). */
export function stepLayoutMode(step: Step): "legacy" | "grid" {
  return step.layoutMode === "grid" ? "grid" : "legacy";
}

/** Map the deprecated `warn` alias to `warning`; pass other types through. */
export function normalizeCalloutType(
  type: CalloutType | undefined,
): "info" | "note" | "success" | "warning" | "danger" {
  if (type === "warn") return "warning";
  return type ?? "info";
}

export interface ResolvedBorder {
  show: boolean;
  color: string;
  width: string;
  radius: string;
  shadow: boolean;
}

/** Resolve a Border value into concrete frame styles (defaults match the prototype). */
export function resolveBorder(border: Border | undefined): ResolvedBorder {
  const defaults = {
    color: "var(--img-border)",
    width: "6px",
    radius: "20px",
    shadow: true,
  };
  // Border off means no frame AND no shadow — otherwise the drop shadow lingers
  // as a grey halo that reads as a border in both Chrome and Preview.
  if (border === false) return { ...defaults, show: false, shadow: false };
  if (border === true || border === undefined) return { show: true, ...defaults };
  return {
    show: true,
    color: border.color ?? defaults.color,
    width: border.width ?? defaults.width,
    radius: border.radius ?? defaults.radius,
    shadow: border.shadow ?? defaults.shadow,
  };
}
