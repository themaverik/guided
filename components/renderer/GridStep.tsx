/*
 * Read-only renderer for a step's flexible grid (Plan 3): rows distribute by
 * heightFr, cells by widthFr (flex-grow), each cell's primary image fills the
 * cell (object-fit: contain). Image cells are overflow-free by construction.
 * Resize, callouts-in-cells, and the fitGrid backstop are later plans.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import { cellPrimaryImage } from "@/lib/grid-render";
import ImageSlot from "./ImageSlot";

export default function GridStep({
  grid,
  chapter,
  assetBase,
}: {
  grid: GridRow[];
  chapter: Chapter;
  assetBase: string;
}) {
  return (
    <div className="grid-step">
      {grid.map((row, ri) => (
        <div className="grid-row" key={ri} style={{ flexGrow: row.heightFr }}>
          {row.cells.map((cell, ci) => {
            const primary = cellPrimaryImage(cell);
            return (
              <div
                className="grid-cell"
                key={ci}
                style={{ flexGrow: cell.widthFr }}
              >
                {primary ? (
                  <ImageSlot
                    key={`${ri}-${ci}-${primary.ref ?? ""}`}
                    src={imageSrc(assetBase, chapter.id, primary.ref)}
                    label="Screen"
                    path={displayPath(chapter.id, primary.ref)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
