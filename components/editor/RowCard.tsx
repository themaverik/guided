"use client";

/*
 * One row in the structure outline. Collapsed: a clickable skeleton + summary.
 * Selected: full controls — layout (single/double + wide), per-slot image
 * filename(s), arrow, border, row title/instruction (multi-row only), callouts,
 * and collapsible size overrides.
 *
 * Image inputs are plain filename fields in Phase 4; Phase 5 swaps them for a
 * thumbnail dropdown populated from public/<chapterId>/ plus upload.
 */
import { useState } from "react";
import type { BorderStyle, ImageRow, RowLayout } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";
import CalloutEditor from "./CalloutEditor";
import ImagePicker from "./ImagePicker";
import RichTextArea from "./RichTextArea";
import SlotSkeleton from "./SlotSkeleton";

export default function RowCard({
  ci,
  si,
  ri,
  row,
  isMulti,
  rowCount,
  selected,
}: {
  ci: number;
  si: number;
  ri: number;
  row: ImageRow;
  isMulti: boolean;
  rowCount: number;
  selected: boolean;
}) {
  const chapterId = useEditor((s) => s.book.chapters[ci]?.id ?? "");
  const selectRow = useEditor((s) => s.selectRow);
  const updateRow = useEditor((s) => s.updateRow);
  const moveRow = useEditor((s) => s.moveRow);
  const removeRow = useEditor((s) => s.removeRow);
  const [showSizes, setShowSizes] = useState(false);

  const layout: RowLayout = row.layout ?? "single";
  const isDouble = layout === "double";
  const isWide = layout === "single-wide";
  const borderOn = row.border !== false;
  const borderObj: BorderStyle =
    typeof row.border === "object" && row.border !== null ? row.border : {};
  const callouts = row.callouts ?? [];

  const setLayout = (l: RowLayout) => updateRow(ci, si, ri, { layout: l });

  const commitBorder = (next: BorderStyle) => {
    // Collapse to plain `true` only when nothing differs from the defaults.
    // An explicit `shadow: false` must persist (defaults now have shadow on).
    const empty =
      !next.color && !next.width && !next.radius && next.shadow !== false;
    updateRow(ci, si, ri, { border: empty ? true : next });
  };
  const setBorderField = (field: keyof BorderStyle, value: string) =>
    commitBorder({ ...borderObj, [field]: value || undefined });
  const setBorderShadow = (on: boolean) =>
    commitBorder({ ...borderObj, shadow: on });

  return (
    <div className={`row-card${selected ? " selected" : ""}`}>
      <div
        className="row-card-head"
        onClick={() => selectRow(ci, si, ri)}
        role="button"
        tabIndex={0}
      >
        <SlotSkeleton
          layout={layout}
          arrow={false}
          calloutCount={callouts.length}
          calloutLayout={row.calloutLayout === "below" ? "below" : "side"}
          calloutCols={row.calloutCols ?? 2}
        />
        <div className="row-card-meta">
          <span className="row-card-title">Row {ri + 1}</span>
          <span className="row-card-sub">
            {layout}
            {callouts.length > 0
              ? ` · ${callouts.length} callout${callouts.length === 1 ? "" : "s"} ${
                  row.calloutLayout === "below" ? "below" : "side"
                }`
              : ""}
          </span>
        </div>
        {isMulti ? (
          <div className="mini-btns" onClick={(e) => e.stopPropagation()}>
            <button
              className="mini-btn"
              onClick={() => moveRow(ci, si, ri, -1)}
              disabled={ri === 0}
              aria-label="Move row up"
            >
              ↑
            </button>
            <button
              className="mini-btn"
              onClick={() => moveRow(ci, si, ri, 1)}
              disabled={ri === rowCount - 1}
              aria-label="Move row down"
            >
              ↓
            </button>
            <button
              className="mini-btn danger"
              onClick={() => removeRow(ci, si, ri)}
              disabled={rowCount <= 1}
              aria-label="Remove row"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="row-controls">
          {/* Layout */}
          <div className="ctrl-row">
            <span className="ctrl-label">Images</span>
            <div className="seg">
              <button
                className={`seg-btn${!isDouble ? " active" : ""}`}
                onClick={() => setLayout(isWide ? "single-wide" : "single")}
              >
                single
              </button>
              <button
                className={`seg-btn${isDouble ? " active" : ""}`}
                onClick={() => setLayout("double")}
              >
                double
              </button>
            </div>
          </div>

          {!isDouble ? (
            <label className="ctrl-check">
              <input
                type="checkbox"
                checked={isWide}
                onChange={(e) =>
                  setLayout(e.target.checked ? "single-wide" : "single")
                }
              />
              Wide (full-width)
            </label>
          ) : (
            <div className="ctrl-row">
              <span className="ctrl-label">Spacing</span>
              <select
                value={row.imageGap ?? "8mm"}
                onChange={(e) =>
                  updateRow(ci, si, ri, { imageGap: e.target.value })
                }
              >
                <option value="2mm">Tight</option>
                <option value="8mm">Normal</option>
                <option value="16mm">Wide</option>
                <option value="28mm">Extra wide</option>
                <option value="44mm">Maximum</option>
              </select>
            </div>
          )}

          {/* Image slot(s) — thumbnail picker + upload */}
          <ImagePicker
            chapterId={chapterId}
            value={row.image}
            onChange={(filename) => updateRow(ci, si, ri, { image: filename })}
            label={isDouble ? "Screen A" : "Image"}
          />
          {isDouble ? (
            <ImagePicker
              chapterId={chapterId}
              value={row.image2}
              onChange={(filename) => updateRow(ci, si, ri, { image2: filename })}
              label="Screen B"
            />
          ) : null}

          {/* Border */}
          <div className="ctrl-checks">
            <label className="ctrl-check">
              <input
                type="checkbox"
                checked={borderOn}
                onChange={(e) =>
                  updateRow(ci, si, ri, { border: e.target.checked })
                }
              />
              Image border
            </label>
          </div>

          {borderOn ? (
            <div className="border-fields">
              <div className="editor-field">
                <label>Border color</label>
                <input
                  placeholder="#d7dede"
                  value={borderObj.color ?? ""}
                  onChange={(e) => setBorderField("color", e.target.value)}
                />
              </div>
              <div className="editor-field">
                <label>Width</label>
                <input
                  placeholder="6px"
                  value={borderObj.width ?? ""}
                  onChange={(e) => setBorderField("width", e.target.value)}
                />
              </div>
              <div className="editor-field">
                <label>Radius</label>
                <input
                  placeholder="20px"
                  value={borderObj.radius ?? ""}
                  onChange={(e) => setBorderField("radius", e.target.value)}
                />
              </div>
              <label className="ctrl-check" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={borderObj.shadow ?? true}
                  onChange={(e) => setBorderShadow(e.target.checked)}
                />
                Drop shadow
              </label>
            </div>
          ) : null}

          {/* Row head (multi-row only — page title/instruction cover single rows) */}
          {isMulti ? (
            <>
              <div className="editor-field">
                <label>Row title</label>
                <input
                  value={row.title ?? ""}
                  onChange={(e) =>
                    updateRow(ci, si, ri, { title: e.target.value })
                  }
                />
              </div>
              <div className="editor-field">
                <label>Row instruction</label>
                <RichTextArea
                  rows={2}
                  value={row.instruction ?? ""}
                  onChange={(v) => updateRow(ci, si, ri, { instruction: v })}
                />
              </div>
            </>
          ) : null}

          {/* Callouts */}
          <CalloutEditor
            ci={ci}
            si={si}
            ri={ri}
            callouts={callouts}
            calloutLayout={row.calloutLayout === "below" ? "below" : "side"}
            calloutCols={row.calloutCols ?? 2}
          />

          {/* Size overrides (advanced) */}
          <button
            className="disclosure"
            onClick={() => setShowSizes((v) => !v)}
          >
            {showSizes ? "▾" : "▸"} Size overrides
          </button>
          {showSizes ? (
            <div className="ctrl-checks">
              <div className="editor-field">
                <label>Slot width (CSS length)</label>
                <input
                  placeholder="e.g. 60mm"
                  value={row.imageWidth ?? ""}
                  onChange={(e) =>
                    updateRow(ci, si, ri, {
                      imageWidth: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div className="editor-field">
                <label>Slot height (CSS length)</label>
                <input
                  placeholder="e.g. 150mm"
                  value={row.imageHeight ?? ""}
                  onChange={(e) =>
                    updateRow(ci, si, ri, {
                      imageHeight: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
