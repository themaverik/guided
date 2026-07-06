"use client";

/*
 * Interactive handle overlay for page-level annotations, positioned over the
 * selected step's page inside the scaled preview. The shapes are drawn by the
 * renderer's AnnotationLayer; this layer adds draggable handles for the focused
 * annotation (move/resize surfaces, drag connector endpoints with snapping) and
 * writes changes to the store. Pointer-capture on the SVG makes the drag robust;
 * updates are throttled to one per animation frame.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  Anchor,
  Annotation,
  Connector,
  Endpoint,
  Surface,
} from "@/lib/book-schema";
import { DEFAULT_TEXT_SIZE } from "@/lib/book-schema";
import {
  FONT_STACKS,
  anchorPoint,
  bendForDrag,
  bracketSegments,
  connectorPoints,
  connectorRoute,
  diamondSegments,
  labelRect,
  labelRectAt,
  connectorMidpoint,
  nearestPoint,
  rectAnchors,
  resolveEndpoint,
  snapAlign,
  snapAxisVector,
  snapDistribute,
  snapPoint,
  squareBaseRoute,
  compassDir,
  hitStack,
  nextInStack,
} from "@/lib/annotations";
import type { DistGuide, GuideLine, Point, Rect } from "@/lib/annotations";
import { useEditor } from "@/lib/store";
import { useAnnotationDraw } from "./use-annotation-draw";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
type Part = "move" | "resize" | "from" | "to" | "wp" | "seg" | "dir";

/** Screen-space snap radius (px) for alignment; converted to normalized per axis. */
const SNAP_PX = 6;
/** Screen-px stem length of the endpoint direction knob. */
const KNOB_PX = 24;
/** Screen-space snap radius (px) for connector-endpoint → grid-content anchors. */
const POINT_SNAP_PX = 8;

/** Alignment snap targets in normalized page coords: other rectangular surfaces
 *  (excluding the dragged one), the measured grid cells + primary image slots, and
 *  the page itself. Measured once at drag-start (targets are static during a drag). */
function collectSnapTargets(
  pageEl: HTMLElement,
  annotations: Annotation[],
  excludeId: string,
): Rect[] {
  const pr = pageEl.getBoundingClientRect();
  const norm = (b: DOMRect): Rect => ({
    x: (b.left - pr.left) / pr.width,
    y: (b.top - pr.top) / pr.height,
    w: b.width / pr.width,
    h: b.height / pr.height,
  });
  const rects: Rect[] = [{ x: 0, y: 0, w: 1, h: 1 }]; // the page
  for (const an of annotations) {
    if (an.id === excludeId) continue;
    if (an.kind === "box" || an.kind === "diamond" || an.kind === "text" || an.kind === "bracket" || an.kind === "ellipse") {
      rects.push({ x: an.x, y: an.y, w: an.w, h: an.h });
    }
  }
  pageEl.querySelectorAll<HTMLElement>(".grid-cell, .img-slot").forEach((el) => {
    rects.push(norm(el.getBoundingClientRect()));
  });
  return rects;
}

const surfaceAnchors = (s: Surface): Anchor[] =>
  s.kind === "box" || s.kind === "text"
    ? [
        "center", "top", "bottom", "left", "right",
        "top-left", "top-right", "bottom-left", "bottom-right",
      ]
    : s.kind === "diamond" || s.kind === "ellipse"
      ? ["center", "top", "bottom", "left", "right"]
      : ["start", "mid", "end"];

