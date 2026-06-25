"use client";

/* Left-panel grid editor: per-step row count + per-row column counts, with
 * +/- steppers. Calls the grid structure store actions. Shown only in grid mode. */
import type { GridRow } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

export default function GridStructure({ ci, si, grid }: { ci: number; si: number; grid: GridRow[] }) {
  const addRow = useEditor((s) => s.addGridRow);
  const removeRow = useEditor((s) => s.removeGridRow);
  const addCol = useEditor((s) => s.addGridColumn);
  const removeCol = useEditor((s) => s.removeGridColumn);

  return (
    <section className="editor-section">
      <h3 className="editor-subtitle">Grid</h3>

      <div className="grid-struct-row-head">
        <span>Rows: {grid.length}</span>
        <div className="mini-btns">
          <button
            className="mini-btn danger"
            onClick={() => removeRow(ci, si, grid.length - 1)}
            disabled={grid.length <= 1}
            aria-label="Remove last row"
          >
            −
          </button>
          <button className="mini-btn" onClick={() => addRow(ci, si)} aria-label="Add row">
            +
          </button>
        </div>
      </div>

      {grid.map((row, ri) => (
        <div className="grid-struct-cell-row" key={ri}>
          <span>Row {ri + 1} columns: {row.cells.length}</span>
          <div className="mini-btns">
            <button
              className="mini-btn danger"
              onClick={() => removeCol(ci, si, ri, row.cells.length - 1)}
              disabled={row.cells.length <= 1}
              aria-label={`Remove column from row ${ri + 1}`}
            >
              −
            </button>
            <button
              className="mini-btn"
              onClick={() => addCol(ci, si, ri)}
              aria-label={`Add column to row ${ri + 1}`}
            >
              +
            </button>
          </div>
        </div>
      ))}

      <p className="editor-help">Drag the dividers on the page to resize rows and columns.</p>
    </section>
  );
}
