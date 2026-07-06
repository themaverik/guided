/**
 * Pure helpers shared by the renderer components. Path composition and the
 * row-shape normalization that lets one <ImageRow> handle both authoring forms
 * (legacy single-image step fields, and explicit `images: ImageRow[]` rows).
 */
import type { CSSProperties } from "react";
import {
  type Annotation,
  type Book,
  type Border,
  type Chapter,
  type ImageRow,
  type RowLayout,
  type Step,
  type Theme,
  resolveLayout,
} from "./book-schema";

/**
 * Browser URL for a chapter image. Assets are served per-project from
 * `<assetBase>/<chapterId>/<file>` (assetBase = /api/projects/<slug>/assets).
 */
export function imageSrc(
  assetBase: string,
  chapterId: string,
  file?: string,
): string | undefined {
  if (!file) return undefined;
  return `${assetBase}/${chapterId}/${file}`;
}

/** Human-readable expected path shown in the placeholder (authoring hint). */
export function displayPath(chapterId: string, file?: string): string {
  return `public/${chapterId}/${file ?? ""}`;
}

/** Folder (under a project's assets) where watermark logos are stored. */
export const WATERMARK_ASSET_FOLDER = "_watermark";

/**
 * Browser URL for the watermark logo. The icon is stored as a bare filename so
 * it stays portable across download/re-import (it resolves against whatever
 * project is currently serving it, like chapter images). Legacy values that
 * were saved as a full `/api/projects/<oldslug>/assets/_watermark/<file>` URL
 * are re-homed to the current project; any other absolute/external URL is left
 * untouched.
 */
export function watermarkIconSrc(
  assetBase: string,
  icon?: string,
): string | undefined {
  if (!icon) return undefined;
  const legacy = icon.match(/(?:^|\/)_watermark\/([^/]+)$/);
  if (legacy) return `${assetBase}/${WATERMARK_ASSET_FOLDER}/${legacy[1]}`;
  if (icon.includes("/")) return icon; // some other absolute/external URL
  return `${assetBase}/${WATERMARK_ASSET_FOLDER}/${icon}`;
}

/** Folder (under a project's assets) where the page background image is stored. */
export const BACKGROUND_ASSET_FOLDER = "_background";

/**
 * Browser URL for the page background image. Stored as a bare filename so it
 * stays portable across download/re-import (resolves against whichever project
 * is currently serving it, same fix as `watermarkIconSrc`). Legacy values saved
 * as a full `/api/projects/<oldslug>/assets/_background/<file>` URL are re-homed
 * to the current project; any other absolute/external URL is left untouched.
 */
export function backgroundImageSrc(
  assetBase: string,
  image?: string,
): string | undefined {
  if (!image) return undefined;
  const legacy = image.match(/(?:^|\/)_background\/([^/]+)$/);
  if (legacy) return `${assetBase}/${BACKGROUND_ASSET_FOLDER}/${legacy[1]}`;
  if (image.includes("/")) return image; // some other absolute/external URL
  return `${assetBase}/${BACKGROUND_ASSET_FOLDER}/${image}`;
}

/**
 * The second slot's filename for a `double` row. Prefer an explicit `image2`
 * (the model's recommended field); otherwise derive it from the `-2`-before-
 * extension convention used by the prototype (`01-double.jpg` → `01-double-2.jpg`).
 */
export function secondImageName(
  image?: string,
  image2?: string,
): string | undefined {
  if (image2) return image2;
  if (!image) return undefined;
  const dot = image.lastIndexOf(".");
  return dot > -1 ? `${image.slice(0, dot)}-2${image.slice(dot)}` : `${image}-2`;
}

/**
 * A row ready to render. Normalizes a legacy single-image Step or an explicit
 * ImageRow into one shape, with the layout already resolved.
 */
