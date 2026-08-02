/*
 * Server-only book loading helpers (uses fs). Per-project persistence lives in
 * lib/project-store.ts; this module only loads the committed demo seed.
 *
 * The legacy `window.BOOK = {…}` (public/book.js) read/write path was removed
 * with the 0.1.0 security hardening — it was dead code and evaluated the file
 * with `new Function`. Projects are seeded from JSON only.
 */
import type { Book } from "./book-schema";
import { migrateBook } from "./book-migrate";
// Static import so the demo seed is bundled with the server code — a runtime
// fs read of public/ is not traced into serverless deployments.
import exampleBook from "../public/example/book.json";

export async function loadExampleBook(): Promise<Book> {
  return migrateBook(structuredClone(exampleBook) as unknown as Book);
}
