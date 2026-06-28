"use client";

/*
 * Editor-only overlay (Plan 9): drag grid-cell callouts to absolute positions.
 * Mirrors PreviewAnnotations' pointer-capture drag. Mounted ABOVE PreviewGridSelect
 * so callout drags win over cell-select clicks; its small hit targets cover only
 * callouts, so clicks elsewhere fall through. Never touches the renderer/print path.
 *
 * Coordinates are cell-relative (0–1). Pointer→cell-relative uses the cell's client
 * rect (scale-independent — pointer and rect are both client-space). A press that
 * moves < DRAG_PX is a click (selects the callout); past it, a drag. The first drag
 * of a FLOWED callout detaches it (positioned:true, x/y from pointer, w from its
 * measured width); a floating callout's drag patches x/y, its side handle patches w.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => clamp(n, 0, 1);
const DRAG_PX = 3;          // screen px before a press becomes a drag
const MIN_W = 0.1;          // min floating width (cell-relative)
const DETACH_MIN_W = 0.2;   // floor for width captured on detach

interface Box { l: number; t: number; w: number; h: number }
interface Target {
  ri: number; cellIndex: number; objId: string; positioned: boolean;
  box: Box;                 // callout box, unscaled, relative to scaler (for hit target + handle)
  rel: { x: number; y: number; w: number }; // callout position relative to its cell (0–1)
}

export default function PreviewCellFloat({
  scalerRef, pageIndex, ci, si, grid, fitKey, scale, selectedObjId,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number; si: number;
  grid: GridRow[];
  fitKey: string;
  scale: number;
  selectedObjId: string | null;
}) {
  const selectCellObject = useEditor((s) => s.selectCellObject);
  const updatePlacement = useEditor((s) => s.updateCellObjectPlacement);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const drag = useRef<{
    t: Target; mode: "move" | "resize"; cellRect: DOMRect;
    grabDX: number; grabDY: number; detachW: number;
    started: boolean; startX: number; startY: number; positioned: boolean;
  } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  // Measure each cell + the callout boxes inside it (both flowed and floating).
  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setTargets(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: (r.left - base.left) / scale, t: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const out: Target[] = [];
    [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")].forEach((re, ri) => {
      [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].forEach((ce, cellIndex) => {
        const cellBox = toBox(ce);
        ce.querySelectorAll<HTMLElement>("[data-obj-id]").forEach((el) => {
          const objId = el.dataset.objId!;
          const positioned = el.closest(".grid-cell-floats") != null;
          const box = toBox(el);
          out.push({
            ri, cellIndex, objId, positioned, box,
            rel: {
              x: cellBox.w ? (box.l - cellBox.l) / cellBox.w : 0,
              y: cellBox.h ? (box.t - cellBox.t) / cellBox.h : 0,
              w: cellBox.w ? box.w / cellBox.w : 0.3,
            },
          });
        });
      });
    });
    setTargets(out);
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!targets) return null;

  const cellRectOf = (ri: number, cellIndex: number): DOMRect | null => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    const re = gridEl?.querySelectorAll<HTMLElement>(":scope > .grid-row")[ri];
    const ce = re?.querySelectorAll<HTMLElement>(":scope > .grid-cell")[cellIndex];
    return ce ? ce.getBoundingClientRect() : null;
  };

  const pointerRel = (cellRect: DOMRect, e: { clientX: number; clientY: number }) => ({
    x: clamp01((e.clientX - cellRect.left) / cellRect.width),
    y: clamp01((e.clientY - cellRect.top) / cellRect.height),
  });

  const startDrag = (t: Target, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cellRect = cellRectOf(t.ri, t.cellIndex);
    if (!cellRect) return;
    const p = pointerRel(cellRect, e);
    drag.current = {
      t, mode, cellRect,
      grabDX: p.x - t.rel.x, grabDY: p.y - t.rel.y,
      detachW: clamp(t.rel.w, DETACH_MIN_W, 1),
      started: mode === "resize", startX: e.clientX, startY: e.clientY,
      positioned: t.positioned,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const apply = (e: { clientX: number; clientY: number }) => {
    const d = drag.current;
    if (!d) return;
    const p = pointerRel(d.cellRect, e);
    if (d.mode === "resize") {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { w: clamp(p.x - d.t.rel.x, MIN_W, 1) });
      return;
    }
    const x = clamp01(p.x - d.grabDX);
    const y = clamp01(p.y - d.grabDY);
    if (!d.positioned) {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { positioned: true, x, y, w: d.detachW });
      d.positioned = true; // subsequent moves only patch x/y
    } else {
      updatePlacement(ci, si, d.t.ri, d.t.cellIndex, d.t.objId, { x, y });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_PX) return;
      d.started = true;
    }
    const ev = { clientX: e.clientX, clientY: e.clientY };
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(ev));
  };

  const onUp = (t: Target) => (e: React.PointerEvent) => {
    const d = drag.current;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (d && !d.started) selectCellObject(ci, si, t.ri, t.cellIndex, t.objId); // a click, not a drag
    drag.current = null;
  };

  return (
    <div className="preview-cell-float" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {targets.map((t) => {
        const isSel = selectedObjId === t.objId;
        return (
          <div key={`${t.ri}-${t.cellIndex}-${t.objId}`}>
            <div
              className={`cell-float-hit${t.positioned ? " floating" : ""}${isSel ? " selected" : ""}`}
              style={{ position: "absolute", left: t.box.l, top: t.box.t, width: t.box.w, height: t.box.h, pointerEvents: "all" }}
              onPointerDown={startDrag(t, "move")}
              onPointerMove={onMove}
              onPointerUp={onUp(t)}
            />
            {isSel && t.positioned ? (
              <div
                className="cell-float-resize"
                style={{ position: "absolute", left: t.box.l + t.box.w - 6, top: t.box.t + t.box.h / 2 - 6, pointerEvents: "all" }}
                onPointerDown={startDrag(t, "resize")}
                onPointerMove={onMove}
                onPointerUp={onUp(t)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
