"use client";

/*
 * Page background image controls: upload (to public/_background/), opacity, and
 * clear. The image renders behind content on every page, below the watermark.
 */
import { useRef, useState } from "react";
import type { BackgroundFit } from "@/lib/book-schema";
import { DEFAULT_BACKGROUND_FIT } from "@/lib/book-schema";
import { backgroundImageSrc } from "@/lib/book-render";
import { assetBaseFor, uploadApiFor } from "@/lib/project-routes";
import { useEditor } from "@/lib/store";

const BG_FOLDER = "_background";
const RECOMMENDED_TEXT_COLOR = "#ffffff";

const FIT_OPTIONS: { value: BackgroundFit; label: string }[] = [
  { value: "auto", label: "Auto (fill page, crop excess)" },
  { value: "crop", label: "Crop to fill" },
  { value: "shrink", label: "Shrink to fit (never enlarge)" },
  { value: "fit", label: "Fit within page (letterbox)" },
  { value: "stretch", label: "Stretch to fill" },
];

export default function BackgroundSettings() {
  const background = useEditor((s) => s.book.background);
  const slug = useEditor((s) => s.projectSlug);
  const updateBackground = useEditor((s) => s.updateBackground);
  const pageTextColor = useEditor((s) => s.book.pageTextColor);
  const updateBookMeta = useEditor((s) => s.updateBookMeta);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const image = background?.image;
  const opacity = background?.opacity ?? 1;
  const fit = background?.fit ?? DEFAULT_BACKGROUND_FIT;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("chapterId", BG_FOLDER);
      fd.append("file", file);
      const res = await fetch(uploadApiFor(slug), { method: "POST", body: fd });
      const data = (await res.json()) as { filename?: string };
      if (res.ok && data.filename) {
        // Store a bare filename so the image survives download/re-import; it is
        // resolved against the current project at render time.
        updateBackground({ image: data.filename });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Background image</h2>

      {image ? (
        <>
          <div className="wm-icon-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="wm-icon-preview"
              src={backgroundImageSrc(assetBaseFor(slug), image)}
              alt=""
            />
            <span className="img-picker-name">{image}</span>
            <button
              className="mini-btn danger"
              onClick={() => updateBackground({ image: undefined })}
              aria-label="Remove background"
            >
              ×
            </button>
          </div>
          <div className="ctrl-row">
            <span className="ctrl-label">Fit</span>
            <select
              value={fit}
              onChange={(e) =>
                updateBackground({ fit: e.target.value as BackgroundFit })
              }
            >
              {FIT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
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
              step={0.05}
              value={opacity}
              onChange={(e) =>
                updateBackground({ opacity: Number(e.target.value) })
              }
            />
          </div>
        </>
      ) : null}

      <button
        className="add-btn"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Uploading…" : image ? "Replace image…" : "Upload image…"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        hidden
        onChange={onUpload}
      />

      <div className="theme-row" style={{ marginTop: "10px" }}>
        <span className="theme-row-label">Page text</span>
        <div className="theme-row-controls">
          <label className="ctrl-check">
            <input
              type="checkbox"
              checked={pageTextColor != null}
              onChange={(e) =>
                updateBookMeta({
                  pageTextColor: e.target.checked
                    ? RECOMMENDED_TEXT_COLOR
                    : undefined,
                })
              }
            />
            Custom color
          </label>
          {pageTextColor != null ? (
            <input
              className="theme-color"
              type="color"
              value={pageTextColor}
              onChange={(e) => updateBookMeta({ pageTextColor: e.target.value })}
              title="Page text color"
            />
          ) : null}
        </div>
      </div>
      <p className="editor-help">
        Recolors all page text (titles, body, labels) and dividers for
        legibility over a dark background. Applies to every page; callouts keep
        their own colors.
      </p>
    </section>
  );
}
