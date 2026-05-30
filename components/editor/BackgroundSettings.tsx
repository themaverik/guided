"use client";

/*
 * Page background image controls: upload (to public/_background/), opacity, and
 * clear. The image renders behind content on every page, below the watermark.
 */
import { useRef, useState } from "react";
import { assetUrl, uploadApiFor } from "@/lib/project-routes";
import { useEditor } from "@/lib/store";

const BG_FOLDER = "_background";

export default function BackgroundSettings() {
  const background = useEditor((s) => s.book.background);
  const slug = useEditor((s) => s.projectSlug);
  const updateBackground = useEditor((s) => s.updateBackground);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const image = background?.image;
  const opacity = background?.opacity ?? 1;

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
        updateBackground({ image: assetUrl(slug, BG_FOLDER, data.filename) });
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
            <img className="wm-icon-preview" src={image} alt="" />
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
    </section>
  );
}
