/** Page geometry → CSS custom properties for the .book root. mm strings. */
import type { CSSProperties } from "react";
import type { PageConfig } from "./book-schema";
import { LEGACY_PAGE_CONFIG } from "./book-schema";
import { pageDimensions } from "./grid-math";

export function pageVars(cfg: PageConfig | undefined): CSSProperties {
  const c = cfg ?? LEGACY_PAGE_CONFIG;
  const { w, h } = pageDimensions(c);
  // Margins are uniform in the UI today; the left value drives --page-margin.
  const vars: Record<string, string> = {
    "--page-w": `${w}mm`,
    "--page-h": `${h}mm`,
    "--page-margin": `${c.margins.left}mm`,
    "--page-header-h": `${c.headerH}mm`,
    "--page-footer-h": `${c.footerH}mm`,
  };
  return vars as CSSProperties;
}
