"use client";

/*
 * Image slot picker: a combobox over the files already in public/<chapterId>/
 * (fetched from /api/images), each shown as a thumbnail tile, plus an
 * "Upload new…" tile that POSTs to /api/upload and selects the result. The
 * current selection previews in the trigger button.
 */
import { useEffect, useRef, useState } from "react";
import { assetUrl, imagesApiFor } from "@/lib/project-routes";
import { uploadImage } from "@/lib/upload-image";
import { useEditor } from "@/lib/store";

export default function ImagePicker({
  chapterId,
  value,
  onChange,
  label,
}: {
  chapterId: string;
  value?: string;
  onChange: (filename: string) => void;
  label: string;
}) {
  const slug = useEditor((s) => s.projectSlug);
  const [images, setImages] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const res = await fetch(
        `${imagesApiFor(slug)}?chapterId=${encodeURIComponent(chapterId)}`,
      );
      const data = (await res.json()) as { images: string[] };
      setImages(data.images ?? []);
    } catch {
      setImages([]);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onPick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadImage(slug, chapterId, file);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await refresh();
      onPick(result.filename);
    } catch {
      setError("upload failed");
    } finally {
      setUploading(false);
    }
  };

  const src = value ? assetUrl(slug, chapterId, value) : undefined;

  return (
    <div className="img-picker" ref={rootRef}>
      <span className="img-picker-label">{label}</span>
      <button
        type="button"
        className="img-picker-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="img-picker-thumb" src={src} alt={value} />
        ) : (
          <span className="img-picker-thumb empty" />
        )}
        <span className="img-picker-name">{value || "Choose image…"}</span>
        <span className="img-picker-caret">▾</span>
      </button>

      {open ? (
        <div className="img-picker-panel">
          <div className="img-picker-grid">
            {images.map((name) => (
              <button
                type="button"
                key={name}
                className={`img-tile${name === value ? " selected" : ""}`}
                onClick={() => onPick(name)}
                title={name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(slug, chapterId, name)} alt={name} />
                <span className="img-tile-name">{name}</span>
              </button>
            ))}
            <button
              type="button"
              className="img-tile upload"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <span className="img-tile-plus">{uploading ? "…" : "+"}</span>
              <span className="img-tile-name">
                {uploading ? "Uploading" : "Upload new…"}
              </span>
            </button>
          </div>
          {images.length === 0 && !uploading ? (
            <p className="img-picker-hint">
              No images in public/{chapterId}/ yet — upload one.
            </p>
          ) : null}
          {error ? <p className="img-picker-error">{error}</p> : null}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        hidden
        onChange={onUpload}
      />
    </div>
  );
}
