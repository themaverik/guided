"use client";

/*
 * Shared per-page decor controls: background image (upload/fit/opacity/clear)
 * plus an optional page text color override. Reused by the cover,
 * chapter-intro, and back-cover settings so each page gets the same authoring
 * UI without duplicating it. Ported from the book-level `BackgroundSettings`
 * (that component stays untouched) — this one is driven entirely by props
 * instead of the store, so callers can target any page's own fields.
 */
import { useRef, useState } from "react";
import type { Background, BackgroundFit } from "@/lib/book-schema";
import { DEFAULT_BACKGROUND_FIT } from "@/lib/book-schema";
import { backgroundImageSrc } from "@/lib/book-render";
import { assetBaseFor } from "@/lib/project-routes";
import { uploadImage } from "@/lib/upload-image";

const BG_FOLDER = "_background";
const RECOMMENDED_TEXT_COLOR = "#ffffff";

const FIT_OPTIONS: { value: BackgroundFit; label: string }[] = [
  { value: "auto", label: "Auto (fill page, crop excess)" },
  { value: "crop", label: "Crop to fill" },
  { value: "shrink", label: "Shrink to fit (never enlarge)" },
  { value: "fit", label: "Fit within page (letterbox)" },
  { value: "stretch", label: "Stretch to fill" },
];

export default function PageDecorControls({
  background,
  textColor,
  onBackground,
  onTextColor,
  slug,
}: {
  background?: Background;
  textColor?: string;
  onBackground: (patch: Partial<Background>) => void;
  onTextColor: (c: string | undefined) => void;
  slug: string;
}) {
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
      const result = await uploadImage(slug, BG_FOLDER, file);
      if (!("error" in result)) {
        // Bare filename so it survives download/re-import; resolved against
        // the current project at render time.
        onBackground({ image: result.filename });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
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
              onClick={() => onBackground({ image: undefined })}
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
                onBackground({ fit: e.target.value as BackgroundFit })
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
                onBackground({ opacity: Number(e.target.value) })
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
              checked={textColor != null}
              onChange={(e) =>
                onTextColor(e.target.checked ? RECOMMENDED_TEXT_COLOR : undefined)
              }
            />
            Custom color
          </label>
          {textColor != null ? (
            <input
              className="theme-color"
              type="color"
              value={textColor}
              onChange={(e) => onTextColor(e.target.value)}
              title="Page text color"
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
