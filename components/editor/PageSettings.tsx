"use client";

/* Page configuration — size, orientation, margins, header/footer (mm). */
import type { PageSize } from "@/lib/book-schema";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const SIZES: PageSize[] = ["A4", "Letter", "A5", "Legal", "Custom"];

export default function PageSettings() {
  const cfg = useEditor((s) => s.book.pageConfig) ?? DEFAULT_PAGE_CONFIG;
  const update = useEditor((s) => s.updatePageConfig);

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Page</h2>
      <div className="editor-field">
        <label htmlFor="pg-size">Size</label>
        <select
          id="pg-size"
          value={cfg.size}
          onChange={(e) => update({ size: e.target.value as PageSize })}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="editor-field">
        <label htmlFor="pg-orientation">Orientation</label>
        <select
          id="pg-orientation"
          value={cfg.orientation}
          onChange={(e) => update({ orientation: e.target.value as "portrait" | "landscape" })}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </div>
      <div className="editor-field">
        <label htmlFor="pg-margin">Margin (mm)</label>
        <input
          id="pg-margin"
          type="number"
          min={0}
          value={cfg.margins.left}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            update({ margins: { top: v, right: v, bottom: v, left: v } });
          }}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="pg-header">Header (mm)</label>
        <input
          id="pg-header"
          type="number"
          min={0}
          value={cfg.headerH}
          onChange={(e) => update({ headerH: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="pg-footer">Footer (mm)</label>
        <input
          id="pg-footer"
          type="number"
          min={0}
          value={cfg.footerH}
          onChange={(e) => update({ footerH: Number(e.target.value) || 0 })}
        />
      </div>
    </section>
  );
}
