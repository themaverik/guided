/*
 * Annotation geometry (ADR-004). Pure helpers shared by the static renderer and
 * the (future) interactive editor. All coordinates are normalized 0–1 relative
 * to the image slot.
 */
import type {
  Anchor,
  Annotation,
  Endpoint,
  EndpointSize,
  EndpointStyle,
  Surface,
  TextFont,
} from "./book-schema";

/** CSS font-family stacks for each text-annotation font option. */
export const FONT_STACKS: Record<TextFont, string> = {
  sans: "ui-sans-serif, system-ui, Arial, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  "open-sans": "var(--font-open-sans), system-ui, sans-serif",
  montserrat: "var(--font-montserrat), system-ui, sans-serif",
  roboto: "var(--font-roboto), system-ui, sans-serif",
};

export interface Point {
  x: number;
  y: number;
}

/** Marker pixel size per endpoint size keyword. */
export const MARKER_PX: Record<EndpointSize, number> = {
  small: 8,
  medium: 12,
  large: 18,
};

/** SVG marker reference for an endpoint style + size (none → no marker). */
export function markerRef(
  style: EndpointStyle,
  size: EndpointSize = "medium",
): string | undefined {
  if (style === "none") return undefined;
  return `url(#anno-${style}-${size})`;
}

/**
 * The four line segments of a bracket as [x1,y1,x2,y2] in normalized coords:
 * a spine plus two ticks. `flip` swaps the spine to the opposite side.
 */
export function bracketSegments(s: Surface): [number, number, number, number][] {
  const { x, y, w, h } = s;
  const horizontal = s.orientation !== "vertical";
  if (horizontal) {
    const spineY = s.flip ? y + h : y;
    return [
      [x, spineY, x + w, spineY], // spine
      [x, y, x, y + h], // left tick
      [x + w, y, x + w, y + h], // right tick
    ];
  }
  const spineX = s.flip ? x + w : x;
  return [
    [spineX, y, spineX, y + h], // spine
    [x, y, x + w, y], // top tick
    [x, y + h, x + w, y + h], // bottom tick
  ];
}

/**
 * The four edges of a diamond (rhombus) as [x1,y1,x2,y2] in normalized coords.
 * Vertices sit at the bounding-box edge midpoints: top, right, bottom, left.
 */
export function diamondSegments(s: Surface): [number, number, number, number][] {
  const { x, y, w, h } = s;
  const t: [number, number] = [x + w / 2, y];
  const r: [number, number] = [x + w, y + h / 2];
  const b: [number, number] = [x + w / 2, y + h];
  const l: [number, number] = [x, y + h / 2];
  return [
    [...t, ...r] as [number, number, number, number],
    [...r, ...b] as [number, number, number, number],
    [...b, ...l] as [number, number, number, number],
    [...l, ...t] as [number, number, number, number],
  ];
}

/** The point of a surface's named anchor, in normalized coords. */
export function anchorPoint(surface: Surface, anchor: Anchor): Point {
  const { x, y, w, h, kind } = surface;
  // A diamond's vertices coincide with the box edge midpoints, so the box
  // anchor math gives the correct on-shape points (top/right/bottom/left tips).
  // A text box shares the same rectangular anchors.
  if (kind === "box" || kind === "diamond" || kind === "text") {
    switch (anchor) {
      case "top":
        return { x: x + w / 2, y };
      case "bottom":
        return { x: x + w / 2, y: y + h };
      case "left":
        return { x, y: y + h / 2 };
      case "right":
        return { x: x + w, y: y + h / 2 };
      case "top-left":
        return { x, y };
      case "top-right":
        return { x: x + w, y };
      case "bottom-left":
        return { x, y: y + h };
      case "bottom-right":
        return { x: x + w, y: y + h };
      default:
        return { x: x + w / 2, y: y + h / 2 };
    }
  }
  // bracket: anchors live ON the spine (accounting for orientation + flip).
  if (kind === "bracket") {
    const horizontal = surface.orientation !== "vertical";
    const start = horizontal
      ? { x, y: surface.flip ? y + h : y }
      : { x: surface.flip ? x + w : x, y };
    const end = horizontal
      ? { x: x + w, y: surface.flip ? y + h : y }
      : { x: surface.flip ? x + w : x, y: y + h };
    switch (anchor) {
      case "start":
        return start;
      case "end":
        return end;
      default:
        return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    }
  }
  // line: a segment from (x,y) to (x+w, y+h).
  const end = { x: x + w, y: y + h };
  switch (anchor) {
    case "start":
      return { x, y };
    case "end":
      return end;
    default:
      return { x: (x + end.x) / 2, y: (y + end.y) / 2 };
  }
}

