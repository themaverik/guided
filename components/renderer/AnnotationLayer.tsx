/*
 * Static SVG overlay that draws a page's annotations (ADR-004). Coordinates are
 * normalized 0–1 and emitted as SVG percentages, so the layer scales with the
 * page (and through auto-fit) without distorting strokes. Pure component —
 * renders in both the editor preview and print.
 *
 * Connector endpoint markers are generated per connector with the color baked
 * in (no shared defs / context-stroke), so they always paint correctly.
 */
import type {
  Annotation,
  Connector,
  EndpointSize,
  EndpointStyle,
  Surface,
  TextFont,
} from "@/lib/book-schema";
import { DEFAULT_TEXT_SIZE } from "@/lib/book-schema";
import {
  CORNER_RADIUS,
  FONT_STACKS,
  MARKER_PX,
  bracketSegments,
  buildRoundedConnector,
  connectorMidpoint,
  connectorPoints,
  labelRect,
  labelRectAt,
  pct,
} from "@/lib/annotations";
import { rgbaFromHex } from "@/lib/annotation-palette";

/** Diamond corner radius in the rhombus's local 100×100 coordinate space. */
const CORNER = 10;

/** Reusable text label box rendered inside a foreignObject. Used by both
 *  ShapeLabel (open/closed surfaces) and ConnectorLine (masked midpoint label). */
function LabelBox({
  rect, text, fontSize, fontFamily, color, align, masked,
}: {
  rect: { x: number; y: number; w: number; h: number };
  text: string; fontSize?: number; fontFamily?: TextFont; color: string;
  align?: "left" | "center" | "right"; masked: boolean;
}) {
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  return (
    <foreignObject x={pct(rect.x)} y={pct(rect.y)} width={pct(rect.w)} height={pct(rect.h)} overflow="visible">
      <div className={`anno-shape-label${masked ? " masked" : ""}`} style={{ justifyContent: justify }}>
        <span style={{ fontFamily: FONT_STACKS[fontFamily ?? "sans"], fontSize: fontSize ?? DEFAULT_TEXT_SIZE, color, textAlign: align ?? "center" }}>
          {text}
        </span>
      </div>
    </foreignObject>
  );
}

/** A centered text label for a shape (box/diamond/ellipse fill their bounds; open
 *  shapes get a midpoint pill that masks the stroke). Renders nothing when empty. */
function ShapeLabel({ s }: { s: Surface }) {
  if (!s.text || !s.text.trim()) return null;
  return (
    <LabelBox
      rect={labelRect(s)}
      text={s.text}
      fontSize={s.fontSize}
      fontFamily={s.fontFamily}
      color={s.color ?? s.stroke}
      align={s.align}
      masked={s.kind === "line" || s.kind === "bracket"}
    />
  );
}

function SurfaceShape({ s }: { s: Surface }) {
  const common = {
    stroke: s.stroke,
    strokeWidth: s.width,
    fill: "none" as const,
  };
  const withLabel = (el: React.ReactNode) =>
    s.text && s.text.trim() ? (
      <g>
        {el}
        <ShapeLabel s={s} />
      </g>
    ) : (
      el
    );
  if (s.kind === "box") {
    return withLabel(
      <rect
        x={pct(s.x)}
        y={pct(s.y)}
        width={pct(s.w)}
        height={pct(s.h)}
        rx={6}
        ry={6}
        {...common}
        fill={s.fill ?? "none"}
        fillOpacity={s.fillOpacity ?? 1}
      />,
    );
  }
  if (s.kind === "ellipse") {
    return withLabel(
      <ellipse
        cx={pct(s.x + s.w / 2)}
        cy={pct(s.y + s.h / 2)}
        rx={pct(s.w / 2)}
        ry={pct(s.h / 2)}
        {...common}
        fill={s.fill ?? "none"}
        fillOpacity={s.fillOpacity ?? 1}
      />,
    );
  }
  if (s.kind === "line") {
    return withLabel(
      <line
        x1={pct(s.x)}
        y1={pct(s.y)}
        x2={pct(s.x + s.w)}
        y2={pct(s.y + s.h)}
        {...common}
      />,
    );
  }
  if (s.kind === "diamond") {
    // Rounded rhombus. Drawn inside a local 100×100 box that stretches to the
    // surface bounds; a non-scaling stroke keeps the line crisp (no viewBox
    // distortion) and the corners get the same soft radius as the box surface.
    const k = CORNER / Math.SQRT2; // edge inset for each rounded vertex
    const d = [
      `M ${50 - k} ${k}`,
      `Q 50 0 ${50 + k} ${k}`,
      `L ${100 - k} ${50 - k}`,
      `Q 100 50 ${100 - k} ${50 + k}`,
      `L ${50 + k} ${100 - k}`,
      `Q 50 100 ${50 - k} ${100 - k}`,
      `L ${k} ${50 + k}`,
      `Q 0 50 ${k} ${50 - k}`,
      "Z",
    ].join(" ");
    return withLabel(
      <svg
        x={pct(s.x)}
        y={pct(s.y)}
        width={pct(s.w)}
        height={pct(s.h)}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        overflow="visible"
      >
        <path
          d={d}
          fill={s.fill ?? "none"}
          fillOpacity={s.fillOpacity ?? 1}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>,
    );
  }
  if (s.kind === "text") {
    // A free-floating text label. foreignObject hosts a real HTML block so text
    // wraps and styles the same in the editor preview and the Playwright PDF.
    return (
      <foreignObject
        x={pct(s.x)}
        y={pct(s.y)}
        width={pct(s.w)}
        height={pct(s.h)}
        overflow="visible"
      >
        <div
          className="anno-text"
          style={{
            fontFamily: FONT_STACKS[s.fontFamily ?? "sans"],
            fontSize: s.fontSize ?? DEFAULT_TEXT_SIZE,
            color: s.color ?? s.stroke,
            textAlign: s.align ?? "left",
            background: s.fill != null ? rgbaFromHex(s.fill, s.fillOpacity ?? 1) : undefined,
            border: s.width ? `${s.width}px solid ${s.stroke}` : undefined,
            padding: s.fill != null || s.width ? "2px 4px" : undefined,
          }}
        >
          {s.text ?? ""}
        </div>
      </foreignObject>
    );
  }
  return withLabel(
    <g {...common}>
      {bracketSegments(s).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={pct(x1)} y1={pct(y1)} x2={pct(x2)} y2={pct(y2)} />
      ))}
    </g>,
  );
}

