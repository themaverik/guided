"use client";

/*
 * On-canvas annotation drawing (SP1). Turns a press→drag→release on the page
 * into a new shape, driven by the store's activeTool + drawColor. Pure geometry
 * lives in lib/annotations (boundsFromDrag); this hook owns the transient draw
 * state and commits the finished shape via addAnnotation. Editor-only.
 */
import { useEffect, useRef, useState } from "react";
import type { Annotation } from "@/lib/book-schema";
import type { Point } from "@/lib/annotations";
import { boundsFromDrag } from "@/lib/annotations";
import { newConnector, newSurface } from "@/lib/book-mutations";
import { useEditor, type AnnotationTool } from "@/lib/store";

export type DrawPreview =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

function previewFor(tool: AnnotationTool, a: Point, b: Point): DrawPreview | null {
  if (tool === "select") return null;
  if (tool === "connector") return { kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const bd = boundsFromDrag(a, b, tool);
  if (tool === "line") return { kind: "line", x1: bd.x, y1: bd.y, x2: bd.x + bd.w, y2: bd.y + bd.h };
  return { kind: "rect", x: bd.x, y: bd.y, w: bd.w, h: bd.h };
}

function buildShape(
  tool: AnnotationTool,
  a: Point,
  b: Point,
  color: string,
): Annotation | null {
  if (tool === "select") return null;
  if (tool === "connector") {
    const nc = newConnector();
    return {
      ...nc,
      from: { ...nc.from, x: a.x, y: a.y },
      to: { ...nc.to, x: b.x, y: b.y },
      stroke: color,
    };
  }
  const bd = boundsFromDrag(a, b, tool);
  const s = newSurface(tool);
  // For text the visible color is `color`; every other surface uses `stroke`.
  if (tool === "text") return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, color };
  return { ...s, x: bd.x, y: bd.y, w: bd.w, h: bd.h, stroke: color };
}

export function useAnnotationDraw(ci: number, si: number) {
  const activeTool = useEditor((s) => s.activeTool);
  const drawColor = useEditor((s) => s.drawColor);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const start = useRef<Point | null>(null);
  const [preview, setPreview] = useState<DrawPreview | null>(null);

  // Escape cancels an in-progress draw and returns to Select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      start.current = null;
      setPreview(null);
      setActiveTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveTool]);

  const begin = (p: Point): boolean => {
    if (activeTool === "select") return false;
    start.current = p;
    setPreview(previewFor(activeTool, p, p));
    return true;
  };
  const move = (p: Point) => {
    if (!start.current) return;
    setPreview(previewFor(activeTool, start.current, p));
  };
  const end = (p: Point) => {
    const s0 = start.current;
    start.current = null;
    setPreview(null);
    if (!s0) return;
    const ann = buildShape(activeTool, s0, p, drawColor);
    if (ann) {
      addAnnotation(ci, si, ann);
      selectAnnotation(ann.id);
    }
    setActiveTool("select");
  };

  return {
    activeTool,
    preview,
    drawing: () => start.current != null,
    begin,
    move,
    end,
  };
}
