/*
 * Per-page watermark overlay. Renders the mark behind the page content but above
 * the page background (z-index 0; .page-inner sits at z-index 1). It is NOT
 * hidden in print. Text marks render large/uppercase in the heading font at the
 * configured opacity; `center` is rotated ~-30° and centered, corners are small
 * and inset ~10mm. A logo and text can both show — when both are set, the logo
 * renders as a small icon to the LEFT of the text, in tandem (same row, vertically
 * centered); either one alone is fine too. `opacity` is set once on the outer
 * wrapper, so it applies identically to the icon and the text.
 */
import type { CSSProperties } from "react";
import type { Watermark as WatermarkData } from "@/lib/book-schema";
import {
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_SCALE,
} from "@/lib/book-schema";

export default function Watermark({
  watermark,
}: {
  watermark?: WatermarkData;
}) {
  if (!watermark?.enabled) return null;
  if (!watermark.text && !watermark.icon) return null;

  const position = watermark.position ?? "center";
  const opacity = watermark.opacity ?? DEFAULT_WATERMARK_OPACITY;
  const scale = watermark.scale ?? DEFAULT_WATERMARK_SCALE;
  const style = { opacity, "--wm-scale": scale } as CSSProperties;

  return (
    <div className={`watermark wm-${position}`} style={style} aria-hidden>
      {/* Logo and/or text — when both are set, the logo sits left of the text. */}
      <div className="wm-mark">
        {watermark.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wm-icon" src={watermark.icon} alt="" />
        ) : null}
        {watermark.text ? <span className="wm-text">{watermark.text}</span> : null}
      </div>
    </div>
  );
}