/**
 * The segment axis a square route must use at an anchored endpoint, or null for
 * free points and non-edge anchors (corners/center). A left/right edge needs a
 * horizontal segment leaving or entering it; a top/bottom edge needs a vertical
 * one — so the elbow exits/enters perpendicular to the bound edge.
 */
function anchorAxis(ep: Endpoint): "h" | "v" | null {
  if (!ep.ref) return null;
  switch (ep.anchor) {
    case "left":
    case "right":
      return "h";
    case "top":
    case "bottom":
      return "v";
    default:
      return null;
  }
}

/** Outward stub length (normalized) an edge-anchored end steps off its edge
 *  before routing, so square routes don't backtrack over the box for parallel
 *  (C) or facing-away (U) arrangements. Tunable. */
const STUB = 0.04;

/** Outward edge normal for an endpoint's anchor, or null for free points and
 *  non-edge anchors (center / corners / line ends). Sign-aware sibling of
 *  anchorAxis: a `right` edge exits +x, a `top` edge exits −y, etc. */
function anchorDir(ep: Endpoint): Point | null {
  if (!ep.ref) return null;
  switch (ep.anchor) {
    case "right":
      return { x: 1, y: 0 };
    case "left":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "top":
      return { x: 0, y: -1 };
    default:
      return null;
  }
}

/** Interior corners when both ends exit horizontally (dax/dbx are the x-signs of
 *  the two edge normals). Parallel magnets → C (route past the far right/left
 *  edge); opposite magnets → Z (corner at the midpoint x). */
function horizontalRoute(a: Point, b: Point, dax: number, dbx: number): Point[] {
  if (dax === dbx) {
    const extX = dax > 0 ? Math.max(a.x, b.x) + STUB : Math.min(a.x, b.x) - STUB;
    return [
      { x: extX, y: a.y },
      { x: extX, y: b.y },
    ];
  }
  const midX = (a.x + b.x) / 2;
  return [
    { x: midX, y: a.y },
    { x: midX, y: b.y },
  ];
}

/** Interior corners when both ends exit vertically (day/dby are the y-signs of
 *  the two edge normals). Mirror of horizontalRoute. */
function verticalRoute(a: Point, b: Point, day: number, dby: number): Point[] {
  if (day === dby) {
    const extY = day > 0 ? Math.max(a.y, b.y) + STUB : Math.min(a.y, b.y) - STUB;
    return [
      { x: a.x, y: extY },
      { x: b.x, y: extY },
    ];
  }
  const midY = (a.y + b.y) / 2;
  return [
    { x: a.x, y: midY },
    { x: b.x, y: midY },
  ];
}

/** Interior corner(s) of a square (orthogonal) route between resolved points a
 *  and b. Both ends edge-anchored to the SAME axis route via horizontalRoute /
 *  verticalRoute (a single elbow can't satisfy both); every other case (differing
 *  axes, or an unanchored / center / corner end) uses the single perpendicular
 *  elbow from squareHorizontalFirst. */
function squareRoute(a: Point, b: Point, from: Endpoint, to: Endpoint): Point[] {
  const dirA = anchorDir(from);
  const dirB = anchorDir(to);
  if (dirA && dirB) {
    if (dirA.x !== 0 && dirB.x !== 0) return horizontalRoute(a, b, dirA.x, dirB.x);
    if (dirA.y !== 0 && dirB.y !== 0) return verticalRoute(a, b, dirA.y, dirB.y);
  }
  return squareHorizontalFirst(a, b, from, to)
    ? [{ x: b.x, y: a.y }]
    : [{ x: a.x, y: b.y }];
}

/**
 * Whether a square route's first segment runs horizontally. An anchored endpoint
 * wins over the dominant-axis heuristic: the source's edge sets the first
 * segment; failing that, the target's edge sets the last segment (a horizontal
 * target edge needs a vertical last segment, i.e. vertical-first); failing both,
 * fall back to the wider-than-tall run.
 */
