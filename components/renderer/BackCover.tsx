/* Closing page (cream). Port of `renderBackCover`. */
import type {
  Background,
  Book,
  Watermark as WatermarkData,
} from "@/lib/book-schema";
import PageBackground from "./PageBackground";
import RichText from "./RichText";
import Watermark from "./Watermark";

const DEFAULT_ENDING = {
  eyebrow: "End",
  title: "Thank you for reading.",
  body: "",
};

export default function BackCover({
  book,
  watermark,
  background,
}: {
  book: Book;
  watermark?: WatermarkData;
  background?: Background;
}) {
  return (
    <section className="page page--cream" data-screen-label="ZZ Back">
      <PageBackground background={background} />
      <Watermark watermark={watermark} />
      <div className="page-inner" style={{ justifyContent: "space-between" }}>
        <div />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8mm",
            alignItems: "flex-start",
          }}
        >
          <div className="cover-meta">
            {book.ending?.eyebrow ?? DEFAULT_ENDING.eyebrow}
          </div>
          <h2 className="chap-title">
            {book.ending?.title ?? DEFAULT_ENDING.title}
          </h2>
          <RichText
            className="chap-desc"
            as="div"
            block
            text={book.ending?.body ?? DEFAULT_ENDING.body}
          />
        </div>
        <div className="cover-footer">
          <span>{book.author}</span>
          <span>{book.edition}</span>
        </div>
      </div>
    </section>
  );
}
