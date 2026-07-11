/*
 * Read/parse the hand-editable config at public/book.js. The file assigns
 * `window.BOOK = { ... }` so it also works opened as a static file; here we
 * evaluate it with a `window` shim and return the typed object.
 *
 * Server-only (uses fs). Phase 5 adds the write side (serialize back to
 * `window.BOOK = …`) and the API routes.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Book } from "./book-schema";
import { migrateBook } from "./book-migrate";

export const BOOK_JS_PATH = path.join(process.cwd(), "public", "book.js");

const BOOK_JS_HEADER = `// Guidebook config. The single source of truth for the document.
// Written by the editor and also hand-editable. Keep the
// \`window.BOOK = \` assignment so this file works whether opened
// directly (file://) or served over http://.`;

/** Serialize a Book back to the hand-editable \`window.BOOK = {…}\` source. */
export function serializeBook(book: Book): string {
  return `${BOOK_JS_HEADER}\nwindow.BOOK = ${JSON.stringify(book, null, 2)};\n`;
}

/** Write the book to public/book.js in the same format the prototype used. */
export async function writeBook(book: Book): Promise<void> {
  await writeFile(BOOK_JS_PATH, serializeBook(book), "utf8");
}

/** Evaluate a `window.BOOK = {…}` source string into a Book object. */
export function parseBookSource(source: string): Book {
  const shim: { BOOK?: Book } = {};
  // The file is trusted project config (not user input). Evaluate with only a
  // `window` shim in scope.
  const fn = new Function("window", source);
  fn(shim);
  if (!shim.BOOK) {
    throw new Error("book.js did not assign window.BOOK");
  }
  return migrateBook(shim.BOOK);
}

/** Load and parse public/book.js from disk. */

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
