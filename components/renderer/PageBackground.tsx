/*
 * Full-page background image, rendered behind everything (z-index -1, below the
 * watermark and content but above the page color). Prints. Renders nothing when
 * no image is set. An <img> (not a CSS background-image) so `fit` can use
 * `object-fit: scale-down` for "shrink" — background-size has no never-upscale
 * keyword.
 */
import type { Background, BackgroundFit } from "@/lib/book-schema";
import { DEFAULT_BACKGROUND_FIT } from "@/lib/book-schema";

const OBJECT_FIT: Record<BackgroundFit, "cover" | "contain" | "fill" | "scale-down"> = {
  auto: "cover",
  crop: "cover",
  shrink: "scale-down",
  fit: "contain",
  stretch: "fill",
};

export default function PageBackground({
  background,
}: {
  background?: Background;
}) {
  if (!background?.image) return null;
  const opacity = background.opacity ?? 1;
  const fit = background.fit ?? DEFAULT_BACKGROUND_FIT;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="page-bg"
      aria-hidden
      alt=""
      src={background.image}
      style={{ opacity, objectFit: OBJECT_FIT[fit] }}
    />
  );
}
