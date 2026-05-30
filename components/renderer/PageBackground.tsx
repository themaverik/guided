/*
 * Full-page background image, rendered behind everything (z-index -1, below the
 * watermark and content but above the page color). Prints. Renders nothing when
 * no image is set.
 */
import type { Background } from "@/lib/book-schema";

export default function PageBackground({
  background,
}: {
  background?: Background;
}) {
  if (!background?.image) return null;
  const opacity = background.opacity ?? 1;
  return (
    <div
      className="page-bg"
      aria-hidden
      style={{ backgroundImage: `url(${background.image})`, opacity }}
    />
  );
}