function squareHorizontalFirst(
  a: Point,
  b: Point,
  from: Endpoint,
  to: Endpoint,
): boolean {
  const fromAxis = anchorAxis(from);
  if (fromAxis !== null) return fromAxis === "h";
  const toAxis = anchorAxis(to);
  if (toAxis !== null) return toAxis === "v";
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
}

/**
 * The polyline points of a connector in normalized coords. `straight` is two
 * points; `square` inserts a right-angle corner (orthogonal route). The elbow
 * leaves/enters an anchored endpoint perpendicular to its edge (see
 * `squareHorizontalFirst`); for free points it goes horizontal-first when the
 * run is wider than tall, else vertical-first.
 */
export function connectorPoints(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): Point[] {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  const wps = c.waypoints ?? [];
  // Manual waypoints take over the path shape (straight segments through them).
  if (wps.length > 0) return [a, ...wps.map((p) => ({ x: p.x, y: p.y })), b];
  if (c.routing !== "square") return [a, b];
  return [a, ...squareRoute(a, b, c.from, c.to), b];
}

/** Resolve a connector endpoint to a concrete normalized point. */
export function resolveEndpoint(
  annotations: Annotation[],
  ep: Endpoint,
): Point {
  if (ep.ref) {
    const surface = annotations.find(
      (a): a is Surface => a.kind !== "connector" && a.id === ep.ref,
    );
    if (surface) return anchorPoint(surface, ep.anchor ?? "center");
  }
  return { x: ep.x ?? 0.5, y: ep.y ?? 0.5 };
}

/** Anchors offered as snap targets per surface kind. */
function snapAnchors(kind: Surface["kind"]): Anchor[] {
  if (kind === "box" || kind === "text") {
    return [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ];
  }
  // Diamond: only the four vertices + center are on the shape (corners are
  // empty space), so those are the useful flowchart snap targets.
  if (kind === "diamond") {
    return ["center", "top", "bottom", "left", "right"];
  }
  return ["start", "mid", "end"];
}

export interface SnapResult {
  x: number;
  y: number;
  ref?: string;
  anchor?: Anchor;
}

/**
 * Snap a dragged point to the nearest surface anchor within `threshold`
 * (normalized distance). Returns a surface binding when snapped, else the free
 * point. `excludeId` skips the surface being edited.
 */
export function snapPoint(
  surfaces: Surface[],
  p: Point,
  threshold = 0.05,
  excludeId?: string,
): SnapResult {
  let best: SnapResult | null = null;
  let bestD = threshold;
  for (const s of surfaces) {
    if (s.id === excludeId) continue;
    for (const a of snapAnchors(s.kind)) {
      const ap = anchorPoint(s, a);
      const d = Math.hypot(ap.x - p.x, ap.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { x: ap.x, y: ap.y, ref: s.id, anchor: a };
      }
    }
  }
  return best ?? { x: p.x, y: p.y };
}

/** Angular tolerance (degrees) for snapping a dragged vector to an axis. */
export const AXIS_SNAP_DEG = 6;

/**
 * Snap a dragged vector (dx, dy) to the nearest axis when it lies within
 * `AXIS_SNAP_DEG` of horizontal or vertical. The test is **angle-based**, so the
 * snap zone has the same width at any length — short connectors/lines can hold a
 * shallow angle instead of jumping flat (the old fixed-distance rule made the
 * angular zone balloon as the run got shorter). `shift` hard-locks to the
 * dominant axis (full axis lock). Signs are preserved (lines allow negative
 * extent for 360° rotation).
 */
export function snapAxisVector(
  dx: number,
  dy: number,
  shift: boolean,
): { dx: number; dy: number } {
  if (shift) {
    return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
  }
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return { dx, dy };
  const t = Math.tan((AXIS_SNAP_DEG * Math.PI) / 180);
  if (ay <= ax * t) return { dx, dy: 0 }; // within tolerance of horizontal
  if (ax <= ay * t) return { dx: 0, dy }; // within tolerance of vertical
  return { dx, dy };
}

/** Normalized value → CSS/SVG percentage string. */
export const pct = (n: number): string => `${n * 100}%`;

/** Short unique id for a new annotation. */
export function annotationId(): string {
  return Math.random().toString(36).slice(2, 9);
}
