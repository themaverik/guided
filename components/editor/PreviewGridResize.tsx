"use client";

/*
 * Editor-only overlay that draws draggable row/column divider handles over a
 * grid-mode step in the live preview. Modelled on PreviewAnnotations: it
 * measures the rendered .grid-step boxes, captures pointer drags, and writes
 * fr deltas to the store (rAF-throttled). The SVG is pointer-events:none except
 * on the divider hit-areas, so it never steals annotation interactions. Nothing
 * here touches the renderer/print path.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { GridRow, PageConfig } from "@/lib/book-schema";
import { bodyRegion } from "@/lib/grid-math";
import { useEditor } from "@/lib/store";

interface Box { l: number; t: number; w: number; h: number }
interface Geom { box: Box; rows: Box[]; cells: Box[][] }

type Drag =
  | { kind: "row"; index: number; startClient: number; spanFr: number; spanPx: number; startFrI: number; lastFr: number }
  | { kind: "col"; ri: number; index: number; startClient: number; spanFr: number; spanPx: number; startFrI: number; lastFr: number };

export default function PreviewGridResize({
  scalerRef, pageIndex, ci, si, grid, pageConfig, fitKey, scale,
}: {
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  ci: number;
  si: number;
  grid: GridRow[];
  pageConfig: PageConfig;
  fitKey: string;
  scale: number;
}) {
  const resizeRow = useEditor((s) => s.resizeGridRow);
  const resizeCol = useEditor((s) => s.resizeGridColumn);
  const addRow = useEditor((s) => s.addGridRow);
  const removeRow = useEditor((s) => s.removeGridRow);
  const addCol = useEditor((s) => s.addGridColumn);
  const removeCol = useEditor((s) => s.removeGridColumn);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const raf = useRef<number | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);

  // Measure the .grid-step + row/cell boxes in unscaled coords relative to the scaler.
  useLayoutEffect(() => {
    const scaler = scalerRef.current;
    const page = scaler?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    const gridEl = page?.querySelector<HTMLElement>(".grid-step");
    if (!scaler || !gridEl) { setGeom(null); return; }
    const base = scaler.getBoundingClientRect();
    const toBox = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return {
        l: (r.left - base.left) / scale,
        t: (r.top - base.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      };
    };
    const rowEls = [...gridEl.querySelectorAll<HTMLElement>(":scope > .grid-row")];
    setGeom({
      box: toBox(gridEl),
      rows: rowEls.map(toBox),
      cells: rowEls.map((re) => [...re.querySelectorAll<HTMLElement>(":scope > .grid-cell")].map(toBox)),
    });
  }, [scalerRef, pageIndex, fitKey, scale, grid]);

  if (!geom) return null;
  const { box, rows, cells } = geom;
  const body = bodyRegion(pageConfig);

  const startRow = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const spanPx = rows[index].h + rows[index + 1].h;
    const spanFr = grid[index].heightFr + grid[index + 1].heightFr;
    drag.current = { kind: "row", index, startClient: e.clientY, spanFr, spanPx, startFrI: grid[index].heightFr, lastFr: 0 };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const startCol = (ri: number, index: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const spanPx = cells[ri][index].w + cells[ri][index + 1].w;
    const spanFr = grid[ri].cells[index].widthFr + grid[ri].cells[index + 1].widthFr;
    drag.current = { kind: "col", ri, index, startClient: e.clientX, spanFr, spanPx, startFrI: grid[ri].cells[index].widthFr, lastFr: 0 };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const apply = (clientPos: number) => {
    const d = drag.current;
    if (!d) return;
    // unscaled px moved → fraction of the pair → fr delta (total from drag start).
    // Apply it INCREMENTALLY (delta since the last applied frame): resizeAdjacent
    // adds the delta to the CURRENT track size, so re-sending the running total
    // each frame would compound it against the already-moved divider (exponential).
    const movedPx = (clientPos - d.startClient) / scale;
    const deltaFr = (movedPx / d.spanPx) * d.spanFr;
    const inc = deltaFr - d.lastFr;
    d.lastFr = deltaFr;
    if (d.kind === "row") resizeRow(ci, si, d.index, inc);
    else resizeCol(ci, si, d.ri, d.index, inc);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const pos = d.kind === "row" ? e.clientY : e.clientX;
    // Live mm readout: the two resulting track sizes, from the current delta.
    const baseRect = svgRef.current?.getBoundingClientRect();
    if (baseRect) {
      const mmTotal = d.kind === "row" ? body.h : body.w;
      const movedPx = (pos - d.startClient) / scale;
      const deltaFr = (movedPx / d.spanPx) * d.spanFr;
      // Absolute split from the divider's START fraction (not the live, moving
      // one) so the readout tracks the pointer instead of double-counting.
      const aFr = Math.max(0, Math.min(d.spanFr, d.startFrI + deltaFr));
      const bFr = d.spanFr - aFr;
      setReadout({
        x: (e.clientX - baseRect.left) / scale + 8,
        y: (e.clientY - baseRect.top) / scale - 8,
        text: `${(aFr * mmTotal).toFixed(0)} / ${(bFr * mmTotal).toFixed(0)} mm`,
      });
    }
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(pos));
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
    setReadout(null);
  };

  return (
    <svg
      ref={svgRef}
      className="preview-grid-resize"
      style={{ position: "absolute", left: box.l, top: box.t }}
      width={box.w}
      height={box.h}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >

      {/* Row dividers: between row i and i+1, at the gap midpoint. */}
      {rows.slice(0, -1).map((r, i) => {
        const y = r.t - box.t + r.h + (rows[i + 1].t - (r.t + r.h)) / 2;
        return (
          <g key={`row-${i}`}>
            <line x1={0} y1={y} x2={box.w} y2={y} className="grid-guide-line" />
            <line
              x1={0} y1={y} x2={box.w} y2={y}
              className="grid-divider grid-divider-row"
              onPointerDown={startRow(i)}
            />
          </g>
        );
      })}
      {/* Column dividers: within each row, between cell j and j+1. */}
      {cells.map((rowCells, ri) =>
        rowCells.slice(0, -1).map((c, j) => {
          const x = c.l - box.l + c.w + (rowCells[j + 1].l - (c.l + c.w)) / 2;
          const yTop = rows[ri].t - box.t;
          return (
            <g key={`col-${ri}-${j}`}>
              <line x1={x} y1={yTop} x2={x} y2={yTop + rows[ri].h} className="grid-guide-line" />
              <line
                x1={x} y1={yTop} x2={x} y2={yTop + rows[ri].h}
                className="grid-divider grid-divider-col"
                onPointerDown={startCol(ri, j)}
              />
            </g>
          );
        }),
      )}
      {/* Add-row (bottom edge) + add-column (each row's right edge). */}
      <CanvasBtn x={box.w / 2} y={box.h - 2} label="+" title="Add row" onTap={() => addRow(ci, si)} />
      {rows.map((r, ri) => (
        <CanvasBtn
          key={`addcol-${ri}`}
          x={box.w - 2}
          y={r.t - box.t + r.h / 2}
          label="+"
          title="Add column"
          onTap={() => addCol(ci, si, ri)}
        />
      ))}
      {/* Remove-row (left edge) + remove-cell (each cell top-right). */}
      {rows.length > 1
        ? rows.map((r, ri) => (
            <CanvasBtn
              key={`delrow-${ri}`}
              x={10}
              y={r.t - box.t + 10}
              label="×"
              title="Remove row"
              danger
              onTap={() => removeRow(ci, si, ri)}
            />
          ))
        : null}
      {cells.map((rowCells, ri) =>
        rowCells.length > 1
          ? rowCells.map((c, j) => (
              <CanvasBtn
                key={`delcell-${ri}-${j}`}
                x={c.l - box.l + c.w - 10}
                y={c.t - box.t + 10}
                label="×"
                title="Remove column"
                danger
                onTap={() => removeCol(ci, si, ri, j)}
              />
            ))
          : null,
      )}
      {readout ? (
        <text x={readout.x} y={readout.y} className="grid-readout">{readout.text}</text>
      ) : null}
    </svg>
  );
}

function CanvasBtn({
  x, y, label, title, danger, onTap,
}: {
  x: number; y: number; label: string; title: string; danger?: boolean; onTap: () => void;
}) {
  return (
    <g
      className={`grid-canvas-btn${danger ? " danger" : ""}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTap(); }}
    >
      <title>{title}</title>
      <circle cx={x} cy={y} r={9} />
      <text x={x} y={y + 3.5} textAnchor="middle">{label}</text>
    </g>
  );
}
