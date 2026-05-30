"use client";

/*
 * Editor for the selected step: page-level title/instruction, then the rows
 * outline (a 1:1 miniature of the page) with add/remove/reorder. Handles both
 * authoring forms via rowsOf(); adding a 2nd row migrates the step to multi-row.
 */
import { rowsOf } from "@/lib/book-mutations";
import { useEditor } from "@/lib/store";
import AnnotationEditor from "./AnnotationEditor";
import RichTextArea from "./RichTextArea";
import RowCard from "./RowCard";

export default function StepEditor({ ci, si }: { ci: number; si: number }) {
  const step = useEditor((s) => s.book.chapters[ci]?.steps[si]);
  const selectedRow = useEditor((s) => s.selection.rowIndex);
  const updateStep = useEditor((s) => s.updateStep);
  const addRow = useEditor((s) => s.addRow);

  if (!step) return null;

  const rows = rowsOf(step);
  const isMulti = Array.isArray(step.images) && step.images.length > 0;

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Step</h2>
      <div className="editor-field">
        <label>Page title</label>
        <input
          value={step.title ?? ""}
          onChange={(e) => updateStep(ci, si, { title: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label>Page instruction (numbered intro)</label>
        <RichTextArea
          rows={3}
          value={step.instruction ?? ""}
          onChange={(v) => updateStep(ci, si, { instruction: v })}
        />
      </div>

      <h3 className="editor-subtitle">Rows</h3>
      <div className="rows-outline">
        {rows.map((row, ri) => (
          <RowCard
            key={ri}
            ci={ci}
            si={si}
            ri={ri}
            row={row}
            isMulti={isMulti || rows.length > 1}
            rowCount={rows.length}
            selected={(selectedRow ?? 0) === ri}
          />
        ))}
      </div>
      <button className="add-btn" onClick={() => addRow(ci, si)}>
        + Add row
      </button>

      <h3 className="editor-subtitle">
        Annotations
        {step.annotations?.length ? ` (${step.annotations.length})` : ""}
      </h3>
      <AnnotationEditor ci={ci} si={si} annotations={step.annotations ?? []} />
    </section>
  );
}
