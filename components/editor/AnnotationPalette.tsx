"use client";

/*
 * Floating tool palette over the page canvas (SP1). Sets the active annotation
 * tool for on-canvas drawing and the current draw color. Editor-only; nothing
 * here persists to the Book. The per-shape numeric properties still live in the
 * left panel (AnnotationEditor) until a later slice.
 */
import { useEffect } from "react";
import { useEditor, type AnnotationTool } from "@/lib/store";

const TOOLS: { tool: AnnotationTool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", icon: <path d="M3 2l8 4-3 1-1 3-4-8z" /> },
  { tool: "box", label: "Box", icon: <rect x="2.5" y="3.5" width="9" height="7" rx="1" /> },
  { tool: "line", label: "Line", icon: <line x1="3" y1="11" x2="11" y2="3" /> },
  { tool: "bracket", label: "Bracket", icon: <path d="M9 2H5v10h4" /> },
  { tool: "diamond", label: "Diamond", icon: <path d="M7 2l5 5-5 5-5-5z" /> },
  { tool: "text", label: "Text", icon: <path d="M3 3h8M7 3v9" /> },
  { tool: "connector", label: "Connector", icon: <path d="M3 3v6h6M7 9l2 0 0-2" /> },
];

const PRESETS = ["#658995", "#024450", "#d64545", "#e08a00", "#2e7d46", "#2f6df6"];

export default function AnnotationPalette({ ci, si }: { ci: number; si: number }) {
  const activeTool = useEditor((s) => s.activeTool);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const drawColor = useEditor((s) => s.drawColor);
  const setDrawColor = useEditor((s) => s.setDrawColor);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);

  // Switching steps starts fresh on Select.
  useEffect(() => {
    setActiveTool("select");
  }, [ci, si, setActiveTool]);

  const applyColor = (c: string) => {
    setDrawColor(c);
    if (selectedAnnotation) updateAnnotation(ci, si, selectedAnnotation, { stroke: c });
  };

  return (
    <div className="annotation-palette" role="toolbar" aria-label="Annotation tools">
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
      <label className="ap-color" title="Draw color">
        <span className="ap-chip" style={{ background: drawColor }} />
        <input
          type="color"
          value={drawColor}
          onChange={(e) => applyColor(e.target.value)}
          aria-label="Pick draw color"
        />
      </label>
      {PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          className={`ap-swatch${drawColor === c ? " active" : ""}`}
          style={{ background: c }}
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => applyColor(c)}
        />
      ))}
    </div>
  );
}
