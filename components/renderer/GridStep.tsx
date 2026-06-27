/*
 * Renderer for a step's flexible grid (Plans 3, 6, 9): rows distribute by
 * heightFr, cells by widthFr (flex-grow). Each cell renders a FLOW layer
 * (.grid-cell-content — image + docked callouts, the only layer fitGrid scales)
 * and, when present, an absolute FLOATING layer (.grid-cell-floats) of callouts
 * positioned x/y/w (cell-relative). Print-safe: positions are document data.
 */
import type { Chapter, GridRow } from "@/lib/book-schema";
import { displayPath, imageSrc } from "@/lib/book-render";
import { flowObjects, floatingCallouts } from "@/lib/grid-render";
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
          {row.cells.map((cell, ci) => {
            const flow = flowObjects(cell);
            const floats = floatingCallouts(cell);
            return (
              <div className="grid-cell" key={ci} style={{ flexGrow: cell.widthFr }}>
                <div className="grid-cell-content">
                  {flow.map((obj) => {
                    if (obj.kind === "image") {
                      // An image object with no file is an empty cell — render
                      // nothing (the editor's dashed guide already marks it)
                      // rather than the "Screen" drop-target placeholder.
                      if (!obj.ref) return null;
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
                      return <Callout key={obj.id} data={obj.callout} domId={obj.id} />;
                    }
                    return null; // text objects: Plan 10
                  })}
                </div>
                {floats.length > 0 ? (
                  <div className="grid-cell-floats">
                    {floats.map((obj) =>
                      obj.callout ? (
                        <div
                          key={obj.id}
                          className="grid-cell-float"
                          data-obj-id={obj.id}
                          style={{
                            left: `${obj.x * 100}%`,
                            top: `${obj.y * 100}%`,
                            width: `${obj.w * 100}%`,
                          }}
                        >
                          <Callout data={obj.callout} />
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
