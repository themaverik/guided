"use client";

/*
 * Compact popover anchored to the selected annotation (SP2). Reflects the
 * selected shape's color + width (+ connector endpoint/routing/direction) and
 * writes edits through updateAnnotation. Mounted unscaled as a sibling of
 * AnnotationPalette in .editor-right; positioned from the shape's measured
 * screen bounds. Editor-only; hides during an active drag. Nothing prints.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { Annotation, Connector, Endpoint, EndpointStyle } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";
import {
  SWATCHES,
  WIDTH_PRESETS,
  swatchByStroke,
  swatchPatch,
  type Swatch,
} from "@/lib/annotation-palette";
import { ENDPOINT_STYLES, ROUTINGS, DIRECTION_OPTIONS } from "@/lib/annotation-options";
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

  if (!shape || dragging || !pos) return null;

  const activeSwatchId = swatchByStroke(shape.stroke);
  const c: Connector | null = shape.kind === "connector" ? (shape as Connector) : null;

  const applySwatch = (sw: Swatch) =>
    updateAnnotation(ci, si, shape.id, swatchPatch(sw, shape.kind));
  const applyWidth = (value: number) =>
    updateAnnotation(ci, si, shape.id, { width: value });
  const setEndpoint = (which: "from" | "to", patch: Partial<Endpoint>) =>
    updateAnnotation(ci, si, shape.id, { [which]: { ...(c as Connector)[which], ...patch } });

  return (
    <div
      ref={popRef}
      className="anno-popover"
      style={{ top: pos.top, left: pos.left }}
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

      {c ? (
        <div className="anno-popover-row">
          <select
            value={c.from.style}
            aria-label="From endpoint style"
            onChange={(e) => setEndpoint("from", { style: e.target.value as EndpointStyle })}
          >
            {ENDPOINT_STYLES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            value={c.to.style}
            aria-label="To endpoint style"
            onChange={(e) => setEndpoint("to", { style: e.target.value as EndpointStyle })}
          >
            {ENDPOINT_STYLES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            value={c.routing ?? "straight"}
            aria-label="Routing"
            onChange={(e) =>
              updateAnnotation(ci, si, c.id, {
                routing: e.target.value as Connector["routing"],
              })
            }
          >
            {ROUTINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {c.routing === "square" ? (
            <select
              value={c.to.dir ?? ""}
              aria-label="Direction"
              onChange={(e) =>
                setEndpoint("to", { dir: (e.target.value || undefined) as Endpoint["dir"] })
              }
            >
              {DIRECTION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
