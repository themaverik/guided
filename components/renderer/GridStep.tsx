/*
 * Renderer for a step's flexible grid (Plan 3 + Plan 6): rows distribute by
 * heightFr, cells by widthFr (flex-grow). Each cell renders its object stack —
 * images via ImageSlot (with fit mode), callouts via Callout — top to bottom.
 * Editor-free + print-safe; auto-shrink (fitGrid) is a later plan.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import Callout from "./Callout";
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
          {row.cells.map((cell, ci) => (
            <div className="grid-cell" key={ci} style={{ flexGrow: cell.widthFr }}>
              <div className="grid-cell-content">
                {cell.objects.map((obj) => {
                  if (obj.kind === "image") {
                    return (
                      <ImageSlot
                        key={obj.id}
                        src={imageSrc(assetBase, chapter.id, obj.ref)}
                        label="Screen"
                        path={displayPath(chapter.id, obj.ref)}
                        fit={obj.fit}
                      />
                    );
                  }
                  if (obj.kind === "callout" && obj.callout) {
                    return <Callout key={obj.id} data={obj.callout} />;
                  }
                  return null; // text objects: Plan 10
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
