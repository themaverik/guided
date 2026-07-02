"use client";

/*
 * Right pane — the live render. Renders <A4Book> from store state, scaled to fit
 * the pane (transform: scale, origin top-center). Page navigation (prev/next +
 * indicator) lives OUTSIDE the scaled element, in the toolbar. Selecting a step
 * on the left scrolls and highlights the matching page. Overflows reported by
 * the auto-fit pass surface as a non-blocking warning.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import A4Book from "@/components/renderer/A4Book";
import { bookFitKey, selectionPageIndex, totalPages } from "@/lib/book-render";
import { assetBaseFor } from "@/lib/project-routes";
import { useEditor } from "@/lib/store";
import { useAutosave } from "@/lib/use-autosave";
import { DEFAULT_PAGE_CONFIG, stepLayoutMode } from "@/lib/book-schema";
import AnnotationPalette from "./AnnotationPalette";
import PreviewAnnotations from "./PreviewAnnotations";
import PreviewCellFloat from "./PreviewCellFloat";
import PreviewGridResize from "./PreviewGridResize";
import PreviewGridSelect from "./PreviewGridSelect";

const SAVE_LABEL: Record<string, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

// 210mm in CSS px at 96dpi — the natural width of one A4 page.
const PAGE_W_PX = (210 * 96) / 25.4;

export default function PreviewPane() {
  const book = useEditor((s) => s.book);
  const selection = useEditor((s) => s.selection);
  const overflows = useEditor((s) => s.overflows);
  const setOverflows = useEditor((s) => s.setOverflows);
  const projectSlug = useEditor((s) => s.projectSlug);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const hideGridChrome = useEditor((s) => s.hideGridChrome);
  const toggleGridChrome = useEditor((s) => s.toggleGridChrome);
  const saveStatus = useAutosave();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(0.5);
  const [naturalH, setNaturalH] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const pageCount = totalPages(book);

  // Fit the page width to the pane.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () => {
      const usable = el.clientWidth - 40;
      setScale(Math.min(1, Math.max(0.15, usable / PAGE_W_PX)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track the unscaled content height so the scroll area matches the scaled view.
  useLayoutEffect(() => {
    const el = scalerRef.current;
    if (!el) return;
    const measure = () => setNaturalH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Selection → which page to focus.
  useEffect(() => {
    setCurrentPage(
      selectionPageIndex(book, selection.chapterIndex, selection.stepIndex),
    );
  }, [book, selection.chapterIndex, selection.stepIndex]);

  // Highlight + scroll the focused page into view.
  useEffect(() => {
    const scroller = scrollRef.current;
    const scaler = scalerRef.current;
    if (!scroller || !scaler) return;
    const pages = scaler.querySelectorAll<HTMLElement>(".page");
    pages.forEach((p, i) => p.classList.toggle("page--active", i === currentPage));
    const target = pages[currentPage];
    if (!target) return;
    const pr = scroller.getBoundingClientRect();
    const er = target.getBoundingClientRect();
    const top = scroller.scrollTop + (er.top - pr.top) - 16;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentPage, scale, naturalH]);

  const go = useCallback(
    (delta: number) =>
      setCurrentPage((p) => Math.min(pageCount - 1, Math.max(0, p + delta))),
    [pageCount],
  );

  const selStep =
    selection.stepIndex != null
      ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
      : null;
  const isGridStep = selStep ? stepLayoutMode(selStep) === "grid" : false;

  return (
    <div className="editor-right">
      <div className="preview-toolbar">
        <button onClick={() => go(-1)} disabled={currentPage <= 0}>
          ‹ Prev
        </button>
        <span className="page-indicator">
          Page {currentPage + 1} / {pageCount}
        </span>
        <button onClick={() => go(1)} disabled={currentPage >= pageCount - 1}>
          Next ›
        </button>
        {overflows.length > 0 ? (
          <span className="overflow-warn">
            {overflows.length} page{overflows.length === 1 ? "" : "s"} overflow
          </span>
        ) : null}
        {isGridStep ? (
          <button onClick={toggleGridChrome}>
            {hideGridChrome ? "Show grid" : "Hide grid"}
          </button>
        ) : null}
        <span className="spacer" />
        {saveStatus !== "idle" ? (
          <span className={`save-status ${saveStatus}`}>
            {SAVE_LABEL[saveStatus]}
          </span>
        ) : null}
        <a
          href={`/api/projects/${projectSlug}/download`}
          download
        >
          Download
        </a>
        <a
          href={`/${projectSlug}/print`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Print
        </a>
        <a
          className="print-link"
          href={`/api/projects/${projectSlug}/pdf`}
        >
          Export PDF
        </a>
      </div>

      <div className="preview-scroll" ref={scrollRef}>
        <div
          className="preview-sizer"
          style={{ height: naturalH ? naturalH * scale : undefined }}
        >
          <div
            className={`preview-scaler${hideGridChrome ? " chrome-hidden" : ""}`}
            ref={scalerRef}
            style={{ transform: `scale(${scale})` }}
          >
            <A4Book
              book={book}
              assetBase={assetBaseFor(projectSlug)}
              onReport={setOverflows}
            />
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 && !hideGridChrome ? (
                <PreviewGridSelect
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                  selected={
                    selection.cellIndex != null && selection.rowIndex != null
                      ? { ri: selection.rowIndex, cellIndex: selection.cellIndex }
                      : null
                  }
                />
              ) : null;
            })()}
            {selection.stepIndex != null ? (
              <PreviewAnnotations
                scalerRef={scalerRef}
                pageIndex={currentPage}
                ci={selection.chapterIndex}
                si={selection.stepIndex}
                annotations={
                  book.chapters[selection.chapterIndex]?.steps[
                    selection.stepIndex
                  ]?.annotations ?? []
                }
                fitKey={bookFitKey(book)}
                scale={scale}
                selectedId={selectedAnnotation}
                gridMode={(() => {
                  const s =
                    book.chapters[selection.chapterIndex]?.steps[selection.stepIndex];
                  return s ? stepLayoutMode(s) === "grid" && !hideGridChrome : false;
                })()}
              />
            ) : null}
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 && !hideGridChrome ? (
                <PreviewGridResize
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  pageConfig={book.pageConfig ?? DEFAULT_PAGE_CONFIG}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                />
              ) : null;
            })()}
            {(() => {
              const sel =
                selection.stepIndex != null
                  ? book.chapters[selection.chapterIndex]?.steps[selection.stepIndex]
                  : null;
              return sel && stepLayoutMode(sel) === "grid" && sel.grid && sel.grid.length > 0 && !hideGridChrome ? (
                <PreviewCellFloat
                  scalerRef={scalerRef}
                  pageIndex={currentPage}
                  ci={selection.chapterIndex}
                  si={selection.stepIndex!}
                  grid={sel.grid}
                  fitKey={bookFitKey(book)}
                  scale={scale}
                  selectedObjId={selection.objectId ?? null}
                />
              ) : null;
            })()}
          </div>
        </div>
      </div>
      {selection.stepIndex != null ? (
        <AnnotationPalette ci={selection.chapterIndex} si={selection.stepIndex} />
      ) : null}
    </div>
  );
}