export interface ResolvedRow {
  layout: RowLayout;
  image?: string;
  image2?: string;
  arrow: boolean;
  border: Border;
  title?: string;
  instruction?: string;
  callouts: NonNullable<ImageRow["callouts"]>;
  calloutLayout: "side" | "below";
  calloutCols: 1 | 2 | 3;
  imageWidth?: string;
  imageHeight?: string;
  imageGap?: string;
  imageSizes: NonNullable<ImageRow["imageSizes"]>;
  annotations: Annotation[];
}

function normalize(src: ImageRow | Step): ResolvedRow {
  const callouts = src.callouts ?? [];
  return {
    layout: resolveLayout(src.layout, src.image),
    image: src.image,
    image2: src.image2,
    arrow: src.arrow === true,
    border: src.border ?? true, // default true; may be a BorderStyle object
    title: src.title,
    instruction: src.instruction,
    callouts,
    calloutLayout: src.calloutLayout === "below" ? "below" : "side",
    calloutCols: src.calloutCols ?? 2,
    annotations: src.annotations ?? [],
    imageWidth: src.imageWidth,
    imageHeight: src.imageHeight,
    imageGap: src.imageGap,
    imageSizes: src.imageSizes ?? [],
  };
}

/**
 * Resolve a step into its rows plus whether each row should render its own
 * head (title/instruction). Multi-row steps render per-row heads; a legacy
 * single-image step suppresses the row head (those live at the step level).
 */
export function resolveStepRows(step: Step): {
  rows: ResolvedRow[];
  showRowHead: boolean;
} {
  const hasRows = Array.isArray(step.images) && step.images.length > 0;
  if (hasRows) {
    return { rows: step.images!.map(normalize), showRowHead: true };
  }
  return { rows: [normalize(step)], showRowHead: false };
}

/** Page-number map for TOC + chapter intros (cover/TOC is page 1). */
export interface ChapterPaging {
  introPage: number;
  firstStepPage: number;
  lastStepPage: number;
}

export function computePaging(book: Book): ChapterPaging[] {
  let page = 2; // page 1 = cover/TOC; first chapter intro starts at 2
  return book.chapters.map((ch: Chapter) => {
    const introPage = page;
    const firstStepPage = introPage + 1;
    const lastStepPage = firstStepPage + Math.max(0, ch.steps.length - 1);
    page = introPage + 1 + ch.steps.length;
    return { introPage, firstStepPage, lastStepPage };
  });
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Build the CSS custom properties for a Book.theme, to set on the `.book` root.
 * Renderer selectors read these via `var(--th-<section>-<prop>, <default>)`, so
 * unset sections fall back to the pixel-accurate defaults. `family` is a CSS
 * font-family value, used as-is.
 */
export function themeVars(theme: Theme | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  if (!theme) return vars as CSSProperties;
  for (const [section, font] of Object.entries(theme)) {
    if (!font) continue;
    if (font.family) vars[`--th-${section}-family`] = font.family;
    if (font.size) vars[`--th-${section}-size`] = font.size;
    if (font.color) vars[`--th-${section}-color`] = font.color;
  }
  return vars as CSSProperties;
}

/** Total page count: cover + (intro + steps) per chapter + back cover. */
export function totalPages(book: Book): number {
  const steps = book.chapters.reduce((a, c) => a + c.steps.length, 0);
  return 1 + book.chapters.length + steps + 1;
}

/**
 * Zero-based DOM page index for a selection (cover = 0). A null stepIndex maps
 * to the chapter intro page; otherwise to the step page.
 */
export function selectionPageIndex(
  book: Book,
  chapterIndex: number,
  stepIndex: number | null,
): number {
  const paging = computePaging(book);
  const cp = paging[chapterIndex];
  if (!cp) return 0;
  if (stepIndex == null) return cp.introPage - 1; // 1-based → 0-based
  return cp.firstStepPage - 1 + stepIndex;
}

/**
 * Cheap stable signature of the book's content. Used as the auto-fit dependency
 * key so the layout pass re-runs whenever any field that affects layout changes.
 */
export function bookFitKey(book: Book): string {
  const json = JSON.stringify(book);
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = (h * 33) ^ json.charCodeAt(i);
  }
  return `${json.length}:${(h >>> 0).toString(36)}`;
}
