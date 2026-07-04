"use client";

/*
 * Floating tool palette over the page canvas (SP1 + swatch/width slice). Sets
 * the active annotation tool, the current draw color (from the 8 OKLCH swatches)
 * and the current stroke width (4 presets). Picking a swatch/width also patches
 * the selected shape. Editor-only; nothing here persists derived output — only
 * stroke/width/swatchId on the shape. Fill tint is a later color-system slice.
 */
import { useEffect } from "react";
import { useEditor, type AnnotationTool } from "@/lib/store";
import AnnotationContext from "./AnnotationContext";
import {
  SWATCHES,
  WIDTH_PRESETS,
  swatchByStroke,
  swatchPatch,
  type Swatch,
} from "@/lib/annotation-palette";

const TOOLS: { tool: AnnotationTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", icon: <path d="M3 2l8 4-3 1-1 3-4-8z" /> },
  { tool: "box", label: "Box", icon: <rect x="2.5" y="3.5" width="9" height="7" rx="1" /> },
  { tool: "line", label: "Line", icon: <line x1="3" y1="11" x2="11" y2="3" /> },
  { tool: "bracket", label: "Bracket", icon: <path d="M9 2H5v10h4" /> },
  { tool: "diamond", label: "Diamond", icon: <path d="M7 2l5 5-5 5-5-5z" /> },
  { tool: "text", label: "Text", icon: <path d="M3 3h8M7 3v9" /> },
  { tool: "connector", label: "Connector", icon: <path d="M3 3v6h6M7 9l2 0 0-2" /> },
];

export default function AnnotationPalette({ ci, si }: { ci: number; si: number }) {
  const activeTool = useEditor((s) => s.activeTool);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const drawColor = useEditor((s) => s.drawColor);
  const setDrawColor = useEditor((s) => s.setDrawColor);
  const drawWidth = useEditor((s) => s.drawWidth);
  const setDrawWidth = useEditor((s) => s.setDrawWidth);
  const setDrawSwatch = useEditor((s) => s.setDrawSwatch);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  // The selected shape (or null) — needed to know a text shape's kind.
  const selected = useEditor((s) => {
    const id = s.selectedAnnotation;
    if (!id) return null;
    const anns = s.book.chapters[ci]?.steps[si]?.annotations ?? [];
    return anns.find((a) => a.id === id) ?? null;
  });
  // Return the raw array (or undefined) — a `?? []` here would mint a fresh
  // array every render, breaking useSyncExternalStore's snapshot caching
  // ("getSnapshot should be cached to avoid an infinite loop"). Default at the
  // use site instead.
  const annotations = useEditor(
    (s) => s.book.chapters[ci]?.steps[si]?.annotations,
  );

  // Switching steps starts fresh on Select.
  useEffect(() => {
    setActiveTool("select");
  }, [ci, si, setActiveTool]);

  const activeSwatchId = swatchByStroke(drawColor);

  const applySwatch = (sw: Swatch) => {
    setDrawColor(sw.stroke);
    setDrawSwatch(sw.id);
    if (selected) updateAnnotation(ci, si, selected.id, swatchPatch(sw, selected.kind));
  };

  const applyWidth = (value: number) => {
    setDrawWidth(value);
    if (selected) updateAnnotation(ci, si, selected.id, { width: value });
  };

  return (
    <div className="annotation-palette" role="toolbar" aria-label="Annotation tools">
      <div className="ap-main-row">
        {TOOLS.map(({ tool, label, icon }) => (
          <button
            key={tool}
            type="button"
            className={`ap-tool${activeTool === tool ? " active" : ""}`}
            aria-pressed={activeTool === tool}
            title={label}
            onClick={() => setActiveTool(tool)}
          >
            <svg viewBox="0 0 14 14" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
              {icon}
            </svg>
          </button>
        ))}
        <span className="ap-div" />
        {SWATCHES.map((sw) => (
          <button
            key={sw.id}
            type="button"
            className={`ap-swatch${activeSwatchId === sw.id ? " active" : ""}`}
            style={{ background: sw.fill, borderColor: sw.stroke }}
            title={sw.label}
            aria-label={`Color ${sw.label}`}
            aria-pressed={activeSwatchId === sw.id}
            onClick={() => applySwatch(sw)}
          />
        ))}
        <span className="ap-div" />
        {WIDTH_PRESETS.map((w) => (
          <button
            key={w.value}
            type="button"
            className={`ap-width${drawWidth === w.value ? " active" : ""}`}
            title={`${w.label} (${w.value})`}
            aria-label={`Width ${w.label}`}
            aria-pressed={drawWidth === w.value}
            onClick={() => applyWidth(w.value)}
          >
            <span className="ap-width-bar" style={{ height: w.value }} />
          </button>
        ))}
      </div>
      {selected ? (
        <AnnotationContext ci={ci} si={si} shape={selected} annotations={annotations ?? []} />
      ) : null}
    </div>
  );
}
