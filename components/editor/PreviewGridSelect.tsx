"use client";

/*
 * Editor-only overlay: a transparent click target over each grid cell, plus a
 * highlight on the selected cell. Measures cell boxes like PreviewGridResize
 * (unscaled, relative to the scaler). Mounted BELOW PreviewAnnotations and
 * PreviewGridResize so their handles/dividers take precedence; cell-interior
 * clicks fall through to here. Never touches the renderer/print path.
 */
import { useLayoutEffect, useState } from "react";
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

interface Box { l: number; t: number; w: number; h: number }

export default function PreviewGridSelect({
  scalerRef, pageIndex, ci, si, grid, fitKey, scale, selected,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  grid: GridRow[];
  fitKey: string;
  scale: number;
  selected: { ri: number; cellIndex: number } | null;
}) {
  const selectCell = useEditor((s) => s.selectCell);
  const [cells, setCells] = useState<{ ri: number; cidx: number; box: Box }[] | null>(null);

  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setCells(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: (r.left - base.left) / scale, t: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const out: { ri: number; cidx: number; box: Box }[] = [];
    [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")].forEach((re, ri) => {
      [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].forEach((ce, cidx) => {
        out.push({ ri, cidx, box: toBox(ce) });
      });
    });
    setCells(out);
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!cells) return null;

  return (
    <div className="preview-grid-select" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {cells.map(({ ri, cidx, box }) => {
        const isSel = selected?.ri === ri && selected?.cellIndex === cidx;
        return (
          <button
            key={`${ri}-${cidx}`}
            type="button"
            className={`grid-cell-select${isSel ? " selected" : ""}`}
            style={{ position: "absolute", left: box.l, top: box.t, width: box.w, height: box.h, pointerEvents: "all" }}
            onClick={(e) => { e.stopPropagation(); selectCell(ci, si, ri, cidx); }}
            aria-label={`Select cell ${ri + 1}.${cidx + 1}`}
          />
        );
      })}
    </div>
  );
}
