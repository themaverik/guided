/*
 * Server-only book loading helpers (uses fs). Per-project persistence lives in
 * lib/project-store.ts; this module only loads the committed demo seed.
 *
 * The legacy `window.BOOK = {…}` (public/book.js) read/write path was removed
 * with the 0.1.0 security hardening — it was dead code and evaluated the file
 * with `new Function`. Projects are seeded from JSON only.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Book } from "./book-schema";
import { migrateBook } from "./book-migrate";

/** The committed demo seed (public/example/book.json) used to seed /demo. */
export const EXAMPLE_BOOK_PATH = path.join(
  process.cwd(),
  "public",
  "example",
  "book.json",
);

export async function loadExampleBook(): Promise<Book> {
  return migrateBook(JSON.parse(await readFile(EXAMPLE_BOOK_PATH, "utf8")) as Book);
}
