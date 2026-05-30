"use client";

/*
 * Interactive handle overlay for page-level annotations, positioned over the
 * selected step's page inside the scaled preview. The shapes are drawn by the
 * renderer's AnnotationLayer; this layer adds draggable handles for the focused
 * annotation (move/resize surfaces, drag connector endpoints with snapping) and
 * writes changes to the store. Pointer-capture on the SVG makes the drag robust;
 * updates are throttled to one per animation frame.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type {
  Anchor,
  Annotation,
  Connector,
  Endpoint,
  Surface,
} from "@/lib/book-schema";
import { anchorPoint, resolveEndpoint, snapPoint } from "@/lib/annotations";
import { useEditor } from "@/lib/store";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
type Part = "move" | "resize" | "from" | "to" | "wp";

const surfaceAnchors = (s: Surface): Anchor[] =>
  s.kind === "box"
    ? [
        "center",
        "top",
        "bottom",
        "left",
        "right",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]
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
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  annotations: Annotation[];
  fitKey: string;
  scale: number;
  selectedId: string | null;
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    part: Part;
    grabX: number;
    grabY: number;
    wp?: number;
  } | null>(null);
  const raf = useRef<number | null>(null);
  const [, force] = useState(0);
  const [rect, setRect] = useState<{ l: number; t: number; w: number; h: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    if (!el) {
      setRect(null);
      return;
    }
    setRect({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }, [scalerRef, pageIndex, fitKey, scale]);

  if (!rect) return null;
  const { w: W, h: H } = rect;
  const focused = annotations.find((a) => a.id === selectedId) ?? null;
  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );

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
    drag.current = { id, part, grabX, grabY };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const startWp = (id: string, wp: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, part: "wp", grabX: 0, grabY: 0, wp };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const apply = (p: { x: number; y: number }) => {
    const d = drag.current;
    if (!d) return;
    const a = annotations.find((x) => x.id === d.id);
    if (!a) return;
    if (a.kind !== "connector") {
      if (d.part === "move") {
        updateAnnotation(ci, si, d.id, {
          x: clamp01(p.x - d.grabX),
          y: clamp01(p.y - d.grabY),
        });
      } else {
        updateAnnotation(ci, si, d.id, {
          w: Math.max(0.01, p.x - a.x),
          h: Math.max(0.005, p.y - a.y),
        });
      }
      return;
    }
    if (d.part === "wp" && d.wp != null) {
      const wps = [...(a.waypoints ?? [])];
      wps[d.wp] = { x: p.x, y: p.y };
      updateAnnotation(ci, si, d.id, { waypoints: wps });
      return;
    }
    const snap = snapPoint(surfaces, p, 0.025);
    const cur = d.part === "from" ? a.from : a.to;
    const ep: Endpoint = {
      style: cur.style,
      size: cur.size,
      ...(snap.ref ? { ref: snap.ref, anchor: snap.anchor } : { x: snap.x, y: snap.y }),
    };
    updateAnnotation(ci, si, d.id, { [d.part]: ep });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toN(e);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(p));
  };

  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
    force((n) => n + 1);
  };

  const showSnap = focused?.kind === "connector";

  return (
    <svg
      ref={svgRef}
      className="preview-anno"
      style={{ position: "absolute", left: rect.l, top: rect.t }}
      width={W}
      height={H}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
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
            {(focused as Connector).waypoints?.map((wp, i) => (
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
          </>
        ) : (
          <>
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
    </svg>
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