export default function PreviewAnnotations({
  scalerRef,
  pageIndex,
  ci,
  si,
  annotations,
  fitKey,
  scale,
  selectedId,
  gridMode = false,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  annotations: Annotation[];
  fitKey: string;
  scale: number;
  selectedId: string | null;
  /** In grid mode the SVG goes pointer-events:none on its EMPTY area so clicks
   *  fall through to the grid overlays beneath; annotation shapes/handles keep
   *  their own pointer-events and stay interactive. */
  gridMode?: boolean;
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const setAnnotationDragging = useEditor((s) => s.setAnnotationDragging);
  const svgRef = useRef<SVGSVGElement>(null);
  const draw = useAnnotationDraw(ci, si);
  const drag = useRef<{
    id: string;
    part: Part;
    grabX: number;
    grabY: number;
    wp?: number;
    baseSeg?: number;
    axis?: "h" | "v";
    targets?: Rect[];
    sibs?: Rect[];
    which?: "from" | "to";
  } | null>(null);
  const raf = useRef<number | null>(null);
  const [, force] = useState(0);
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);
  const [activeDistGuides, setActiveDistGuides] = useState<DistGuide[]>([]);
  const [gridAnchors, setGridAnchors] = useState<Point[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rect, setRect] = useState<{ l: number; t: number; w: number; h: number } | null>(
    null,
  );

  // Leaving a step / deselecting ends any in-progress text edit.
  useEffect(() => {
    if (editingId && editingId !== selectedId) setEditingId(null);
  }, [editingId, selectedId]);

  useLayoutEffect(() => {
    const el = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    if (!el) {
      setRect(null);
      return;
    }
    setRect({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }, [scalerRef, pageIndex, fitKey, scale]);

  // Grid-content anchor points (cells, screenshots, callouts, text) for the
  // focused connector's endpoint snapping + snap dots. DOM-measured, editor-only.
  useLayoutEffect(() => {
    const focusedAnno = annotations.find((a) => a.id === selectedId);
    const el = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    if (focusedAnno?.kind !== "connector" || !el) {
      setGridAnchors([]);
      return;
    }
    const pr = el.getBoundingClientRect();
    if (!pr.width || !pr.height) {
      setGridAnchors([]);
      return;
    }
    const anchors: Point[] = [];
    el.querySelectorAll<HTMLElement>(".grid-cell, .img-slot, .callout, .grid-text").forEach(
      (node) => {
        const b = node.getBoundingClientRect();
        const r: Rect = {
          x: (b.left - pr.left) / pr.width,
          y: (b.top - pr.top) / pr.height,
          w: b.width / pr.width,
          h: b.height / pr.height,
        };
        anchors.push(...rectAnchors(r));
      },
    );
    setGridAnchors(anchors);
  }, [scalerRef, pageIndex, fitKey, scale, selectedId, annotations]);

  if (!rect) return null;
  const { w: W, h: H } = rect;
  const focused = annotations.find((a) => a.id === selectedId) ?? null;
  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );
  const editTarget = annotations.find((a) => a.id === editingId) ?? null;

  const toN = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  };

  const startDrag = (id: string, part: Part) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const a = annotations.find((x) => x.id === id);
    let grabX = 0;
    let grabY = 0;
    if (part === "move" && a && a.kind !== "connector") {
      const p = toN(e);
      grabX = p.x - a.x;
      grabY = p.y - a.y;
    }
    let targets: Rect[] | undefined;
    let sibs: Rect[] | undefined;
    if (part === "move" || part === "resize") {
      const pageEl = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
      if (pageEl) targets = collectSnapTargets(pageEl, annotations, id);
    }
    if (part === "move") {
      sibs = annotations
        .filter(
          (an) =>
            an.id !== id &&
            (an.kind === "box" || an.kind === "diamond" || an.kind === "ellipse" ||
              an.kind === "text" || an.kind === "bracket"),
        )
        .map((an) => { const s = an as Surface; return { x: s.x, y: s.y, w: s.w, h: s.h }; });
    }
    drag.current = { id, part, grabX, grabY, targets, sibs };
    setAnnotationDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const startWp = (id: string, wp: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, part: "wp", grabX: 0, grabY: 0, wp };
    setAnnotationDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const startSeg =
    (id: string, baseSeg: number, axis: "h" | "v") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { id, part: "seg", grabX: 0, grabY: 0, baseSeg, axis };
      setAnnotationDragging(true);
      svgRef.current?.setPointerCapture(e.pointerId);
    };

  const startDirDrag =
    (id: string, which: "from" | "to") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { id, part: "dir", grabX: 0, grabY: 0, which };
      setAnnotationDragging(true);
      svgRef.current?.setPointerCapture(e.pointerId);
    };

  const apply = (p: { x: number; y: number }, shift = false, alt = false) => {
    const d = drag.current;
    if (!d) return;
    const a = annotations.find((x) => x.id === d.id);
    if (!a) return;
    const thrX = SNAP_PX / (W * scale);
    const thrY = SNAP_PX / (H * scale);
    if (a.kind !== "connector") {
      if (d.part === "move") {
        let x = clamp01(p.x - d.grabX);
        let y = clamp01(p.y - d.grabY);
        let guides: GuideLine[] = [];
        let dguides: DistGuide[] = [];
        if (!alt && a.kind !== "line") {
          if (d.targets) {
            const s = snapAlign({ x, y, w: a.w, h: a.h }, d.targets, thrX, thrY, "move");
            x = clamp01(x + s.dx);
            y = clamp01(y + s.dy);
            guides = s.guides;
          }
          if (d.sibs) {
            const alignedX = guides.some((g) => g.axis === "x");
            const alignedY = guides.some((g) => g.axis === "y");
            const dist = snapDistribute(
              { x, y, w: a.w, h: a.h }, d.sibs, alignedX ? 0 : thrX, alignedY ? 0 : thrY,
            );
            x = clamp01(x + dist.dx);
            y = clamp01(y + dist.dy);
            dguides = dist.guides;
          }
        }
        setActiveGuides(guides);
        setActiveDistGuides(dguides);
        updateAnnotation(ci, si, d.id, { x, y });
      } else if (a.kind === "line") {
        setActiveGuides([]);
        setActiveDistGuides([]);
        // A line points any direction, so allow negative extent (full 360°
        // rotation). Snap to horizontal/vertical within a small angle; Shift
        // hard-locks the dominant axis.
        const { dx: w, dy: h } = snapAxisVector(p.x - a.x, p.y - a.y, shift);
        updateAnnotation(ci, si, d.id, { w, h });
      } else {
        let w = Math.max(0.01, p.x - a.x);
        let h = Math.max(0.005, p.y - a.y);
        let guides: GuideLine[] = [];
        if (!alt && d.targets) {
          const s = snapAlign({ x: a.x, y: a.y, w, h }, d.targets, thrX, thrY, "resize");
          w = Math.max(0.01, w + s.dx);
          h = Math.max(0.005, h + s.dy);
          guides = s.guides;
        }
        setActiveGuides(guides);
        setActiveDistGuides([]);
        updateAnnotation(ci, si, d.id, { w, h });
      }
      return;
    }
    if (d.part === "seg" && d.baseSeg != null && d.axis) {
      const base = squareBaseRoute(annotations, a);
      const nb = bendForDrag(base, d.baseSeg, d.axis, p);
      const merged = (a.bends ?? []).filter((bd) => bd.seg !== d.baseSeg);
      if (nb) merged.push(nb);
      updateAnnotation(ci, si, d.id, { bends: merged.length ? merged : undefined });
      return;
    }
    if (d.part === "wp" && d.wp != null) {
      const wps = [...(a.waypoints ?? [])];
      wps[d.wp] = { x: p.x, y: p.y };
      updateAnnotation(ci, si, d.id, { waypoints: wps });
      return;
    }
    if (d.part === "dir" && d.which) {
      const curEp = a[d.which];
      const ep0 = resolveEndpoint(annotations, curEp);
      const dir = compassDir(p.x - ep0.x, p.y - ep0.y);
      updateAnnotation(ci, si, d.id, { [d.which]: { ...curEp, dir } });
      return;
    }
    const cur = d.part === "from" ? a.from : a.to;
    let ep: Endpoint;
    if (alt) {
      ep = { style: cur.style, size: cur.size, x: p.x, y: p.y };
    } else {
      const snap = snapPoint(surfaces, p, 0.025);
      if (snap.ref) {
        ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
      } else {
        const gp = nearestPoint(p, gridAnchors, POINT_SNAP_PX / (W * scale));
        if (gp) {
          // Snap to a grid-content anchor (cell/screenshot/callout/text) as a
          // free point — snap-and-stay, no binding.
          ep = { style: cur.style, size: cur.size, x: gp.x, y: gp.y };
        } else {
          // Axis-snap a free endpoint into line with the opposite endpoint, so a
          // perfectly horizontal/vertical connector is easy to make. The snap is
          // angle-based (Shift hard-locks the dominant axis), so a shallow angle
          // holds at any connector length.
          const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
          const { dx, dy } = snapAxisVector(snap.x - other.x, snap.y - other.y, shift);
          ep = { style: cur.style, size: cur.size, x: other.x + dx, y: other.y + dy };
        }
      }
    }
    updateAnnotation(ci, si, d.id, { [d.part]: ep });
  };

  const onMove = (e: React.PointerEvent) => {
    if (draw.drawing()) {
      draw.move(toN(e));
      return;
    }
    if (!drag.current) return;
    const p = toN(e);
    const shift = e.shiftKey;
    const alt = e.altKey;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(p, shift, alt));
  };

  const onUp = (e: React.PointerEvent) => {
    if (draw.drawing()) {
      draw.end(toN(e));
      svgRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    drag.current = null;
    setAnnotationDragging(false);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
    setActiveGuides([]);
    setActiveDistGuides([]);
    force((n) => n + 1);
  };

  const startTextEdit = (id: string) => {
    selectAnnotation(id);
    setEditingId(id);
  };

  const showSnap = focused?.kind === "connector";

  const fc = focused?.kind === "connector" ? (focused as Connector) : null;
  const fcWps = fc?.waypoints ?? [];
  const fcHasBends = !!fc?.bends?.length;
  // Use segment handles only when the connector is actually using the bends/auto
  // route. A square connector that still carries legacy waypoints (and no bends)
  // is rendered via the passThrough path, so keep the waypoint diamond handles.
  const segHandleMode = fc?.routing === "square" && !(fcWps.length > 0 && !fcHasBends);

  return (
    <svg
      ref={svgRef}
      className="preview-anno"
      style={{
        position: "absolute",
        left: rect.l,
        top: rect.t,
        pointerEvents: gridMode && draw.activeTool === "select" ? "none" : undefined,
        cursor: draw.activeTool !== "select" ? "crosshair" : undefined,
      }}
      width={W}
      height={H}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerDown={(e) => {
        if (draw.activeTool !== "select" && e.target === svgRef.current) {
          e.preventDefault();
          if (draw.begin(toN(e))) svgRef.current?.setPointerCapture(e.pointerId);
          return;
        }
        // Click on empty canvas (the SVG itself, not a shape) clears focus.
        if (e.target === svgRef.current) selectAnnotation(null);
      }}
    >
      {activeGuides.map((g, i) =>
        g.axis === "x" ? (
          <line key={`guide-${i}`} x1={g.at * W} y1={0} x2={g.at * W} y2={H} className="preview-anno-guide" />
        ) : (
          <line key={`guide-${i}`} x1={0} y1={g.at * H} x2={W} y2={g.at * H} className="preview-anno-guide" />
        ),
      )}
      {activeDistGuides.map((g, i) =>
        g.axis === "x" ? (
          <g key={`dg-${i}`} className="preview-anno-distguide">
            <line x1={g.from * W} y1={g.at * H} x2={g.to * W} y2={g.at * H} />
            <line x1={g.from * W} y1={g.at * H - 4} x2={g.from * W} y2={g.at * H + 4} />
            <line x1={g.to * W} y1={g.at * H - 4} x2={g.to * W} y2={g.at * H + 4} />
          </g>
        ) : (
          <g key={`dg-${i}`} className="preview-anno-distguide">
            <line x1={g.at * W} y1={g.from * H} x2={g.at * W} y2={g.to * H} />
            <line x1={g.at * W - 4} y1={g.from * H} x2={g.at * W + 4} y2={g.from * H} />
            <line x1={g.at * W - 4} y1={g.to * H} x2={g.at * W + 4} y2={g.to * H} />
          </g>
        ),
      )}
      {draw.preview ? (
        draw.preview.kind === "rect" ? (
          <rect
            x={draw.preview.x * W}
            y={draw.preview.y * H}
            width={draw.preview.w * W}
            height={draw.preview.h * H}
            className="preview-anno-draft"
          />
        ) : (
          <line
            x1={draw.preview.x1 * W}
            y1={draw.preview.y1 * H}
            x2={draw.preview.x2 * W}
            y2={draw.preview.y2 * H}
            className="preview-anno-draft"
          />
        )
      ) : null}
      {/* Transparent hit-areas: click any annotation to focus it. */}
      {annotations.map((a) => {
        const onDown = (e: React.PointerEvent) => {
          e.stopPropagation();
          if (e.altKey) {
            const next = nextInStack(hitStack(annotations, toN(e)), selectedId);
            if (next) {
              selectAnnotation(next);
              return;
            }
          }
          selectAnnotation(a.id);
        };
        if (a.kind === "connector") {
          const pts = connectorPoints(annotations, a)
            .map((q) => `${q.x * W},${q.y * H}`)
            .join(" ");
          return (
            <polyline
              key={`hit-${a.id}`}
              points={pts}
              fill="none"
              className="preview-anno-hit"
              strokeWidth={14}
              pointerEvents="stroke"
              onPointerDown={onDown}
              onDoubleClick={() => startTextEdit(a.id)}
            />
          );
        }
        if (a.kind === "box") {
          return (
            <rect
              key={`hit-${a.id}`}
              x={a.x * W}
              y={a.y * H}
              width={a.w * W}
              height={a.h * H}
              className="preview-anno-hit"
              pointerEvents="all"
              onPointerDown={onDown}
              onDoubleClick={() => startTextEdit(a.id)}
            />
          );
        }
        if (a.kind === "ellipse") {
          return (
            <ellipse
              key={`hit-${a.id}`}
              cx={(a.x + a.w / 2) * W}
              cy={(a.y + a.h / 2) * H}
              rx={(a.w / 2) * W}
              ry={(a.h / 2) * H}
              className="preview-anno-hit"
              pointerEvents="all"
              onPointerDown={onDown}
              onDoubleClick={() => startTextEdit(a.id)}
            />
          );
        }
        if (a.kind === "text") {
          // Double-click anywhere in the box starts inline text editing.
          return (
            <rect
              key={`hit-${a.id}`}
              x={a.x * W}
              y={a.y * H}
              width={a.w * W}
              height={a.h * H}
              className="preview-anno-hit"
              pointerEvents="all"
              onPointerDown={onDown}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startTextEdit(a.id);
              }}
            />
          );
        }
        if (a.kind === "line") {
          return (
            <line
              key={`hit-${a.id}`}
              x1={a.x * W}
              y1={a.y * H}
              x2={(a.x + a.w) * W}
              y2={(a.y + a.h) * H}
              className="preview-anno-hit"
              strokeWidth={14}
              pointerEvents="stroke"
              onPointerDown={onDown}
              onDoubleClick={() => startTextEdit(a.id)}
            />
          );
        }
        if (a.kind === "diamond") {
          const pts = diamondSegments(a)
            .map(([x1, y1]) => `${x1 * W},${y1 * H}`)
            .join(" ");
          return (
            <polygon
              key={`hit-${a.id}`}
              points={pts}
              className="preview-anno-hit"
              pointerEvents="all"
              onPointerDown={onDown}
              onDoubleClick={() => startTextEdit(a.id)}
            />
          );
        }
        // bracket — its three segments
        return (
          <g key={`hit-${a.id}`} onPointerDown={onDown} onDoubleClick={() => startTextEdit(a.id)}>
            {bracketSegments(a).map(([x1, y1, x2, y2], i) => (
              <line
                key={i}
                x1={x1 * W}
                y1={y1 * H}
                x2={x2 * W}
                y2={y2 * H}
                className="preview-anno-hit"
                strokeWidth={14}
                pointerEvents="stroke"
              />
            ))}
          </g>
        );
      })}
      {showSnap
        ? surfaces.flatMap((s) =>
            surfaceAnchors(s).map((an) => {
              const ap = anchorPoint(s, an);
              return (
                <circle
                  key={`${s.id}-${an}`}
                  cx={ap.x * W}
                  cy={ap.y * H}
                  r={3.5}
                  className="preview-anno-snap"
                />
              );
            }),
          )
        : null}
      {showSnap
        ? gridAnchors.map((gp, i) => (
            <circle
              key={`grid-snap-${i}`}
              cx={gp.x * W}
              cy={gp.y * H}
              r={3.5}
              className="preview-anno-snap"
            />
          ))
        : null}
      {focused ? (
        focused.kind === "connector" ? (
          <>
            <Handle
              pt={resolveEndpoint(annotations, (focused as Connector).from)}
              W={W}
              H={H}
              onDown={startDrag(focused.id, "from")}
            />
            <Handle
              pt={resolveEndpoint(annotations, (focused as Connector).to)}
              W={W}
              H={H}
              onDown={startDrag(focused.id, "to")}
            />
            {segHandleMode
              ? (() => {
                  const route = connectorRoute(annotations, focused as Connector);
                  return route.segments.map((m, i) => {
                    if (!m.draggable) return null;
                    const p1 = route.points[i];
                    const p2 = route.points[i + 1];
                    const ax: "h" | "v" =
                      Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "h" : "v";
                    const mx = ((p1.x + p2.x) / 2) * W;
                    const my = ((p1.y + p2.y) / 2) * H;
                    return (
                      <rect
                        key={`seg-${i}`}
                        x={mx - 5}
                        y={my - 5}
                        width={10}
                        height={10}
                        rx={2}
                        className={`preview-anno-seg ${ax}`}
                        onPointerDown={startSeg(focused.id, m.baseSeg, ax)}
                      />
                    );
                  });
                })()
              : (focused as Connector).waypoints?.map((wp, i) => (
                  <rect
                    key={i}
                    x={wp.x * W - 5}
                    y={wp.y * H - 5}
                    width={10}
                    height={10}
                    transform={`rotate(45 ${wp.x * W} ${wp.y * H})`}
                    className="preview-anno-wp"
                    onPointerDown={startWp(focused.id, i)}
                  />
                ))}
            {(focused as Connector).routing === "square"
              ? (() => {
                  const pts = connectorRoute(annotations, focused as Connector).points;
                  return (["from", "to"] as const).map((which) => {
                    const ep = resolveEndpoint(annotations, (focused as Connector)[which]);
                    const [pA, pB] =
                      which === "from"
                        ? [pts[0], pts[1]]
                        : [pts[pts.length - 2], pts[pts.length - 1]];
                    const dx = pA && pB ? pB.x - pA.x : 0;
                    const dy = pA && pB ? pB.y - pA.y : 0;
                    const ux = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
                    const uy = ux === 0 ? Math.sign(dy) : 0;
                    if (ux === 0 && uy === 0) return null; // no derivable direction
                    const ex = ep.x * W;
                    const ey = ep.y * H;
                    const kx = ex + ux * KNOB_PX;
                    const ky = ey + uy * KNOB_PX;
                    return (
                      <g key={`dir-${which}`}>
                        <line
                          x1={ex}
                          y1={ey}
                          x2={kx}
                          y2={ky}
                          className="preview-anno-dir-stem"
                        />
                        <circle
                          cx={kx}
                          cy={ky}
                          r={5}
                          className="preview-anno-dir"
                          onPointerDown={startDirDrag(focused.id, which)}
                        />
                      </g>
                    );
                  });
                })()
              : null}
          </>
        ) : editingId === focused.id ? null : (
          <>
            {focused.kind === "text" ? (
              <rect
                x={focused.x * W}
                y={focused.y * H}
                width={focused.w * W}
                height={focused.h * H}
                className="preview-anno-textframe"
                pointerEvents="none"
              />
            ) : null}
            <Handle
              pt={{ x: focused.x + focused.w / 2, y: focused.y + focused.h / 2 }}
              W={W}
              H={H}
              onDown={startDrag(focused.id, "move")}
              kind="move"
            />
            <Handle
              pt={{ x: focused.x + focused.w, y: focused.y + focused.h }}
              W={W}
              H={H}
              onDown={startDrag(focused.id, "resize")}
              kind="resize"
            />
          </>
        )
      ) : null}
      {editTarget ? (
        <TextEditor
          a={editTarget}
          annotations={annotations}
          W={W}
          H={H}
          onChange={(text) => updateAnnotation(ci, si, editTarget.id, { text })}
          onDone={() => setEditingId(null)}
        />
      ) : null}
    </svg>
  );
}

