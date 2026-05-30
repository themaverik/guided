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
import { type Annotation, type Border, resolveBorder } from "@/lib/book-schema";
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

  const cls = `img-slot${frame.show ? "" : " no-border"}${loaded ? " has-img" : ""}`;

  return (
    <div className={cls} style={style} data-src={src ?? ""}>
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
