/** Pure page/body geometry + conserved-total grid resize. All sizes in mm. */
import type { PageConfig } from "./book-schema";

const PAGE_MM: Record<Exclude<PageConfig["size"], "Custom">, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
  A5: { w: 148, h: 210 },
  Legal: { w: 215.9, h: 355.6 },
};

/** Page dimensions in mm, with landscape orientation applied. */
export function pageDimensions(cfg: PageConfig): { w: number; h: number } {
  const base =
    cfg.size === "Custom"
      ? { w: cfg.custom?.w ?? 210, h: cfg.custom?.h ?? 297 }
      : PAGE_MM[cfg.size];
  return cfg.orientation === "landscape" ? { w: base.h, h: base.w } : { ...base };
}

export interface BodyRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The content body region (mm) — excludes margins, header, and footer. */
export function bodyRegion(cfg: PageConfig): BodyRegion {
  const { w, h } = pageDimensions(cfg);
  const { top, right, bottom, left } = cfg.margins;
  return {
    x: left,
    y: top + cfg.headerH,
    w: w - left - right,
    h: h - top - bottom - cfg.headerH - cfg.footerH,
  };
}
