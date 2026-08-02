"use client";

/*
 * Editor root. Seeds a per-tree Zustand store from the server-loaded book and
 * lays out the two panes with a draggable divider so the left controls/canvas
 * area can be widened.
 */
import { useRef, useState } from "react";
import type { Book } from "@/lib/book-schema";
import { EditorStoreProvider } from "@/lib/store";
import AnnotationDeleteController from "./AnnotationDeleteController";
import EphemeralNotice from "./EphemeralNotice";
import LeftPane from "./LeftPane";
import PreviewPane from "./PreviewPane";
import Toast from "./Toast";
import "./editor.css";

const MIN_W = 320;
const MAX_W = 760;

export default function EditorApp({
  initialBook,
  projectSlug,
}: {
  initialBook: Book;
  projectSlug: string;
}) {
  const [leftW, setLeftW] = useState(420);
  const dragging = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setLeftW(Math.max(MIN_W, Math.min(MAX_W, e.clientX)));
  };
  const onUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <EditorStoreProvider initialBook={initialBook} projectSlug={projectSlug}>
      <div className="editor-shell">
        <EphemeralNotice />
        <div
          className="editor"
          style={{ ["--left-w" as string]: `${leftW}px` }}
        >
          <LeftPane />
          <div
            className="editor-resizer"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            role="separator"
            aria-orientation="vertical"
          />
          <PreviewPane />
        </div>
        <AnnotationDeleteController />
        <Toast />
      </div>
    </EditorStoreProvider>
  );
}
