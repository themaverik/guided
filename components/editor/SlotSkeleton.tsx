"use client";

/*
 * A 1:1 miniature of a row's page structure: one slot box for single /
 * single-wide, two side-by-side boxes (with an arrow glyph between them when
 * `arrow` is on) for double, plus a callout band — a narrow column to the right
 * for `side`, or a grid beneath split into `cols` columns for `below`.
 */
import type { RowLayout } from "@/lib/book-schema";

export default function SlotSkeleton({
  layout,
  arrow,
  calloutCount,
  calloutLayout,
  calloutCols,
}: {
  layout: RowLayout;
  arrow: boolean;
  calloutCount: number;
  calloutLayout: "side" | "below";
  calloutCols: 1 | 2 | 3;
}) {
  const wide = layout === "single-wide";
  const screens = (
    <div className="skel-screens">
      {layout === "double" ? (
        <>
          <span className="skel-box" />
          {arrow ? <span className="skel-arrow">→</span> : null}
          <span className="skel-box" />
        </>
      ) : (
        <span className={`skel-box${wide ? " wide" : ""}`} />
      )}
    </div>
  );

  if (calloutCount <= 0) {
    return <div className="skel">{screens}</div>;
  }

  const cells = Array.from({ length: calloutCount }, (_, i) => (
    <span className="skel-cell" key={i} />
  ));

  if (calloutLayout === "side") {
    return (
      <div className="skel skel-side">
        {screens}
        <div className="skel-callouts side">{cells}</div>
      </div>
    );
  }

  return (
    <div className="skel skel-below">
      {screens}
      <div
        className="skel-callouts below"
        style={{ "--cols": calloutCols } as React.CSSProperties}
      >
        {cells}
      </div>
    </div>
  );
}
