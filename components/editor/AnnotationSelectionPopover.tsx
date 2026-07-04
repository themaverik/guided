"use client";

/*
 * Compact popover anchored to the selected annotation (SP2). Reflects the
 * selected shape's color + width + delete, and writes edits through updateAnnotation.
 * Mounted unscaled as a sibling of AnnotationPalette in .editor-right; positioned
 * from the shape's measured screen bounds. Editor-only; hides during an active drag.
 * Nothing prints.
 */
import { useLayoutEffect, useRef, useState } from "react";
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
  const dragging = useEditor((s) => s.annotationDragging);

  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
      setPos({ top: pl.top, left: pl.left });
    };
    measure();
    const sc = scrollRef.current;
    sc?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      sc?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [shape, annotations, dragging, scale, fitKey, pageIndex, scalerRef, containerRef, scrollRef]);

  if (!shape) return null;
  const visible = !!pos && !dragging;

  const activeSwatchId = swatchByStroke(shape.stroke);

  const applySwatch = (sw: Swatch) =>
    updateAnnotation(ci, si, shape.id, swatchPatch(sw, shape.kind));
  const applyWidth = (value: number) =>
    updateAnnotation(ci, si, shape.id, { width: value });

  return (
    <div
      ref={popRef}
      className="anno-popover"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: visible ? "visible" : "hidden" }}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="anno-popover-row">
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
