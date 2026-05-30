"use client";

/*
 * Client island that owns the `.book` container ref and runs auto-fit. The
 * page components are passed as `children` from the server-rendered <A4Book>,
 * so the heavy renderer tree stays in RSC while only this thin wrapper is
 * client-side (it just measures the DOM and scales overflowing step bodies).
 *
 * `fitKey` is a content signature; changing it re-runs the fit pass.
 */
import { useRef } from "react";
import { useAutoFit } from "@/lib/use-auto-fit";

export interface BookCanvasProps {
  fitKey: string;
  onReport?: (overflows: string[]) => void;
  /** CSS custom properties (theme overrides) applied to the .book root. */
  rootStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export default function BookCanvas({
  fitKey,
  onReport,
  rootStyle,
  children,
}: BookCanvasProps) {
  const ref = useRef<HTMLElement>(null);
  useAutoFit(ref, [fitKey], onReport);

  return (
    <main className="book" ref={ref} style={rootStyle}>
      {children}
    </main>
  );
}
