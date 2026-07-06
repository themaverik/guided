/*
 * The renderer entry point. Maps a `book` to a column of A4 pages:
 *   Cover/TOC → (Chapter intro → Step pages…) per chapter → Back cover.
 *
 * A4Book stays a server component: it computes paging and emits the pages as a
 * flat list of children (keyed Fragments add no DOM node, so the
 * `.page:last-child` print rule resolves against the real last page). The pages
 * are handed to <BookCanvas>, a thin client island that holds the `.book` ref
 * and runs auto-fit (Phase 2) without pulling the whole tree client-side.
 *
 * The watermark overlays every page, so it is passed down and rendered inside
 * each page component.
 */
import { Fragment } from "react";
import type { Book } from "@/lib/book-schema";
import {
  backgroundImageSrc,
  bookFitKey,
  computePaging,
  pageInkVars,
  themeVars,
  watermarkIconSrc,
} from "@/lib/book-render";
import { pageVars } from "@/lib/page-vars";
import BackCover from "./BackCover";
import BookCanvas from "./BookCanvas";
import ChapterIntro from "./ChapterIntro";
import CoverPage from "./CoverPage";
import StepPage from "./StepPage";
import "./renderer.css";

export interface A4BookProps {
  book: Book;
  /** Base URL for chapter assets, e.g. /api/projects/<slug>/assets. */
  assetBase: string;
  /** Receives the data-screen-labels of pages that still overflow after fit. */
  onReport?: (overflows: string[]) => void;
}

export default function A4Book({ book, assetBase, onReport }: A4BookProps) {
  const paging = computePaging(book);
  // Resolve the watermark logo to a URL for the current project so it survives
  // download/re-import (the stored value is a portable bare filename).
  const wm = book.watermark
    ? { ...book.watermark, icon: watermarkIconSrc(assetBase, book.watermark.icon) }
    : undefined;
  // Resolve the background image to a URL for the current project so it
  // survives download/re-import (the stored value is a portable bare filename).
  const bg = book.background
    ? { ...book.background, image: backgroundImageSrc(assetBase, book.background.image) }
    : undefined;

  return (
    <BookCanvas
      fitKey={bookFitKey(book)}
      onReport={onReport}
      rootStyle={{
        ...themeVars(book.theme),
        ...pageVars(book.pageConfig),
        ...pageInkVars(book.pageTextColor),
      }}
    >
      <CoverPage book={book} paging={paging} watermark={wm} background={bg} />
      {book.chapters.map((chapter, ci) => (
        <Fragment key={chapter.id}>
          <ChapterIntro
            chapter={chapter}
            index={ci}
            paging={paging[ci]}
            watermark={wm}
            background={bg}
          />
          {chapter.steps.map((step, si) => (
            <StepPage
              key={si}
              chapter={chapter}
              chapterIndex={ci}
              step={step}
              stepIndex={si}
              watermark={wm}
              background={bg}
              assetBase={assetBase}
            />
          ))}
        </Fragment>
      ))}
      <BackCover book={book} watermark={wm} background={bg} />
    </BookCanvas>
  );
}
