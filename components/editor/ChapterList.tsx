"use client";

/*
 * Chapters + steps navigation and structure editing: add/remove/reorder
 * chapters and steps, edit chapter id/title/description, and select a step
 * (which reveals the StepEditor below and focuses the matching page).
 */
import { useRef, useState } from "react";
import type { ImageFit } from "@/lib/book-schema";
import { pad2 } from "@/lib/book-render";
import { assetUrl } from "@/lib/project-routes";
import { uploadImage } from "@/lib/upload-image";
import { useEditor } from "@/lib/store";
import PageDecorControls from "./PageDecorControls";
import RichTextArea from "./RichTextArea";
import StepEditor from "./StepEditor";

const BG_FOLDER = "_background";

const COVER_FIT_OPTIONS: { value: ImageFit; label: string }[] = [
  { value: "contain", label: "Maintain ratio" },
  { value: "fit-width", label: "Crop height" },
  { value: "fit-height", label: "Crop width" },
];

export default function ChapterList() {
  const book = useEditor((s) => s.book);
  const slug = useEditor((s) => s.projectSlug);
  const selection = useEditor((s) => s.selection);
  const selectChapter = useEditor((s) => s.selectChapter);
  const selectStep = useEditor((s) => s.selectStep);
  const addChapter = useEditor((s) => s.addChapter);
  const removeChapter = useEditor((s) => s.removeChapter);
  const moveChapter = useEditor((s) => s.moveChapter);
  const updateChapter = useEditor((s) => s.updateChapter);
  const setChapterCoverImage = useEditor((s) => s.setChapterCoverImage);
  const addStep = useEditor((s) => s.addStep);
  const removeStep = useEditor((s) => s.removeStep);
  const moveStep = useEditor((s) => s.moveStep);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const ci = selection.chapterIndex;

  const onCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverUploading(true);
    try {
      const result = await uploadImage(slug, BG_FOLDER, file);
      if (!("error" in result)) {
        setChapterCoverImage(ci, { image: result.filename });
      }
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <>
      <section className="editor-section">
        <h2 className="editor-section-title">Chapters</h2>
        {book.chapters.map((ch, i) => {
          const active = ci === i;
          return (
            <div key={i}>
              <div className={`editor-nav-item${active ? " active" : ""}`}>
                <button
                  className="nav-label"
                  onClick={() => selectChapter(i)}
                >
                  {pad2(i + 1)} · {ch.title}
                </button>
                <div className="mini-btns">
                  <button
                    className="mini-btn"
                    onClick={() => moveChapter(i, -1)}
                    disabled={i === 0}
                    aria-label="Move chapter up"
                  >
                    ↑
                  </button>
                  <button
                    className="mini-btn"
                    onClick={() => moveChapter(i, 1)}
                    disabled={i === book.chapters.length - 1}
                    aria-label="Move chapter down"
                  >
                    ↓
                  </button>
                  <button
                    className="mini-btn danger"
                    onClick={() => removeChapter(i)}
                    disabled={book.chapters.length <= 1}
                    aria-label="Remove chapter"
                  >
                    ×
                  </button>
                </div>
              </div>

              {active ? (
                <div className="chapter-detail">
                  <div className="editor-field">
                    <label>Chapter id (image folder)</label>
                    <input
                      value={ch.id}
                      onChange={(e) =>
                        updateChapter(i, { id: e.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <label>Chapter title</label>
                    <input
                      value={ch.title}
                      onChange={(e) =>
                        updateChapter(i, { title: e.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <label>Description</label>
                    <RichTextArea
                      rows={3}
                      value={ch.description}
                      onChange={(v) => updateChapter(i, { description: v })}
                    />
                  </div>

                  <h3 className="editor-subtitle">Chapter-intro background</h3>
                  <PageDecorControls
                    background={ch.background}
                    textColor={ch.pageTextColor}
                    onBackground={(p) =>
                      updateChapter(i, { background: { ...ch.background, ...p } })
                    }
                    onTextColor={(c) => updateChapter(i, { pageTextColor: c })}
                    slug={slug}
                  />

                  <h3 className="editor-subtitle">Chapter cover image</h3>
                  <div className="editor-field">
                    {ch.coverImage?.image ? (
                      <>
                        <div className="wm-icon-row">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="wm-icon-preview"
                            src={assetUrl(slug, BG_FOLDER, ch.coverImage.image)}
                            alt=""
                          />
                          <span className="img-picker-name">
                            {ch.coverImage.image}
                          </span>
                          <button
                            className="mini-btn danger"
                            onClick={() => setChapterCoverImage(i, null)}
                            aria-label="Remove cover image"
                          >
                            ×
                          </button>
                        </div>
                        <div className="ctrl-row">
                          <span className="ctrl-label">Fit</span>
                          <select
                            value={ch.coverImage.fit ?? "contain"}
                            onChange={(e) =>
                              setChapterCoverImage(i, {
                                fit: e.target.value as ImageFit,
                              })
                            }
                          >
                            {COVER_FIT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : null}
                    <button
                      className="add-btn"
                      onClick={() => coverFileRef.current?.click()}
                      disabled={coverUploading}
                    >
                      {coverUploading
                        ? "Uploading…"
                        : ch.coverImage?.image
                          ? "Replace cover image…"
                          : "Upload cover image…"}
                    </button>
                    <input
                      ref={coverFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                      hidden
                      onChange={onCoverUpload}
                    />
                  </div>

                  <h3 className="editor-subtitle">Steps</h3>
                  <div className="editor-steplist">
                    {ch.steps.map((st, si) => (
                      <div
                        key={si}
                        className={`editor-nav-item editor-step-item${
                          selection.stepIndex === si ? " active" : ""
                        }`}
                      >
                        <button
                          className="nav-label"
                          onClick={() => selectStep(i, si)}
                        >
                          {pad2(si + 1)} · {st.title || `Step ${si + 1}`}
                        </button>
                        <div className="mini-btns">
                          <button
                            className="mini-btn"
                            onClick={() => moveStep(i, si, -1)}
                            disabled={si === 0}
                            aria-label="Move step up"
                          >
                            ↑
                          </button>
                          <button
                            className="mini-btn"
                            onClick={() => moveStep(i, si, 1)}
                            disabled={si === ch.steps.length - 1}
                            aria-label="Move step down"
                          >
                            ↓
                          </button>
                          <button
                            className="mini-btn danger"
                            onClick={() => removeStep(i, si)}
                            disabled={ch.steps.length <= 1}
                            aria-label="Remove step"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="add-btn" onClick={() => addStep(i)}>
                    + Add step
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        <button className="add-btn" onClick={addChapter}>
          + Add chapter
        </button>
      </section>

      {selection.stepIndex != null ? (
        <StepEditor ci={ci} si={selection.stepIndex} />
      ) : null}
    </>
  );
}
