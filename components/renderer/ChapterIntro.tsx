/* Chapter intro page (cream). Page range computed from real paging. */
import type {
  Background,
  Chapter,
  ChapterCoverImage,
  ImageFit,
  Watermark as WatermarkData,
} from "@/lib/book-schema";
import { type ChapterPaging, pad2, pageInkVars } from "@/lib/book-render";
import PageBackground from "./PageBackground";
import PageFooter from "./PageFooter";
import RichText from "./RichText";
import Watermark from "./Watermark";

/** ImageFit → CSS object-fit (fit-width/fit-height crop like a cover fit;
 *  the grid-cell anchor bias doesn't apply to a freely-placed image). */
const COVER_IMG_OBJECT_FIT: Record<ImageFit, "contain" | "cover"> = {
  contain: "contain",
  "fit-width": "cover",
  "fit-height": "cover",
};

export default function ChapterIntro({
  chapter,
  index,
  paging,
  watermark,
  background,
  pageTextColor,
  coverImage,
}: {
  chapter: Chapter;
  index: number;
  paging: ChapterPaging;
  watermark?: WatermarkData;
  background?: Background;
  pageTextColor?: string;
  coverImage?: ChapterCoverImage;
}) {
  const num = pad2(index + 1);
  const steps = chapter.steps.length;
  const range =
    steps > 0
      ? `pages ${paging.firstStepPage}–${paging.lastStepPage}`
      : "no steps yet";

  return (
    <section
      className="page page--cream"
      data-screen-label={`${num} ${chapter.title} — intro`}
      style={pageInkVars(pageTextColor)}
    >
      <PageBackground background={background} />
      {coverImage?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="chap-cover-img"
          aria-hidden
          alt=""
          src={coverImage.image}
          style={{
            left: `${coverImage.x * 100}%`,
            top: `${coverImage.y * 100}%`,
            width: `${coverImage.w * 100}%`,
            height: `${coverImage.h * 100}%`,
            objectFit: COVER_IMG_OBJECT_FIT[coverImage.fit ?? "contain"],
          }}
        />
      ) : null}
      <Watermark watermark={watermark} />
      <div className="page-inner">
        <div className="chap-eyebrow">Chapter {num}</div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "10mm",
          }}
        >
          <h1 className="chap-num">{num}</h1>
          <h2 className="chap-title">{chapter.title}</h2>
          <div className="chap-rule" />
          <RichText className="chap-desc" as="div" block text={chapter.description} />
          <div className="chap-steps-count">
            {steps} step{steps === 1 ? "" : "s"} · {range}
          </div>
        </div>
      </div>
      <PageFooter left={`Chapter ${num}`} right={chapter.title} />
    </section>
  );
}
