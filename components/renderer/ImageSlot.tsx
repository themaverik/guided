"use client";

/*
 * A single framed image slot. Client leaf: it probes the image URL and only
 * swaps it in on a successful load, leaving the labelled placeholder visible on
 * 404 — mirroring the prototype's behavior so authors learn where to drop files.
 *
 * Sizing: the aspect-ratio comes from the parent `.step-image-wrap` class. The
 * optional `width`/`height` props are CSS length overrides for one slot.
 */
import { useEffect, useState } from "react";
import { type Annotation, type Border, type ImageFit, resolveBorder } from "@/lib/book-schema";
import { imageFitClass } from "@/lib/grid-render";
import AnnotationLayer from "./AnnotationLayer";
import { PhotoIcon } from "./icons";

export interface ImageSlotProps {
  src?: string;
  label: string;
  /** Expected path text shown in the placeholder. */
  path: string;
  hint?: string;
  /** CSS length override for the slot width. */
  width?: string;
  /** CSS length override for the slot height. */
  height?: string;
  /** Default true (6px frame); false removes it; object = framed with overrides. */
  border?: Border;
  /** Canvas annotations drawn over this slot. */
  annotations?: Annotation[];
  /** Grid-only image fit mode; default contain (no class → unchanged markup). */
  fit?: ImageFit;
}

export default function ImageSlot({
  src,
  label,
  path,
  hint,
  width,
  height,
  border = true,
  annotations,
  fit,
}: ImageSlotProps) {
  const [loaded, setLoaded] = useState(false);
  const frame = resolveBorder(border);

  useEffect(() => {
    setLoaded(false);
    if (!src) return;
    const probe = new Image();
    probe.onload = () => setLoaded(true);
    probe.onerror = () => setLoaded(false);
    probe.src = src;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src]);

  const style: React.CSSProperties = {};
  if (height) {
    style.height = height;
    style.aspectRatio = "auto";
  }
  if (width) {
    style.width = width;
    style.maxWidth = width;
    style.flex = `0 0 ${width}`;
  }
  if (frame.show) {
    style.borderColor = frame.color;
    style.borderWidth = frame.width;
    style.borderStyle = "solid";
    style.borderRadius = frame.radius;
  }
  if (frame.shadow) {
    style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.18)";
  }
  // White (not cream) behind any real image, so the contain-letterbox is
  // invisible against the white page — including in the exported PDF.
  if (src) {
    style.backgroundColor = "#ffffff";
  }

  const fitCls = imageFitClass(fit);
  const cls =
    `img-slot${frame.show ? "" : " no-border"}${loaded ? " has-img" : ""}` +
    `${fitCls ? ` ${fitCls}` : ""}`;
  const hasOverride = Boolean(width || height);

  return (
    <div
      className={cls}
      style={style}
      data-src={src ?? ""}
      data-ov={hasOverride ? "1" : undefined}
    >
      <div className="img-slot-meta">
        <div className="img-slot-icon">
          <PhotoIcon />
        </div>
        <div className="img-slot-label">{label}</div>
        {path ? <div className="img-slot-path">{path}</div> : null}
        {hint ? <div className="img-slot-hint">{hint}</div> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {loaded && src ? <img alt={label} src={src} /> : null}
      <AnnotationLayer annotations={annotations} />
    </div>
  );
}
