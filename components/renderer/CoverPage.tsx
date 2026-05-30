/* Combined cover + table of contents (page 1). No hero — the TOC carries it. */
import type {
  Background,
  Book,
  Watermark as WatermarkData,
} from "@/lib/book-schema";
import { type ChapterPaging, pad2 } from "@/lib/book-render";
import PageBackground from "./PageBackground";
import Watermark from "./Watermark";

export default function CoverPage({
  book,
  paging,
  watermark,
  background,
}: {
  book: Book;
  paging: ChapterPaging[];
  watermark?: WatermarkData;
  background?: Background;
}) {
  return (
    <section
      className="page page--cream"
      data-screen-label="00 Cover & Contents"
    >
      <PageBackground background={background} />
      <Watermark watermark={watermark} />
      <div className="page-inner cover">
        <div>
          <div className="cover-meta">
            A Guidebook · {book.chapters.length} chapters
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6mm" }}>
          <h1 className="cover-title">{book.title}</h1>
          <p className="cover-sub">{book.subtitle}</p>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: "5mm",
          }}
        >
          <div className="toc-eyebrow">Contents</div>
          <ul className="toc-list">
            {book.chapters.map((ch, i) => {
              const steps = ch.steps.length;
              const sub = `${steps} step${steps === 1 ? "" : "s"} · ${ch.description.slice(0, 80)}${
                ch.description.length > 80 ? "…" : ""
              }`;
              return (
                <li className="toc-item" key={ch.id}>
                  <span className="toc-num">{pad2(i + 1)}</span>
                  <div className="toc-title-row">
                    <span className="toc-chap-title">{ch.title}</span>
                    <span className="toc-chap-sub">{sub}</span>
                  </div>
                  <span className="toc-pageno">
                    p. {pad2(paging[i].introPage)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="cover-footer">
          <span>{book.author}</span>
          <span>{book.edition}</span>
        </div>
      </div>
    </section>
  );
}
