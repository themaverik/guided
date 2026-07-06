/*
 * Annotation geometry (ADR-004). Pure helpers shared by the static renderer and
 * the (future) interactive editor. All coordinates are normalized 0–1 relative
 * to the image slot.
 */
import type {
  Anchor,
  Annotation,
  ConnectorBend,
  Connector,
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
  // A text box and an ellipse share the same rectangular bounding-box anchors.
  if (kind === "box" || kind === "diamond" || kind === "text" || kind === "ellipse") {
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

/** Normalized default box for an open-shape (line/bracket) text label. */
export const LABEL_W = 0.3;
export const LABEL_H = 0.1;

/** A LABEL_W×LABEL_H label box centered on (cx,cy), clamped inside the page. */
export function labelRectAt(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  const clamp = (v: number, size: number) => Math.max(0, Math.min(1 - size, v));
  return { x: clamp(cx - LABEL_W / 2, LABEL_W), y: clamp(cy - LABEL_H / 2, LABEL_H), w: LABEL_W, h: LABEL_H };
}

/** The normalized rect an in-shape text label occupies. Closed shapes fill their
 *  bounds; open shapes (line/bracket) get a fixed box centered on the midpoint,
 *  clamped inside the page. */
export function labelRect(s: Surface): { x: number; y: number; w: number; h: number } {
  if (s.kind === "line" || s.kind === "bracket") {
    return labelRectAt(s.x + s.w / 2, s.y + s.h / 2);
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

/** Midpoint of a connector's resolved endpoints (normalized). */
export function connectorMidpoint(annotations: Annotation[], c: Connector): Point {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The segment axis a square route must use at an anchored endpoint, or null for
 * free points and non-edge anchors (corners/center). A left/right edge needs a
 * horizontal segment leaving or entering it; a top/bottom edge needs a vertical
 * one — so the elbow exits/enters perpendicular to the bound edge.
 */
function anchorAxis(ep: Endpoint): "h" | "v" | null {
  if (ep.dir) return ep.dir === "left" || ep.dir === "right" ? "h" : "v";
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

/** Unit travel vector for an endpoint direction override. */
const DIR_VEC: Record<NonNullable<import("./book-schema").Endpoint["dir"]>, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** Outward edge normal for an endpoint's anchor, or null for free points and
 *  non-edge anchors (center / corners / line ends). Sign-aware sibling of
 *  anchorAxis: a `right` edge exits +x, a `top` edge exits −y, etc.
 *  When `ep.dir` is set, honors the explicit direction (role-aware for `to`
 *  endpoints: `isTo=true` negates so the outward normal at b = −arrow). */
function anchorDir(ep: Endpoint, isTo = false): Point | null {
  if (ep.dir) {
    const v = DIR_VEC[ep.dir];
    return isTo ? { x: -v.x, y: -v.y } : v; // `to` end: outward = −arrow
  }
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
  const toward = dax > 0 ? b.x >= a.x : b.x <= a.x;
  if (!toward) {
    const ax = a.x + dax * STUB;
    const bx = b.x + dbx * STUB;
    const midY = (a.y + b.y) / 2;
    return [
      { x: ax, y: a.y },
      { x: ax, y: midY },
      { x: bx, y: midY },
      { x: bx, y: b.y },
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
  const toward = day > 0 ? b.y >= a.y : b.y <= a.y;
  if (!toward) {
    const ay = a.y + day * STUB;
    const by = b.y + dby * STUB;
    const midX = (a.x + b.x) / 2;
    return [
      { x: a.x, y: ay },
      { x: midX, y: ay },
      { x: midX, y: by },
      { x: b.x, y: by },
    ];
  }
  const midY = (a.y + b.y) / 2;
  return [
    { x: a.x, y: midY },
    { x: b.x, y: midY },
  ];
}

/** Interior corners when only the `to` end is explicitly directed (outB = its
 *  outward normal = −arrow). Uses a clean elbow when the far end already sits on
 *  the arrow side, else a STUB so `left` vs `right` (and `up`/`down`) differ. */
function directedToRoute(a: Point, b: Point, outB: Point): Point[] {
  if (outB.x !== 0) {
    const arrowSign = -outB.x;
    if (Math.sign(b.x - a.x) === arrowSign) return [{ x: a.x, y: b.y }];
    const penX = b.x + outB.x * STUB;
    return [{ x: penX, y: a.y }, { x: penX, y: b.y }];
  }
  const arrowSign = -outB.y;
  if (Math.sign(b.y - a.y) === arrowSign) return [{ x: b.x, y: a.y }];
  const penY = b.y + outB.y * STUB;
  return [{ x: a.x, y: penY }, { x: b.x, y: penY }];
}

/** Interior corners when only the `from` end is explicitly directed (outA = the
 *  leave direction). Mirror of directedToRoute for the first segment. */
function directedFromRoute(a: Point, b: Point, outA: Point): Point[] {
  if (outA.x !== 0) {
    if (Math.sign(b.x - a.x) === outA.x) return [{ x: b.x, y: a.y }];
    const fx = a.x + outA.x * STUB;
    return [{ x: fx, y: a.y }, { x: fx, y: b.y }];
  }
  if (Math.sign(b.y - a.y) === outA.y) return [{ x: a.x, y: b.y }];
  const fy = a.y + outA.y * STUB;
  return [{ x: a.x, y: fy }, { x: b.x, y: fy }];
}

/** Interior corner(s) of a square (orthogonal) route between resolved points a
 *  and b. Both ends edge-anchored to the SAME axis route via horizontalRoute /
 *  verticalRoute (a single elbow can't satisfy both); exactly one end carries an
 *  explicit `dir` → sign-forced single-directed route; every other case (differing
 *  axes, or an unanchored / center / corner end) uses the single perpendicular
 *  elbow from squareHorizontalFirst. */
function squareRoute(a: Point, b: Point, from: Endpoint, to: Endpoint): Point[] {
  const dirA = anchorDir(from, false);
  const dirB = anchorDir(to, true);
  if (dirA && dirB) {
    if (dirA.x !== 0 && dirB.x !== 0) return horizontalRoute(a, b, dirA.x, dirB.x);
    if (dirA.y !== 0 && dirB.y !== 0) return verticalRoute(a, b, dirA.y, dirB.y);
  }
  // Exactly one end directed by an EXPLICIT dir → sign-forced route.
  if (from.dir && !dirB) return directedFromRoute(a, b, dirA!);
  if (to.dir && !dirA) return directedToRoute(a, b, dirB!);
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

/** The unbent square auto-route `[a, ...squareRoute, b]` for a connector. Used by
 *  the editor to compute bend offsets relative to the auto-route. */
export function squareBaseRoute(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): Point[] {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  return [a, ...squareRoute(a, b, c.from, c.to), b];
}

/** The rendered polyline of a connector plus per-segment provenance. `square`
 *  routes through `routeWithBends` (auto-route + manual bends); a `square`
 *  connector still carrying legacy `waypoints` (and no `bends`) renders the
 *  waypoint route for back-compat; `straight` routes through its waypoints. */
export function connectorRoute(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): { points: Point[]; segments: SegmentMeta[] } {
  const a = resolveEndpoint(annotations, c.from);
  const b = resolveEndpoint(annotations, c.to);
  const wps = c.waypoints ?? [];
  const passThrough = (pts: Point[]) => ({
    points: pts,
    segments: pts.slice(1).map((_, i) => ({ baseSeg: i, bend: null, draggable: false })),
  });
  if (c.routing !== "square") {
    return passThrough([a, ...wps.map((p) => ({ x: p.x, y: p.y })), b]);
  }
  if (wps.length > 0 && !(c.bends && c.bends.length)) {
    return passThrough([a, ...wps.map((p) => ({ x: p.x, y: p.y })), b]);
  }
  return routeWithBends([a, ...squareRoute(a, b, c.from, c.to), b], c.bends ?? []);
}

/** The polyline points of a connector in normalized coords (see connectorRoute). */
export function connectorPoints(
  annotations: Annotation[],
  c: import("./book-schema").Connector,
): Point[] {
  return connectorRoute(annotations, c).points;
}

/** Corner radius (normalized) for rounded square-connector elbows. Clamped per
 *  corner to half the shorter adjoining segment. Tunable. */
export const CORNER_RADIUS = 0.02;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const pt = (x: number, y: number): Point => ({ x: round4(x), y: round4(y) });

/** Split a connector polyline into outer marker-carrying end segments and a
 *  rounded middle path. The first/last straight segments render as plain lines
 *  (carrying the arrowhead markers in the outer % space, undistorted); the middle
 *  replaces each interior corner with a quadratic bend of `radius` (clamped to
 *  half the shorter adjoining segment) and renders as the returned path `d` (in
 *  0..1 units for a nested viewBox). `d` is "" when there are no corners. Pure;
 *  all output coordinates are rounded to 4 decimals for stable output. */
export function buildRoundedConnector(
  points: Point[],
  radius: number,
): { d: string; startSeg: [Point, Point]; endSeg: [Point, Point] } {
  const n = points.length;
  const p0 = points[0];
  const pLast = points[n - 1];
  if (n < 3) {
    const a = pt(p0.x, p0.y);
    const b = pt(pLast.x, pLast.y);
    return { d: "", startSeg: [a, b], endSeg: [a, b] };
  }
  const f = (p: Point) => `${round4(p.x)},${round4(p.y)}`;
  const cmds: string[] = [];
  let firstPullback = pt(p0.x, p0.y);
  let lastPullback = pt(pLast.x, pLast.y);
  for (let i = 1; i < n - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dIn = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dOut = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, dIn / 2, dOut / 2);
    const inX = dIn === 0 ? 0 : (prev.x - curr.x) / dIn;
    const inY = dIn === 0 ? 0 : (prev.y - curr.y) / dIn;
    const outX = dOut === 0 ? 0 : (next.x - curr.x) / dOut;
    const outY = dOut === 0 ? 0 : (next.y - curr.y) / dOut;
    const pin = pt(curr.x + r * inX, curr.y + r * inY);
    const pout = pt(curr.x + r * outX, curr.y + r * outY);
    if (i === 1) {
      firstPullback = pin;
      cmds.push(`M ${f(pin)}`);
    } else {
      cmds.push(`L ${f(pin)}`);
    }
    cmds.push(`Q ${f(curr)} ${f(pout)}`);
    lastPullback = pout;
  }
  return {
    d: cmds.join(" "),
    startSeg: [pt(p0.x, p0.y), firstPullback],
    endSeg: [lastPullback, pt(pLast.x, pLast.y)],
  };
}

/** Orientation of a base route segment, or null if degenerate (zero-length). */
function segAxis(p: Point, q: Point): "h" | "v" | null {
  if (p.y === q.y && p.x !== q.x) return "h";
  if (p.x === q.x && p.y !== q.y) return "v";
  return null;
}

/** Provenance of one rendered route segment, so the editor can map a handle drag
 *  back to a bend. `draggable` is false for the structural stub/jog of an inserted
 *  detour. `bend` is the index into the connector's `bends` array governing this
 *  run, or null for an un-adjusted base run. */
export interface SegmentMeta {
  baseSeg: number;
  bend: number | null;
  draggable: boolean;
}

/** Apply manual segment bends to a square connector's auto-route `base` (the
 *  `[a, ...squareRoute, b]` polyline). Interior runs displace perpendicular in
 *  place; a bend on an anchored run (touching `a` or `b`) inserts a stub+jog
 *  detour so the perpendicular exit is preserved (L-bending). Returns the
 *  rendered polyline plus per-segment provenance. Pure; at most one bend per
 *  base segment (first wins). Output coordinates rounded to 4 decimals. */
export function routeWithBends(
  base: Point[],
  bends: ConnectorBend[],
): { points: Point[]; segments: SegmentMeta[] } {
  const segCount = base.length - 1;
  const bySeg = new Map<number, { idx: number; bend: ConnectorBend }>();
  bends.forEach((b, idx) => {
    if (b.seg < 0 || b.seg >= segCount) return; // out of range → drop
    if (segAxis(base[b.seg], base[b.seg + 1]) !== b.axis) return; // axis mismatch → drop
    if (!bySeg.has(b.seg)) bySeg.set(b.seg, { idx, bend: b });
  });

  if (bySeg.size === 0) {
    return {
      points: base.map((p) => ({ x: p.x, y: p.y })),
      segments: base.slice(1).map((_, i) => ({ baseSeg: i, bend: null, draggable: true })),
    };
  }

  const perpKey = (axis: "h" | "v") => (axis === "h" ? "y" : "x") as "x" | "y";
  // Working corners with perpendicular pre-shifts (interior: both ends; anchored:
  // the inner corner only — the anchor itself stays fixed for its perpendicular exit).
  const pts = base.map((p) => ({ x: p.x, y: p.y }));
  for (const [seg, { bend }] of bySeg) {
    const k = perpKey(bend.axis);
    if (seg === 0) pts[1][k] += bend.offset;
    else if (seg === segCount - 1) pts[segCount - 1][k] += bend.offset;
    else {
      pts[seg][k] += bend.offset;
      pts[seg + 1][k] += bend.offset;
    }
  }

  // Unit step off an endpoint along its segment's axis (toward the inner corner).
  const along = (p: Point, q: Point): Point =>
    Math.abs(q.x - p.x) >= Math.abs(q.y - p.y)
      ? { x: Math.sign(q.x - p.x), y: 0 }
      : { x: 0, y: Math.sign(q.y - p.y) };

  const points: Point[] = [pt(pts[0].x, pts[0].y)];
  const segments: SegmentMeta[] = [];
  const addSeg = (p: Point, meta: SegmentMeta) => {
    points.push(pt(p.x, p.y));
    segments.push(meta);
  };

  // HEAD (seg 0).
  const head = bySeg.get(0);
  if (head) {
    const k = perpKey(head.bend.axis);
    const dir = along(base[0], base[1]);
    const stub = { x: base[0].x + dir.x * STUB, y: base[0].y + dir.y * STUB };
    const jog = { x: stub.x, y: stub.y };
    jog[k] = stub[k] + head.bend.offset;
    addSeg(stub, { baseSeg: 0, bend: head.idx, draggable: false });
    addSeg(jog, { baseSeg: 0, bend: head.idx, draggable: false });
    addSeg(pts[1], { baseSeg: 0, bend: head.idx, draggable: true });
  } else {
    addSeg(pts[1], { baseSeg: 0, bend: null, draggable: true });
  }

  // INTERIOR runs (seg 1 .. segCount-2).
  for (let i = 1; i <= segCount - 2; i++) {
    const bm = bySeg.get(i);
    addSeg(pts[i + 1], { baseSeg: i, bend: bm ? bm.idx : null, draggable: true });
  }

  // TAIL (last segment), when the route has more than one segment.
  if (segCount >= 2) {
    const tail = bySeg.get(segCount - 1);
    if (tail) {
      const k = perpKey(tail.bend.axis);
      const bEnd = base[segCount];
      const dir = along(bEnd, base[segCount - 1]);
      const stub = { x: bEnd.x + dir.x * STUB, y: bEnd.y + dir.y * STUB };
      const jog = { x: stub.x, y: stub.y };
      jog[k] = stub[k] + tail.bend.offset;
      addSeg(jog, { baseSeg: segCount - 1, bend: tail.idx, draggable: true });
      addSeg(stub, { baseSeg: segCount - 1, bend: tail.idx, draggable: false });
      addSeg(bEnd, { baseSeg: segCount - 1, bend: tail.idx, draggable: false });
    } else {
      addSeg(pts[segCount], { baseSeg: segCount - 1, bend: null, draggable: true });
    }
  }

  return { points, segments };
}

/** Build the bend for dragging base segment `baseSeg` (orientation `axis`) to
 *  `pointer`. The offset is the perpendicular delta from the auto-route; within
 *  `tol` of the auto-route it returns null (snap back / remove the bend). Pure. */
export function bendForDrag(
  base: Point[],
  baseSeg: number,
  axis: "h" | "v",
  pointer: Point,
  tol = 0.01,
): ConnectorBend | null {
  const basePerp = axis === "h" ? base[baseSeg].y : base[baseSeg].x;
  const ptrPerp = axis === "h" ? pointer.y : pointer.x;
  const offset = round4(ptrPerp - basePerp);
  if (Math.abs(offset) < tol) return null;
  return { seg: baseSeg, axis, offset };
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
export function snapAnchors(kind: Surface["kind"]): Anchor[] {
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
  // Diamond + ellipse: only the four edge points + center sit on the shape
  // (corners are empty space), so those are the useful snap targets.
  if (kind === "diamond" || kind === "ellipse") {
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

/** Snap a vector to the nearest compass direction (dominant axis + sign; an exact
 *  tie resolves toward horizontal). Used to turn a direction-knob drag into an
 *  `Endpoint.dir` value. */
export function compassDir(dx: number, dy: number): "left" | "right" | "up" | "down" {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/** Surface kinds that are created by a rubber-band / signed-vector drag. */
export type DrawKind = "box" | "diamond" | "text" | "bracket" | "line" | "ellipse";

/** Minimum normalized extent below which a drag is treated as a bare click. */
const MIN_DRAW = 0.015;

/** Per-kind default size (normalized) used for a bare click, mirroring newSurface. */
const DRAW_DEFAULTS: Record<DrawKind, { w: number; h: number }> = {
  box: { w: 0.4, h: 0.3 },
  diamond: { w: 0.3, h: 0.3 },
  text: { w: 0.3, h: 0.1 },
  bracket: { w: 0.05, h: 0.4 },
  line: { w: 0.4, h: 0 },
  ellipse: { w: 0.3, h: 0.3 },
};

/** Turn a press→release drag into shape geometry (normalized 0–1). Rubber-band
 *  kinds return a direction-agnostic min/max rect; `line` keeps a signed vector
 *  anchored at `start`. A sub-floor drag / bare click yields the kind's default
 *  size anchored at `start`. */
export function boundsFromDrag(
  start: Point,
  end: Point,
  kind: DrawKind,
): { x: number; y: number; w: number; h: number } {
  if (kind === "line") {
    const w = end.x - start.x;
    const h = end.y - start.y;
    if (Math.abs(w) < MIN_DRAW && Math.abs(h) < MIN_DRAW) {
      return { x: start.x, y: start.y, ...DRAW_DEFAULTS.line };
    }
    return { x: start.x, y: start.y, w, h };
  }
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < MIN_DRAW && h < MIN_DRAW) {
    return { x: start.x, y: start.y, ...DRAW_DEFAULTS[kind] };
  }
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h };
}

/** An axis-aligned rectangle in normalized 0–1 page coordinates. */
export interface Rect { x: number; y: number; w: number; h: number }

/** A smart-guide line to draw while dragging (full-page extent in v1). */
export interface GuideLine { axis: "x" | "y"; at: number }

export interface AlignSnapResult { dx: number; dy: number; guides: GuideLine[] }

/** A distribution guide: a short capped bar marking one equal gap. For axis "x"
 *  the bar is horizontal at cross-y `at`, spanning x `from`→`to`; for axis "y" it
 *  is vertical at cross-x `at`, spanning y `from`→`to`. */
export interface DistGuide { axis: "x" | "y"; at: number; from: number; to: number }
export interface DistResult { dx: number; dy: number; guides: DistGuide[] }

/** The 9 anchor points of a rectangle: 4 corners, 4 edge midpoints, center.
 *  Order: top-left, top-center, top-right, mid-left, center, mid-right,
 *  bottom-left, bottom-center, bottom-right. */
export function rectAnchors(rect: Rect): Point[] {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = x + w;
  const b = y + h;
  return [
    { x, y }, { x: cx, y }, { x: r, y },
    { x, y: cy }, { x: cx, y: cy }, { x: r, y: cy },
    { x, y: b }, { x: cx, y: b }, { x: r, y: b },
  ];
}

/** The point nearest to `p` within `thr` (Euclidean, normalized), or null.
 *  Strictly-nearest; first wins on an exact tie. */
export function nearestPoint(p: Point, points: Point[], thr: number): Point | null {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const q of points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= thr && d < bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return best;
}

/** Ids of rect-bearing surfaces (box/diamond/ellipse/text/bracket) whose bounds
 *  contain `p`, top-most first (array order is bottom→top, so reverse). Pure;
 *  used to cycle selection through overlapping shapes on Alt-click. */
export function hitStack(annotations: Annotation[], p: Point): string[] {
  const ids: string[] = [];
  for (const a of annotations) {
    if (
      a.kind === "box" || a.kind === "diamond" || a.kind === "ellipse" ||
      a.kind === "text" || a.kind === "bracket"
    ) {
      if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) {
        ids.push(a.id);
      }
    }
  }
  return [...ids].reverse();
}

/** The id after `currentId` in `stack`, wrapping to the first; the first id if
 *  `currentId` is not in `stack`; `null` if `stack` is empty. */
export function nextInStack(stack: string[], currentId: string | null): string | null {
  if (stack.length === 0) return null;
  const i = currentId == null ? -1 : stack.indexOf(currentId);
  return stack[(i + 1) % stack.length];
}

/** Nearest target line to any source line within `thr`; returns the signed delta
 *  (target − source) and the matched target coordinate, or null. */
function nearestLine(
  src: number[],
  tgt: number[],
  thr: number,
): { delta: number; at: number } | null {
  let bestDist = Infinity;
  let out: { delta: number; at: number } | null = null;
  for (const s of src) {
    for (const t of tgt) {
      const d = Math.abs(t - s);
      if (d <= thr && d < bestDist) {
        bestDist = d;
        out = { delta: t - s, at: t };
      }
    }
  }
  return out;
}

/**
 * Figma-style alignment snap for a rectangular surface. Compares the moving
 * rect's reference lines to every target's edges + centers, per axis, and returns
 * the position/size delta to apply plus one guide per snapped axis. **Any** moving
 * line may snap to **any** target line (edge-to-edge, edge-to-center,
 * center-to-center) — the exact Figma behavior. `move` snaps all six lines;
 * `resize` snaps only the dragged right (X) and bottom (Y) edges. X and Y resolve
 * independently. Pure. `targets` should already exclude the moving surface itself.
 */
export function snapAlign(
  moving: Rect,
  targets: Rect[],
  thrX: number,
  thrY: number,
  mode: "move" | "resize",
): AlignSnapResult {
  const srcX =
    mode === "resize"
      ? [moving.x + moving.w]
      : [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const srcY =
    mode === "resize"
      ? [moving.y + moving.h]
      : [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const tgtX = targets.flatMap((t) => [t.x, t.x + t.w / 2, t.x + t.w]);
  const tgtY = targets.flatMap((t) => [t.y, t.y + t.h / 2, t.y + t.h]);
  const bx = nearestLine(srcX, tgtX, thrX);
  const by = nearestLine(srcY, tgtY, thrY);
  const guides: GuideLine[] = [];
  if (bx) guides.push({ axis: "x", at: bx.at });
  if (by) guides.push({ axis: "y", at: by.at });
  return { dx: bx ? bx.delta : 0, dy: by ? by.delta : 0, guides };
}

/** One axis of equal-spacing distribution. `m0`/`mSize` = moving interval
 *  start+size; `sibs` = sibling intervals (start `s`, end `e`, center `c`) on this
 *  axis; `thr` = normalized snap threshold (≤0 disables). Returns the delta to
 *  apply and the equal-gap spans, or null. */
function distributeAxis(
  m0: number,
  mSize: number,
  sibs: { s: number; e: number; c: number }[],
  thr: number,
): { delta: number; gaps: [number, number][] } | null {
  if (thr <= 0 || sibs.length === 0) return null;
  const mc = m0 + mSize / 2;
  const left = sibs.filter((s) => s.c < mc).sort((a, b) => b.c - a.c);
  const right = sibs.filter((s) => s.c > mc).sort((a, b) => a.c - b.c);
  const L = left[0];
  const R = right[0];
  // Case 1 — centered between two neighbors (equal gaps on both sides).
  if (L && R) {
    const target = (L.e + R.s - mSize) / 2;
    const delta = target - m0;
    if (delta === 0 || Math.abs(delta) > thr) return null;
    return { delta, gaps: [[L.e, target], [target + mSize, R.s]] };
  }
  // Case 2 — continue the run: match the gap just beyond the single neighbor.
  if (L && left[1]) {
    const gap = L.s - left[1].e;
    const target = L.e + gap;
    const delta = target - m0;
    if (delta === 0 || Math.abs(delta) > thr) return null;
    return { delta, gaps: [[L.e, target]] };
  }
  if (R && right[1]) {
    const gap = right[1].s - R.e;
    const target = R.s - gap - mSize;
    const delta = target - m0;
    if (delta === 0 || Math.abs(delta) > thr) return null;
    return { delta, gaps: [[target + mSize, R.s]] };
  }
  return null;
}

/** Figma-style equal-spacing snap for a moving rect against sibling rects. X and Y
 *  resolve independently. Returns the position delta + distribution guide bars.
 *  Pure. `siblings` should already exclude the moving surface. */
export function snapDistribute(
  moving: Rect,
  siblings: Rect[],
  thrX: number,
  thrY: number,
): DistResult {
  const mcx = moving.x + moving.w / 2;
  const mcy = moving.y + moving.h / 2;
  const sibX = siblings.map((s) => ({ s: s.x, e: s.x + s.w, c: s.x + s.w / 2 }));
  const sibY = siblings.map((s) => ({ s: s.y, e: s.y + s.h, c: s.y + s.h / 2 }));
  const rx = distributeAxis(moving.x, moving.w, sibX, thrX);
  const ry = distributeAxis(moving.y, moving.h, sibY, thrY);
  const guides: DistGuide[] = [];
  if (rx) for (const [from, to] of rx.gaps) guides.push({ axis: "x", at: mcy, from, to });
  if (ry) for (const [from, to] of ry.gaps) guides.push({ axis: "y", at: mcx, from, to });
  return { dx: rx ? rx.delta : 0, dy: ry ? ry.delta : 0, guides };
}

/** Normalized value → CSS/SVG percentage string. */
export const pct = (n: number): string => `${n * 100}%`;

/** Short unique id for a new annotation. */
export function annotationId(): string {
  return Math.random().toString(36).slice(2, 9);
}
