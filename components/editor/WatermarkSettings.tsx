"use client";

/*
 * Watermark controls: enable, text, position, opacity, and an optional icon
 * uploaded to public/_watermark/ (stored as a root-relative URL in
 * watermark.icon, which takes precedence over text when set).
 */
import { useRef, useState } from "react";
import type { WatermarkPosition } from "@/lib/book-schema";
import {
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_SCALE,
} from "@/lib/book-schema";
import { assetBaseFor, uploadApiFor } from "@/lib/project-routes";
import { watermarkIconSrc } from "@/lib/book-render";
import { useEditor } from "@/lib/store";

const POSITIONS: WatermarkPosition[] = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const ICON_FOLDER = "_watermark";

export default function WatermarkSettings() {
  const wm = useEditor((s) => s.book.watermark);
  const slug = useEditor((s) => s.projectSlug);
  const updateWatermark = useEditor((s) => s.updateWatermark);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const enabled = wm?.enabled ?? false;
  const opacity = wm?.opacity ?? DEFAULT_WATERMARK_OPACITY;
  const scale = wm?.scale ?? DEFAULT_WATERMARK_SCALE;

  const onUploadIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("chapterId", ICON_FOLDER);
      fd.append("file", file);
      const res = await fetch(uploadApiFor(slug), { method: "POST", body: fd });
      const data = (await res.json()) as { filename?: string };
      if (res.ok && data.filename) {
        // Store a bare filename so the logo survives download/re-import; it is
        // resolved against the current project at render time.
        updateWatermark({ icon: data.filename });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Watermark</h2>

      <label className="ctrl-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => updateWatermark({ enabled: e.target.checked })}
        />
        Enable watermark
      </label>

      {enabled ? (
        <div className="chapter-detail">
          <div className="editor-field">
            <label>Text</label>
            <input
              placeholder="e.g. CONFIDENTIAL — DRAFT"
              value={wm?.text ?? ""}
              onChange={(e) => updateWatermark({ text: e.target.value })}
            />
          </div>

          <div className="ctrl-row">
            <span className="ctrl-label">Position</span>
            <select
              value={wm?.position ?? "center"}
              onChange={(e) =>
                updateWatermark({
                  position: e.target.value as WatermarkPosition,
                })
              }
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="ctrl-row">
            <span className="ctrl-label">Opacity {opacity.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(e) =>
                updateWatermark({ opacity: Number(e.target.value) })
              }
            />
          </div>

          <div className="ctrl-row">
            <span className="ctrl-label">Size {scale.toFixed(2)}×</span>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.05}
              value={scale}
              onChange={(e) =>
                updateWatermark({ scale: Number(e.target.value) })
              }
            />
          </div>

          <div className="editor-field">
            <label>Logo (optional — shown above the text)</label>
            {wm?.icon ? (
              <div className="wm-icon-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="wm-icon-preview"
                  src={watermarkIconSrc(assetBaseFor(slug), wm.icon)}
                  alt=""
                />
                <span className="img-picker-name">{wm.icon}</span>
                <button
                  className="mini-btn danger"
                  onClick={() => updateWatermark({ icon: undefined })}
                  aria-label="Remove logo"
                >
                  ×
                </button>
              </div>
            ) : null}
            <button
              className="add-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : wm?.icon ? "Replace logo…" : "Upload logo…"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              hidden
              onChange={onUploadIcon}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
