"use client";

/* Closing-page (ending) controls: eyebrow, title, body text, and decor. */
import { useEditor } from "@/lib/store";
import PageDecorControls from "./PageDecorControls";
import RichTextArea from "./RichTextArea";

export default function EndingSettings() {
  const ending = useEditor((s) => s.book.ending);
  const slug = useEditor((s) => s.projectSlug);
  const updateEnding = useEditor((s) => s.updateEnding);

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Ending page</h2>
      <div className="editor-field">
        <label>Eyebrow</label>
        <input
          placeholder="End"
          value={ending?.eyebrow ?? ""}
          onChange={(e) => updateEnding({ eyebrow: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label>Title</label>
        <input
          placeholder="Thank you for reading."
          value={ending?.title ?? ""}
          onChange={(e) => updateEnding({ title: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label>Ending text</label>
        <RichTextArea
          rows={3}
          value={ending?.body ?? ""}
          onChange={(v) => updateEnding({ body: v })}
        />
      </div>

      <h3 className="editor-subtitle">Back-cover background</h3>
      <PageDecorControls
        background={ending?.background}
        textColor={ending?.pageTextColor}
        onBackground={(p) =>
          updateEnding({ background: { ...ending?.background, ...p } })
        }
        onTextColor={(c) => updateEnding({ pageTextColor: c })}
        slug={slug}
      />
    </section>
  );
}
