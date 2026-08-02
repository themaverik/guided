/*
 * Server-side sanitation of client-supplied Book JSON (book PUT / project
 * POST). The renderer injects pageTextColor values into inline CSS custom
 * properties and derives page geometry from pageConfig, so both are clamped
 * here at the trust boundary. Pure and immutable — returns new objects.
 */
import type { Book, Chapter, PageConfig } from "./book-schema";
import { DEFAULT_PAGE_CONFIG } from "./book-schema";
import { clampPageMm } from "./grid-math";

const PAGE_SIZES: ReadonlyArray<PageConfig["size"]> = [
  "A4",
  "Letter",
  "A5",
  "Legal",
  "Custom",
];

/** Max sane mm value for margins/header/footer (same ceiling as page dims). */
const MAX_MM = 2000;

// Hex, a bare color keyword, or a color function with a safe character set.
// No semicolons, quotes, url(), var() — blocks CSS injection via style attrs.
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|[a-z]{3,25}|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.,%\s/-]{1,60}\))$/i;

export function isSafeCssColor(v: unknown): v is string {
  return typeof v === "string" && COLOR_RE.test(v);
}

const mm = (v: unknown, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_MM, n));
};

/** Clamp an untrusted pageConfig into a valid one; undefined if not an object. */
export function clampPageConfig(cfg: unknown): PageConfig | undefined {
  if (cfg === null || typeof cfg !== "object") return undefined;
  const c = cfg as Partial<PageConfig>;
  const d = DEFAULT_PAGE_CONFIG;
  const m = (c.margins ?? {}) as Partial<PageConfig["margins"]>;
  const out: PageConfig = {
    size: PAGE_SIZES.includes(c.size as PageConfig["size"])
      ? (c.size as PageConfig["size"])
      : d.size,
    orientation: c.orientation === "landscape" ? "landscape" : "portrait",
    margins: {
      top: mm(m.top, d.margins.top),
      right: mm(m.right, d.margins.right),
      bottom: mm(m.bottom, d.margins.bottom),
      left: mm(m.left, d.margins.left),
    },
    headerH: mm(c.headerH, d.headerH),
    footerH: mm(c.footerH, d.footerH),
  };
  if (c.custom && typeof c.custom === "object") {
    out.custom = {
      w: clampPageMm(Number(c.custom.w)),
      h: clampPageMm(Number(c.custom.h)),
    };
  }
  return out;
}

const safeColor = (v: string | undefined): string | undefined =>
  isSafeCssColor(v) ? v : undefined;

/** Return a copy of the book with unsafe colors dropped and pageConfig clamped. */
export function sanitizeBookInput(book: Book): Book {
  const chapters: Chapter[] = (Array.isArray(book.chapters) ? book.chapters : [])
    .filter((ch): ch is Chapter => ch !== null && typeof ch === "object")
    .map((ch) =>
      ch.pageTextColor === undefined
        ? ch
        : { ...ch, pageTextColor: safeColor(ch.pageTextColor) },
    );
  const out: Book = { ...book, chapters };
  if (out.pageTextColor !== undefined) out.pageTextColor = safeColor(out.pageTextColor);
  if (out.coverTextColor !== undefined) out.coverTextColor = safeColor(out.coverTextColor);
  if (out.ending?.pageTextColor !== undefined) {
    out.ending = { ...out.ending, pageTextColor: safeColor(out.ending.pageTextColor) };
  }
  if (out.pageConfig !== undefined) out.pageConfig = clampPageConfig(out.pageConfig);
  return out;
}