/** A marker element for one endpoint, color baked in. */
function endpointMarker(
  id: string,
  style: EndpointStyle,
  size: EndpointSize | undefined,
  color: string,
) {
  if (style === "none") return null;
  const s = MARKER_PX[size ?? "medium"];
  // Per-style geometry retuned to a shared ~0.7·s visual extent so every style
  // reads at a consistent size for a given EndpointSize (a filled shape reads
  // larger than a hollow one at equal bounds, so the filled dot stays smaller).
  const r = s * 0.35;
  const dot = s * 0.24;
  const common = {
    id,
    markerUnits: "userSpaceOnUse" as const,
    markerWidth: s,
    markerHeight: s,
  };
  switch (style) {
    case "arrow":
      return (
        <marker {...common} refX={s * 0.85} refY={s / 2} orient="auto-start-reverse">
          <path d={`M${s * 0.15},${s * 0.15} L${s * 0.85},${s / 2} L${s * 0.15},${s * 0.85} z`} fill={color} />
        </marker>
      );
    case "circle":
      // Centered on the endpoint (sits on a snapped anchor); the white fill
      // hides the line inside, so it reads as the line meeting the circumference.
      return (
        <marker {...common} refX={s / 2} refY={s / 2}>
          <circle cx={s / 2} cy={s / 2} r={r} fill="#ffffff" stroke={color} strokeWidth={1.5} />
        </marker>
      );
    case "diamond": {
      // Hollow rhombus centered on the endpoint — reads as a flowchart node
      // terminus, like the circle cap.
      const dd = s * 0.38;
      const cx = s / 2;
      const cy = s / 2;
      return (
        <marker {...common} refX={cx} refY={cy}>
          <path
            d={`M${cx},${cy - dd} L${cx + dd},${cy} L${cx},${cy + dd} L${cx - dd},${cy} z`}
            fill="#ffffff"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </marker>
      );
    }
    case "point":
      return (
        <marker {...common} refX={s / 2} refY={s / 2}>
          <circle cx={s / 2} cy={s / 2} r={dot} fill={color} />
        </marker>
      );
    case "bar":
      return (
        <marker {...common} refX={s / 2} refY={s / 2} orient="auto">
          <line x1={s / 2} y1={s * 0.1} x2={s / 2} y2={s * 0.9} stroke={color} strokeWidth={1.5} />
        </marker>
      );
    default:
      return null;
  }
}

function ConnectorLine({
  c,
  annotations,
}: {
  c: Connector;
  annotations: Annotation[];
}) {
  const pts = connectorPoints(annotations, c);
  const { d, startSeg, endSeg } = buildRoundedConnector(pts, CORNER_RADIUS);
  const startId = `m-${c.id}-s`;
  const endId = `m-${c.id}-e`;
  return (
    <g fill="none">
      <defs>
        {endpointMarker(startId, c.from.style, c.from.size, c.stroke)}
        {endpointMarker(endId, c.to.style, c.to.size, c.stroke)}
      </defs>
      {d ? (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          overflow="visible"
          width="100%"
          height="100%"
        >
          <path
            d={d}
            stroke={c.stroke}
            strokeWidth={c.width}
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </svg>
      ) : null}
      <line
        x1={pct(startSeg[0].x)}
        y1={pct(startSeg[0].y)}
        x2={pct(startSeg[1].x)}
        y2={pct(startSeg[1].y)}
        stroke={c.stroke}
        strokeWidth={c.width}
        markerStart={c.from.style !== "none" ? `url(#${startId})` : undefined}
      />
      <line
        x1={pct(endSeg[0].x)}
        y1={pct(endSeg[0].y)}
        x2={pct(endSeg[1].x)}
        y2={pct(endSeg[1].y)}
        stroke={c.stroke}
        strokeWidth={c.width}
        markerEnd={c.to.style !== "none" ? `url(#${endId})` : undefined}
      />
      {c.text && c.text.trim() ? (() => {
        const mid = connectorMidpoint(annotations, c);
        return (
          <LabelBox
            rect={labelRectAt(mid.x, mid.y)}
            text={c.text} fontSize={c.fontSize} fontFamily={c.fontFamily}
            color={c.color ?? c.stroke} align={c.align} masked
          />
        );
      })() : null}
    </g>
  );
}

export default function AnnotationLayer({
  annotations,
}: {
  annotations?: Annotation[];
}) {
  if (!annotations || annotations.length === 0) return null;
  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );
  const connectors = annotations.filter(
    (a): a is Connector => a.kind === "connector",
  );

  return (
    <svg
      className="anno-layer"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden
    >
      {surfaces.map((s) => (
        <SurfaceShape key={s.id} s={s} />
      ))}
      {connectors.map((c) => (
        <ConnectorLine key={c.id} c={c} annotations={annotations} />
      ))}
    </svg>
  );
}
