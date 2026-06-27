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
import {
  FONT_STACKS,
  anchorPoint,
  bracketSegments,
  connectorPoints,
  diamondSegments,
  resolveEndpoint,
  snapPoint,
} from "@/lib/annotations";
import { useEditor } from "@/lib/store";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
type Part = "move" | "resize" | "from" | "to" | "wp";

const surfaceAnchors = (s: Surface): Anchor[] =>
  s.kind === "box" || s.kind === "text"
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
    : s.kind === "diamond"
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

  if (!rect) return null;
  const { w: W, h: H } = rect;
  const focused = annotations.find((a) => a.id === selectedId) ?? null;
  const surfaces = annotations.filter(
    (a): a is Surface => a.kind !== "connector",
  );
  const editTarget =
    surfaces.find((s) => s.id === editingId && s.kind === "text") ?? null;

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

  const apply = (p: { x: number; y: number }, shift = false) => {
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
      } else if (a.kind === "line") {
        // A line points any direction, so allow negative extent (full 360°
        // rotation). Snap to horizontal/vertical; Shift hard-locks the axis.
        let w = p.x - a.x;
        let h = p.y - a.y;
        if (shift) {
          if (Math.abs(w) >= Math.abs(h)) h = 0;
          else w = 0;
        } else {
          const AXIS = 0.04;
          if (Math.abs(h) <= AXIS) h = 0;
          else if (Math.abs(w) <= AXIS) w = 0;
        }
        updateAnnotation(ci, si, d.id, { w, h });
      } else {
        // Box/bracket need a positive extent.
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
    let ep: Endpoint;
    if (snap.ref) {
      ep = { style: cur.style, size: cur.size, ref: snap.ref, anchor: snap.anchor };
    } else {
      // Axis-snap a free endpoint into line with the opposite endpoint, so a
      // perfectly horizontal/vertical connector is easy to make. Holding Shift
      // hard-locks to the dominant axis; otherwise snap within a tolerance.
      const other = resolveEndpoint(annotations, d.part === "from" ? a.to : a.from);
      let x = snap.x;
      let y = snap.y;
      if (shift) {
        if (Math.abs(x - other.x) >= Math.abs(y - other.y)) y = other.y;
        else x = other.x;
      } else {
        const AXIS = 0.04;
        if (Math.abs(y - other.y) <= AXIS) y = other.y;
        else if (Math.abs(x - other.x) <= AXIS) x = other.x;
      }
      ep = { style: cur.style, size: cur.size, x, y };
    }
    updateAnnotation(ci, si, d.id, { [d.part]: ep });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toN(e);
    const shift = e.shiftKey;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(p, shift));
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
      style={{
        position: "absolute",
        left: rect.l,
        top: rect.t,
        pointerEvents: gridMode ? "none" : undefined,
      }}
      width={W}
      height={H}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerDown={(e) => {
        // Click on empty canvas (the SVG itself, not a shape) clears focus.
        if (e.target === svgRef.current) selectAnnotation(null);
      }}
    >
      {/* Transparent hit-areas: click any annotation to focus it. */}
      {annotations.map((a) => {
        const onDown = (e: React.PointerEvent) => {
          e.stopPropagation();
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
                selectAnnotation(a.id);
                setEditingId(a.id);
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
            />
          );
        }
        // bracket — its three segments
        return (
          <g key={`hit-${a.id}`} onPointerDown={onDown}>
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
          s={editTarget}
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
  s,
  W,
  H,
  onChange,
  onDone,
}: {
  s: Surface;
  W: number;
  H: number;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = s.text ?? "";
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
    <foreignObject
      x={s.x * W}
      y={s.y * H}
      width={s.w * W}
      height={s.h * H}
      overflow="visible"
    >
      <div
        ref={ref}
        className="anno-text editing"
        contentEditable
        suppressContentEditableWarning
        style={{
          fontFamily: FONT_STACKS[s.fontFamily ?? "sans"],
          fontSize: s.fontSize ?? 16,
          color: s.color ?? s.stroke,
          textAlign: s.align ?? "left",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        // Persist on every keystroke so the text is never lost if the editor
        // unmounts (e.g. selection clears) before a blur event can fire.
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
