"use client";

/*
 * Compact popover anchored to the selected annotation (SP2). Reflects the
 * selected shape's color + width + delete, and writes edits through updateAnnotation.
 * Mounted unscaled as a sibling of AnnotationPalette in .editor-right; positioned
 * from the shape's measured screen bounds. Editor-only; hides during an active drag.
 * Nothing prints.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Annotation } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";
import {
  SWATCHES,
  WIDTH_PRESETS,
  swatchByStroke,
  swatchPatch,
  type Swatch,
} from "@/lib/annotation-palette";
import { popoverPlacement, shapeBounds } from "@/lib/annotation-popover";

const POPOVER_GAP = 10;

export default function AnnotationSelectionPopover({
  ci,
  si,
  scalerRef,
  containerRef,
  scrollRef,
  pageIndex,
  annotations,
  selectedId,
  scale,
  fitKey,
}: {
  ci: number;
  si: number;
  scalerRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  annotations: Annotation[];
  selectedId: string | null;
  scale: number;
  fitKey: string;
}) {
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const requestDeleteAnnotation = useEditor((s) => s.requestDeleteAnnotation);
  const bringForward = useEditor((s) => s.bringAnnotationForward);
  const sendBackward = useEditor((s) => s.sendAnnotationBackward);
  const dragging = useEditor((s) => s.annotationDragging);

  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Per-annotation drag offset from the auto-placed position. Editor-only,
  // never persisted to the Book — component state only, reset on step change.
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    base: { dx: number; dy: number };
  } | null>(null);

  useEffect(() => {
    setOffsets({});
  }, [ci, si]);

  const shape = selectedId
    ? annotations.find((a) => a.id === selectedId) ?? null
    : null;

  useLayoutEffect(() => {
    if (!shape || dragging) {
      setPos(null);
      return;
    }
    const measure = () => {
      const pageEl =
        scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
      const container = containerRef.current;
      if (!pageEl || !container) return;
      const pr = pageEl.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      const nb = shapeBounds(shape, annotations);
      const box = {
        x: pr.left - cr.left + nb.x * pr.width,
        y: pr.top - cr.top + nb.y * pr.height,
        w: nb.w * pr.width,
        h: nb.h * pr.height,
      };
      const pop = popRef.current;
      const size = pop
        ? { w: pop.offsetWidth, h: pop.offsetHeight }
        : { w: 240, h: 40 };
      const pl = popoverPlacement(box, size, { w: cr.width, h: cr.height }, POPOVER_GAP);
      const off = offsets[shape.id] ?? { dx: 0, dy: 0 };
      const top = Math.max(
        POPOVER_GAP,
        Math.min(pl.top + off.dy, cr.height - size.h - POPOVER_GAP),
      );
      const left = Math.max(
        POPOVER_GAP,
        Math.min(pl.left + off.dx, cr.width - size.w - POPOVER_GAP),
      );
      setPos({ top, left });
    };
    measure();
    const sc = scrollRef.current;
    sc?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      sc?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [shape, annotations, dragging, scale, fitKey, pageIndex, scalerRef, containerRef, scrollRef, offsets]);

  if (!shape) return null;
  const visible = !!pos && !dragging;

  const activeSwatchId = swatchByStroke(shape.stroke);

  const applySwatch = (sw: Swatch) =>
    updateAnnotation(
      ci,
      si,
      shape.id,
      swatchPatch(sw, shape.kind, shape.kind !== "connector" && shape.fill != null),
    );
  const applyWidth = (value: number) =>
    updateAnnotation(ci, si, shape.id, { width: value });

  const onGripPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: shape.id,
      startX: e.clientX,
      startY: e.clientY,
      base: offsets[shape.id] ?? { dx: 0, dy: 0 },
    };
  };
  const onGripPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOffsets((o) => ({
      ...o,
      [d.id]: { dx: d.base.dx + (e.clientX - d.startX), dy: d.base.dy + (e.clientY - d.startY) },
    }));
  };
  const onGripPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={popRef}
      className="anno-popover"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: visible ? "visible" : "hidden" }}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="anno-popover-row">
        <span
          className="anno-popover-grip"
          role="button"
          aria-label="Move popover"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
        >
          ⠿
        </span>
        {SWATCHES.map((sw) => (
          <button
            key={sw.id}
            type="button"
            className={`ap-swatch${activeSwatchId === sw.id ? " active" : ""}`}
            style={{ background: sw.fill, borderColor: sw.stroke }}
            title={sw.label}
            aria-label={`Color ${sw.label}`}
            aria-pressed={activeSwatchId === sw.id}
            onClick={() => applySwatch(sw)}
          />
        ))}
        <span className="ap-div" />
        {WIDTH_PRESETS.map((w) => (
          <button
            key={w.value}
            type="button"
            className={`ap-width${shape.width === w.value ? " active" : ""}`}
            title={`${w.label} (${w.value})`}
            aria-label={`Width ${w.label}`}
            aria-pressed={shape.width === w.value}
            onClick={() => applyWidth(w.value)}
          >
            <span className="ap-width-bar" style={{ height: w.value }} />
          </button>
        ))}
        <span className="ap-div" />
        <button type="button" className="mini-btn" title="Send backward"
          aria-label="Send backward" onClick={() => sendBackward(ci, si, shape.id)}>⤓</button>
        <button type="button" className="mini-btn" title="Bring forward"
          aria-label="Bring forward" onClick={() => bringForward(ci, si, shape.id)}>⤒</button>
        <span className="ap-div" />
        <button
          type="button"
          className="mini-btn danger"
          title="Delete"
          aria-label="Delete annotation"
          onClick={() => requestDeleteAnnotation(ci, si, shape.id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
