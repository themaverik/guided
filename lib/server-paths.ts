/* Server-only path helpers for the public/ asset tree + filename safety. */
import path from "node:path";

export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Strip anything that could escape a folder/file name (path traversal, slashes). */
export function safeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "").replace(/\.{2,}/g, ".");
}

/** Absolute path to a chapter's image folder under public/. */
export function chapterDir(chapterId: string): string {
  return path.join(process.cwd(), "public", safeSegment(chapterId));
}
