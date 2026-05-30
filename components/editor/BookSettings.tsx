"use client";

/* Book-level settings (Phase 4 scope; watermark controls arrive in Phase 6). */
import { useEditor } from "@/lib/store";

export default function BookSettings() {
  const book = useEditor((s) => s.book);
  const updateBookMeta = useEditor((s) => s.updateBookMeta);

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Book settings</h2>
      <div className="editor-field">
        <label htmlFor="bk-title">Title</label>
        <input
          id="bk-title"
          value={book.title}
          onChange={(e) => updateBookMeta({ title: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="bk-subtitle">Subtitle</label>
        <input
          id="bk-subtitle"
          value={book.subtitle}
          onChange={(e) => updateBookMeta({ subtitle: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="bk-author">Author</label>
        <input
          id="bk-author"
          value={book.author}
          onChange={(e) => updateBookMeta({ author: e.target.value })}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="bk-edition">Edition</label>
        <input
          id="bk-edition"
          value={book.edition}
          onChange={(e) => updateBookMeta({ edition: e.target.value })}
        />
      </div>
    </section>
  );
}
