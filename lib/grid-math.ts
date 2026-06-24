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

/**
 * Move `delta` across the divider between `dividerIndex` and `dividerIndex+1`.
 * Both sides are floored at `minSize`; the pair's total is conserved, so all
 * other entries are untouched. Returns a new array.
 */
export function resizeAdjacent(
  sizes: number[],
  dividerIndex: number,
  delta: number,
  minSize: number,
): number[] {
  const i = dividerIndex;
  const j = dividerIndex + 1;
  if (i < 0 || j >= sizes.length) return sizes.slice();
  const pairTotal = sizes[i] + sizes[j];
  const lo = minSize;
  const hi = pairTotal - minSize;
  const newI = Math.min(Math.max(sizes[i] + delta, lo), hi);
  const out = sizes.slice();
  out[i] = newI;
  out[j] = pairTotal - newI;
  return out;
}

/** Scale weights so they sum to 1; equal-split if every weight is 0. */
export function normalizeFractions(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / sum);
}

/**
 * Set `sizes[index]` toward `target` and absorb the change across the OTHER
 * entries proportional to their current size (flexbox `fr` behavior), each
 * floored at `minSize`, conserving Σ. `target` is clamped so the others can
 * all stay ≥ minSize. Returns a new array.
 */
export function redistributeProportional(
  sizes: number[],
  index: number,
  target: number,
  minSize: number,
): number[] {
  const n = sizes.length;
  const total = sizes.reduce((a, b) => a + b, 0);
  const maxTarget = total - (n - 1) * minSize;
  const clamped = Math.min(Math.max(target, minSize), maxTarget);
  const result = sizes.slice();
  result[index] = clamped;

  const others = sizes.map((_, i) => i).filter((i) => i !== index);
  let pool = total - clamped;
  const pinned = new Set<number>();

  // Water-fill: pin any entry whose proportional share falls below the floor,
  // re-distribute the rest. Guaranteed to resolve because clamp ensures
  // pool >= (n-1)*minSize.
  for (let guard = 0; guard <= n; guard++) {
    const free = others.filter((i) => !pinned.has(i));
    const freeBase = free.reduce((a, i) => a + sizes[i], 0) || 1;
    const poolForFree = pool - pinned.size * minSize;
    let pinnedThisPass = false;
    for (const i of free) {
      if ((sizes[i] / freeBase) * poolForFree < minSize) {
        pinned.add(i);
        pinnedThisPass = true;
      }
    }
    if (!pinnedThisPass) {
      for (const i of free) result[i] = (sizes[i] / freeBase) * poolForFree;
      for (const i of pinned) result[i] = minSize;
      break;
    }
  }
  return result;
}