/** Inline contentEditable overlay for editing a text annotation's content. */
function TextEditor({
  a,
  annotations,
  W,
  H,
  onChange,
  onDone,
}: {
  a: Annotation;
  annotations: Annotation[];
  W: number;
  H: number;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const r =
    a.kind === "connector"
      ? labelRectAt(connectorMidpoint(annotations, a).x, connectorMidpoint(annotations, a).y)
      : labelRect(a as Surface);
  const centered = a.kind !== "text";
  const justify =
    a.align === "left" ? "flex-start" : a.align === "right" ? "flex-end" : "center";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = a.text ?? "";
    el.focus();
    // Place the caret at the end of the existing text.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Run once on mount for this editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <foreignObject x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} overflow="visible">
      <div
        className={`anno-editwrap${centered ? " centered" : ""}`}
        style={centered ? { justifyContent: justify } : undefined}
      >
        <div
          ref={ref}
          className="anno-text editing"
          contentEditable
          suppressContentEditableWarning
          style={{
            fontFamily: FONT_STACKS[a.fontFamily ?? "sans"],
            fontSize: a.fontSize ?? DEFAULT_TEXT_SIZE,
            color: a.color ?? a.stroke,
            textAlign: a.align ?? (centered ? "center" : "left"),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onInput={(e) => onChange(e.currentTarget.textContent ?? "")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            onChange(e.currentTarget.textContent ?? "");
            onDone();
          }}
        />
      </div>
    </foreignObject>
  );
}

function Handle({
  pt,
  W,
  H,
  onDown,
  kind,
}: {
  pt: { x: number; y: number };
  W: number;
  H: number;
  onDown: (e: React.PointerEvent) => void;
  kind?: "move" | "resize";
}) {
  return (
    <circle
      cx={pt.x * W}
      cy={pt.y * H}
      r={kind === "resize" ? 5 : 6}
      className={`preview-anno-handle${kind ? ` ${kind}` : ""}`}
      onPointerDown={onDown}
    />
  );
}
