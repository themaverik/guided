/*
 * Per-page watermark overlay. Renders the mark behind the page content but above
 * the page background (z-index 0; .page-inner sits at z-index 1). It is NOT
 * hidden in print. Text marks render large/uppercase in the heading font at the
 * configured opacity; `center` is rotated ~-30° and centered, corners are small
 * and inset ~10mm. An icon (if set) renders instead of the text.
 */
import type { Watermark as WatermarkData } from "@/lib/book-schema";
import { DEFAULT_WATERMARK_OPACITY } from "@/lib/book-schema";

export default function Watermark({
  watermark,
}: {
  watermark?: WatermarkData;
}) {
  if (!watermark?.enabled) return null;
  if (!watermark.text && !watermark.icon) return null;

  const position = watermark.position ?? "center";
  const opacity = watermark.opacity ?? DEFAULT_WATERMARK_OPACITY;

  return (
    <div className={`watermark wm-${position}`} style={{ opacity }} aria-hidden>
      {watermark.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="wm-icon" src={watermark.icon} alt="" />
      ) : (
        <span className="wm-text">{watermark.text}</span>
      )}
    </div>
  );
}
