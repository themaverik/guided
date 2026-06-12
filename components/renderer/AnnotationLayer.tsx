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
} from "@/lib/book-schema";
import { MARKER_PX, bracketSegments, connectorPoints, pct } from "@/lib/annotations";

function SurfaceShape({ s }: { s: Surface }) {
  const common = {
    stroke: s.stroke,
    strokeWidth: s.width,
    fill: "none" as const,
  };
  if (s.kind === "box") {
    return (
      <rect
        x={pct(s.x)}
        y={pct(s.y)}
        width={pct(s.w)}
        height={pct(s.h)}
        rx={2}
        {...common}
        fill={s.fill ?? "none"}
      />
    );
  }
  if (s.kind === "line") {
    return (
      <line
        x1={pct(s.x)}
        y1={pct(s.y)}
        x2={pct(s.x + s.w)}
        y2={pct(s.y + s.h)}
        {...common}
      />
    );
  }
  return (
    <g {...common}>
      {bracketSegments(s).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={pct(x1)} y1={pct(y1)} x2={pct(x2)} y2={pct(y2)} />
      ))}
    </g>
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
  const r = s * 0.26;
  const dot = s * 0.2;
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
          <path d={`M0,0 L${s},${s / 2} L0,${s} z`} fill={color} />
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
      const dd = s * 0.34;
      const cx = s / 2;
      const cy = s / 2;
      return (
        <marker {...common} refX={cx} refY={cy}>
          <path
            d={`M${cx},${cy - dd} L${cx + dd},${cy} L${cx},${cy + dd} L${cx - dd},${cy} z`}
            fill="#ffffff"
            stroke={color}
            strokeWidth={1.5}
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
          <line x1={s / 2} y1={0} x2={s / 2} y2={s} stroke={color} strokeWidth={1.5} />
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
  const last = pts.length - 2;
  const startId = `m-${c.id}-s`;
  const endId = `m-${c.id}-e`;
  return (
    <g fill="none">
      <defs>
        {endpointMarker(startId, c.from.style, c.from.size, c.stroke)}
        {endpointMarker(endId, c.to.style, c.to.size, c.stroke)}
      </defs>
      {pts.slice(0, -1).map((p, i) => (
        <line
          key={i}
          x1={pct(p.x)}
          y1={pct(p.y)}
          x2={pct(pts[i + 1].x)}
          y2={pct(pts[i + 1].y)}
          stroke={c.stroke}
          strokeWidth={c.width}
          markerStart={
            i === 0 && c.from.style !== "none" ? `url(#${startId})` : undefined
          }
          markerEnd={
            i === last && c.to.style !== "none" ? `url(#${endId})` : undefined
          }
        />
      ))}
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
