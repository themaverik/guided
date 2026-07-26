"use client";

/*
 * Editor-only overlay: move + resize handles for the chapter's freely-placed
 * cover image, shown over the chapter-intro preview page. Mirrors
 * PreviewAnnotations' pointer-capture drag and normalized (0-1) coordinate
 * mapping against the measured `.page` rect; persists through the
 * setChapterCoverImage store action. Mounted only when the chapter-intro
 * page is selected (stepIndex == null) and a coverImage exists — never
 * rendered in print (editor tree only, not imported by components/renderer).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChapterCoverImage } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Sensible floor (normalized) so a resize can't invert or vanish the rect. */
const MIN_SIZE = 0.05;

type Part = "move" | "resize";

export default function PreviewChapterImage({
  ci,
  coverImage,
  scalerRef,
  pageIndex,
  scale,
}: {
  ci: number;
  coverImage: ChapterCoverImage;
  scalerRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  scale: number;
}) {
  const setChapterCoverImage = useEditor((s) => s.setChapterCoverImage);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ part: Part; grabX: number; grabY: number } | null>(null);
  const raf = useRef<number | null>(null);
  const [rect, setRect] = useState<{ l: number; t: number; w: number; h: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = scalerRef.current?.querySelectorAll<HTMLElement>(".page")[pageIndex];
    if (!el) {
      setRect(null);
      return;
    }
    setRect({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    // `coverImage` is a fresh object on every book mutation (the store deep-clones
    // on write), so keying off it re-measures after any change — page-size edits
    // included — the same way the annotation overlays key off a whole-book fitKey.
  }, [scalerRef, pageIndex, scale, coverImage]);

  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  if (!rect) return null;
  const { w: W, h: H } = rect;

  const toN = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  };

  const startDrag = (part: Part) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = toN(e);
    drag.current = {
      part,
      grabX: part === "move" ? p.x - coverImage.x : 0,
      grabY: part === "move" ? p.y - coverImage.y : 0,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const apply = (p: { x: number; y: number }) => {
    const d = drag.current;
    if (!d) return;
    if (d.part === "move") {
      const x = clamp01(p.x - d.grabX);
      const y = clamp01(p.y - d.grabY);
      setChapterCoverImage(ci, { x, y });
    } else {
      // p is already clamp01'd, so w/h are implicitly capped at 1 - x / 1 - y —
      // the rect can't grow past the page's right/bottom edge.
      const w = Math.max(MIN_SIZE, p.x - coverImage.x);
      const h = Math.max(MIN_SIZE, p.y - coverImage.y);
      setChapterCoverImage(ci, { w, h });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toN(e);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(p));
  };

  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <svg
      ref={svgRef}
      className="preview-chapter-image"
      style={{ position: "absolute", left: rect.l, top: rect.t }}
      width={W}
      height={H}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <circle
        cx={(coverImage.x + coverImage.w / 2) * W}
        cy={(coverImage.y + coverImage.h / 2) * H}
        r={6}
        className="preview-anno-handle move"
        onPointerDown={startDrag("move")}
      />
      <circle
        cx={(coverImage.x + coverImage.w) * W}
        cy={(coverImage.y + coverImage.h) * H}
        r={5}
        className="preview-anno-handle resize"
        onPointerDown={startDrag("resize")}
      />
    </svg>
  );
}
