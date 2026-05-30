"use client";

/* Left controls pane — composes book settings, chapter/step structure, and the
 * row/callout editor for the selected step. */
import BackgroundSettings from "./BackgroundSettings";
import BookSettings from "./BookSettings";
import ChapterList from "./ChapterList";
import EndingSettings from "./EndingSettings";
import ThemeSettings from "./ThemeSettings";
import WatermarkSettings from "./WatermarkSettings";

export default function LeftPane() {
  return (
    <aside className="editor-left">
      <BookSettings />
      <ThemeSettings />
      <BackgroundSettings />
      <WatermarkSettings />
      <ChapterList />
      <EndingSettings />
      <footer className="editor-foot">
        <a href="/" target="_blank" rel="noreferrer">
          Guided
        </a>
        <span>·</span>
        <a href="/terms" target="_blank" rel="noreferrer">
          Terms
        </a>
        <span>·</span>
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </footer>
    </aside>
  );
}
