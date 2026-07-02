"use client";

/*
 * Global Delete/Backspace shortcut for the selected annotation. Opens the confirm
 * modal (via requestDeleteAnnotation) rather than deleting directly. The pure
 * shouldHandleDeleteKey guard skips inputs/textarea/select/contenteditable so
 * editing text is never hijacked. Editor-only.
 */
import { useEffect } from "react";
import { shouldHandleDeleteKey } from "@/lib/keyboard";
import { useEditor } from "@/lib/store";

export function useAnnotationDeleteKey() {
  const selection = useEditor((s) => s.selection);
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation);
  const requestDeleteAnnotation = useEditor((s) => s.requestDeleteAnnotation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleDeleteKey(e.key, document.activeElement, selectedAnnotation != null)) {
        return;
      }
      if (selection.stepIndex == null || selectedAnnotation == null) return;
      e.preventDefault();
      requestDeleteAnnotation(selection.chapterIndex, selection.stepIndex, selectedAnnotation);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, selectedAnnotation, requestDeleteAnnotation]);
}
