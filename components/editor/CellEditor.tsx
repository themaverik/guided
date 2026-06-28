"use client";

/*
 * Left-panel editor for the selected grid cell: assign/replace/remove its image
 * (with a fit/crop control + a misfit prompt) and add/edit/remove/reorder its
 * callouts. Operates on the cell's StackedObjects via the store cell actions.
 * Callouts are flow-stacked (Plan 6 render); drag is Plan 9.
 */
import { useEffect, useState } from "react";
import type { Callout, ImageFit } from "@/lib/book-schema";
import { DEFAULT_PAGE_CONFIG, normalizeCalloutType } from "@/lib/book-schema";
import { CALLOUT_TYPES } from "@/lib/book-mutations";
import { bodyRegion } from "@/lib/grid-math";
import { assetUrl } from "@/lib/project-routes";
import { useEditor } from "@/lib/store";
import ImagePicker from "./ImagePicker";
import RichTextArea from "./RichTextArea";

const FIT_OPTIONS: { v: ImageFit; label: string }[] = [
  { v: "contain", label: "Maintain ratio" },
  { v: "fit-width", label: "Crop height" },
  { v: "fit-height", label: "Crop width" },
];

export default function CellEditor({ ci, si, ri, cellIndex }: { ci: number; si: number; ri: number; cellIndex: number }) {
  const slug = useEditor((s) => s.projectSlug);
  const chapterId = useEditor((s) => s.book.chapters[ci]?.id ?? "");
  const cell = useEditor((s) => s.book.chapters[ci]?.steps[si]?.grid?.[ri]?.cells?.[cellIndex]);
  const row = useEditor((s) => s.book.chapters[ci]?.steps[si]?.grid?.[ri]);
  const pageConfig = useEditor((s) => s.book.pageConfig ?? DEFAULT_PAGE_CONFIG);
  const setCellImage = useEditor((s) => s.setCellImage);
  const removeCellImage = useEditor((s) => s.removeCellImage);
  const setCellImageFit = useEditor((s) => s.setCellImageFit);
  const addCellCallout = useEditor((s) => s.addCellCallout);
  const updateCellCallout = useEditor((s) => s.updateCellCallout);
  const removeCellObject = useEditor((s) => s.removeCellObject);
  const moveCellObject = useEditor((s) => s.moveCellObject);
  const addCellText = useEditor((s) => s.addCellText);
  const updateCellText = useEditor((s) => s.updateCellText);
  const setCellTextAlign = useEditor((s) => s.setCellTextAlign);
  const updateCellObjectPlacement = useEditor((s) => s.updateCellObjectPlacement);
  const selectedObjId = useEditor((s) => s.selection.objectId ?? null);

  const imageRef = cell?.objects.find((o) => o.kind === "image" && o.role === "primary")?.ref;
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  useEffect(() => {
    setImgAspect(null);
    if (!imageRef) return;
    const probe = new Image();
    probe.onload = () => setImgAspect(probe.naturalWidth / probe.naturalHeight);
    probe.src = assetUrl(slug, chapterId, imageRef);
    return () => { probe.onload = null; };
  }, [slug, chapterId, imageRef]);

  if (!cell || !row) return null;

  const image = cell.objects.find((o) => o.kind === "image" && o.role === "primary");
  const fit: ImageFit = image?.fit ?? "contain";
  const body = bodyRegion(pageConfig);
  const cellAspect = (cell.widthFr * body.w) / (row.heightFr * body.h);
  const misfit = imgAspect != null && Math.abs(imgAspect - cellAspect) / cellAspect > 0.1;
  const showCropPrompt = Boolean(imageRef) && misfit && fit === "contain";
  const blocks = cell.objects
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.kind === "callout" || o.kind === "text");

  return (
    <section className="editor-section cell-editor">
      <h3 className="editor-subtitle">Cell {ri + 1}.{cellIndex + 1}</h3>

      <div className="editor-field">
        <ImagePicker
          chapterId={chapterId}
          value={imageRef}
          onChange={(f) => setCellImage(ci, si, ri, cellIndex, f)}
          label="Image"
        />
        {imageRef ? (
          <>
            <div className="ctrl-row">
              <span className="ctrl-label">Fit</span>
              <div className="seg">
                {FIT_OPTIONS.map(({ v, label }) => (
                  <button
                    key={v}
                    className={`seg-btn${fit === v ? " active" : ""}`}
                    onClick={() => setCellImageFit(ci, si, ri, cellIndex, v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {showCropPrompt ? (
              <p className="cell-crop-hint">
                This image doesn&apos;t fill the cell — choose a crop above, or keep the ratio.
              </p>
            ) : null}
            <button className="mini-btn danger" onClick={() => removeCellImage(ci, si, ri, cellIndex)}>
              Remove image
            </button>
          </>
        ) : null}
      </div>

      <div className="callout-list">
        {blocks.map(({ o, i }) =>
          o.kind === "callout" ? (
            <div className={`callout-item${selectedObjId === o.id ? " selected" : ""}`} key={o.id}>
              <div className="callout-item-head">
                <select
                  value={normalizeCalloutType(o.callout?.type)}
                  onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { type: e.target.value as Callout["type"] })}
                >
                  {CALLOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="mini-btns">
                  {o.positioned ? (
                    <button
                      className="mini-btn"
                      onClick={() => updateCellObjectPlacement(ci, si, ri, cellIndex, o.id, { positioned: false })}
                      aria-label="Dock to flow"
                      title="Dock to flow"
                    >
                      ⤓
                    </button>
                  ) : null}
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                  <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
                </div>
              </div>
              <input
                placeholder="Title"
                value={o.callout?.title ?? ""}
                onChange={(e) => updateCellCallout(ci, si, ri, cellIndex, i, { title: e.target.value })}
              />
              <RichTextArea
                rows={2}
                placeholder="Body"
                value={o.callout?.body ?? ""}
                onChange={(v) => updateCellCallout(ci, si, ri, cellIndex, i, { body: v })}
              />
            </div>
          ) : (
            <div className={`callout-item${selectedObjId === o.id ? " selected" : ""}`} key={o.id}>
              <div className="callout-item-head">
                <span className="block-label">Text</span>
                <div className="seg align-seg">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      className={`seg-btn${(o.align ?? "left") === a ? " active" : ""}`}
                      onClick={() => setCellTextAlign(ci, si, ri, cellIndex, i, a)}
                      aria-label={`Align ${a}`}
                      title={`Align ${a}`}
                    >
                      {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
                    </button>
                  ))}
                </div>
                <div className="mini-btns">
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, -1)} aria-label="Move up">↑</button>
                  <button className="mini-btn" onClick={() => moveCellObject(ci, si, ri, cellIndex, i, 1)} aria-label="Move down">↓</button>
                  <button className="mini-btn danger" onClick={() => removeCellObject(ci, si, ri, cellIndex, i)} aria-label="Remove">×</button>
                </div>
              </div>
              <RichTextArea
                rows={4}
                placeholder="Text…"
                value={o.text ?? ""}
                onChange={(v) => updateCellText(ci, si, ri, cellIndex, i, v)}
                showHeadings
                showStrike
              />
            </div>
          ),
        )}
      </div>
      <div className="cell-add-row">
        <button className="add-btn" onClick={() => addCellCallout(ci, si, ri, cellIndex)}>
          + Add callout
        </button>
        <button className="add-btn" onClick={() => addCellText(ci, si, ri, cellIndex)}>
          + Add text
        </button>
      </div>
    </section>
  );
}
