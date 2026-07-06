"use client";

/*
 * Debounced autosave. Watches the book in the store and, ~800ms after the last
 * edit, PUTs it to /api/book (which writes public/book.js) and mirrors it to
 * localStorage for crash recovery. The first run is skipped so loading the page
 * doesn't immediately rewrite the file. The file stays authoritative on load
 * (the editor reads it server-side), so hand-edits are respected; localStorage
 * is only a backup, not auto-restored.
 */
import { useEffect, useRef, useState } from "react";
import type { Book } from "./book-schema";
import { bookApiFor } from "./project-routes";
import { useEditor } from "./store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const LOCALSTORAGE_PREFIX = "guidebook:book:";

export function useAutosave(debounceMs = 800): SaveStatus {
  const book = useEditor((s) => s.book);
  const slug = useEditor((s) => s.projectSlug);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Demo is a disposable sandbox: never mirrored to localStorage, never PUT to
    // the server — edits live only in memory for the session (rev4 Task 1).
    if (slug === "demo") {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(slug, book, setStatus), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [book, slug, debounceMs]);

  return status;
}

async function save(
  slug: string,
  book: Book,
  setStatus: (s: SaveStatus) => void,
) {
  try {
    localStorage.setItem(LOCALSTORAGE_PREFIX + slug, JSON.stringify(book));
  } catch {
    // localStorage may be unavailable/full — non-fatal.
  }
  try {
    const res = await fetch(bookApiFor(slug), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(book),
    });
    setStatus(res.ok ? "saved" : "error");
  } catch {
    setStatus("error");
  }
}
