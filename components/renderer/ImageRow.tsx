/*
 * One horizontal band on a step page: the optional row head (title/instruction)
 * plus the image-wrap (slots + callouts). Supports mixed callout placement —
 * each callout resolves to side or below (callout.placement ?? row default), so
 * a row can show a side column AND a below grid at once.
 */
import type { Callout as CalloutData, Chapter } from "@/lib/book-schema";
import {
  type ResolvedRow,
  displayPath,
  imageSrc,
  secondImageName,
} from "@/lib/book-render";
import Callout from "./Callout";
import ImageSlot from "./ImageSlot";
import RichText from "./RichText";

export interface ImageRowProps {
  chapter: Chapter;
  row: ResolvedRow;
  /** Render the row's own title/instruction (multi-row steps only). */
  showHead: boolean;
  /** Base URL for chapter assets, e.g. /api/projects/<slug>/assets. */
  assetBase: string;
}

export default function ImageRow({
  chapter,
  row,
  showHead,
  assetBase,
}: ImageRowProps) {
  const sizeFor = (i: number) => ({
    width: row.imageSizes[i]?.width ?? row.imageWidth,
    height: row.imageSizes[i]?.height ?? row.imageHeight,
    border: row.border,
  });

  // Build the slot(s) for this row's layout.
  let slots: React.ReactNode;
  if (row.layout === "double") {
    const aFile = row.image;
    const bFile = secondImageName(row.image, row.image2);
    slots = (
      <>
        {/* key on the resolved filename so a changed image cleanly remounts the
            leaf and re-probes its URL, instead of reusing stale probe state. */}
        <ImageSlot
          key={`a-${aFile ?? ""}`}
          src={imageSrc(assetBase, chapter.id, aFile)}
          label="Screen A"
          path={displayPath(chapter.id, aFile)}
          {...sizeFor(0)}
        />
        <ImageSlot
          key={`b-${bFile ?? ""}`}
          src={imageSrc(assetBase, chapter.id, bFile)}
          label="Screen B"
          path={displayPath(chapter.id, bFile)}
          {...sizeFor(1)}
        />
      </>
    );
  } else {
    const label = row.layout === "single-wide" ? "Wide screen" : "Screen";
    slots = (
      <ImageSlot
        key={`s-${row.image ?? ""}`}
        src={imageSrc(assetBase, chapter.id, row.image)}
        label={label}
        path={displayPath(chapter.id, row.image)}
        {...sizeFor(0)}
      />
    );
  }

  // Resolve each callout's placement (per-callout override → row default).
  const placementOf = (c: CalloutData) => c.placement ?? row.calloutLayout;
  const side = row.callouts.filter((c) => placementOf(c) === "side");
  const below = row.callouts.filter((c) => placementOf(c) === "below");
  const hasSide = side.length > 0;
  const hasBelow = below.length > 0;

  // side-mode width: clamp to a sane range so it can't overflow the column.
  const sideStyle = (c: CalloutData): React.CSSProperties | undefined =>
    c.widthPct
      ? { maxWidth: `${Math.max(10, Math.min(100, c.widthPct))}%`, alignSelf: "flex-start" }
      : undefined;

  // below-mode width: column span, clamped to the grid's column count.
  const spanStyle = (c: CalloutData): React.CSSProperties | undefined => {
    if (!c.span || c.span <= 1) return undefined;
    const s = Math.min(c.span, row.calloutCols);
    return s > 1 ? { gridColumn: `span ${s}` } : undefined;
  };

  const sideColumn = hasSide ? (
    <div className="callouts">
      {side.map((c, i) => (
        <Callout key={`s${i}`} data={c} style={sideStyle(c)} />
      ))}
    </div>
  ) : null;

  const belowGrid = hasBelow ? (
    <div
      className="callouts-grid"
      style={{ "--callout-cols": row.calloutCols } as React.CSSProperties}
    >
      {below.map((c, i) => (
        <Callout key={`b${i}`} data={c} marker={i + 1} style={spanStyle(c)} />
      ))}
    </div>
  ) : null;

  // Custom gap between the two images of a double row.
  const gapStyle: React.CSSProperties | undefined =
    row.layout === "double" && row.imageGap ? { gap: row.imageGap } : undefined;

  // Choose the wrap structure.
  let wrap: React.ReactNode;
  if (hasSide && hasBelow) {
    // Mixed: a side row on top, the below grid beneath.
    wrap = (
      <div className={`step-image-wrap ${row.layout} mixed-wrap`}>
        <div
          className={`step-image-wrap ${row.layout} callouts-side mixed-top`}
          style={gapStyle}
        >
          {slots}
          {sideColumn}
        </div>
        {belowGrid}
      </div>
    );
  } else if (hasBelow) {
    wrap = (
      <div className={`step-image-wrap ${row.layout} callouts-below`}>
        <div className="step-screens" style={gapStyle}>
          {slots}
        </div>
        {belowGrid}
      </div>
    );
  } else if (hasSide) {
    wrap = (
      <div
        className={`step-image-wrap ${row.layout} callouts-side`}
        style={gapStyle}
      >
        {slots}
        {sideColumn}
      </div>
    );
  } else {
    wrap = (
      <div className={`step-image-wrap ${row.layout}`} style={gapStyle}>
        {slots}
      </div>
    );
  }

  return (
    <div className="step-row">
      {showHead ? (
        <>
          {row.title ? <div className="row-title">{row.title}</div> : null}
          {row.instruction ? (
            <RichText className="row-instruction" as="div" block text={row.instruction} />
          ) : null}
        </>
      ) : null}
      {wrap}
    </div>
  );
}
