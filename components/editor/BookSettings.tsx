"use client";

/* Book-level settings (Phase 4 scope; watermark controls arrive in Phase 6). */
import { hasLegacySteps } from "@/lib/book-mutations";
import { useEditor } from "@/lib/store";

export default function BookSettings() {
  const book = useEditor((s) => s.book);
  const updateBookMeta = useEditor((s) => s.updateBookMeta);
  const migrateAllToGrid = useEditor((s) => s.migrateAllToGrid);
  const isDemo = useEditor((s) => s.projectSlug === "demo");
  const showMigrate = !isDemo && hasLegacySteps(book);

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
      {showMigrate ? (
        <div className="editor-field">
          <button
            className="add-btn"
            onClick={() => {
              if (
                window.confirm(
                  "Migrate every legacy step to the grid layout? Original row/callout data is kept, so this is safe and reversible per step.",
                )
              ) {
                migrateAllToGrid();
              }
            }}
          >
            Migrate all legacy steps to grid
          </button>
          <p className="editor-help">
            Converts every step still using the legacy row layout into an
            equivalent grid — additive, nothing is deleted, and any step can be
            switched back to Legacy afterwards from its Layout control.
          </p>
        </div>
      ) : null}
    </section>
  );
}
