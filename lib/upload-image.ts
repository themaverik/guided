import { uploadApiFor } from "@/lib/project-routes";

/** Client mirror of the server's accepted image extensions (server-paths.IMAGE_RE
 *  is server-only). Server validation remains authoritative; this is UX only. */
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i;

/** True if `name` looks like a supported image by extension. */
export function isImageFile(name: string): boolean {
  return IMAGE_RE.test(name);
}

/** POST a file to the project's upload endpoint under `chapterId`; returns the
 *  stored filename or an error message. Never throws. */
export async function uploadImage(
  slug: string,
  chapterId: string,
  file: File,
): Promise<{ filename: string } | { error: string }> {
  try {
    const fd = new FormData();
    fd.append("chapterId", chapterId);
    fd.append("file", file);
    const res = await fetch(uploadApiFor(slug), { method: "POST", body: fd });
    const data = (await res.json()) as { filename?: string; error?: string };
    if (!res.ok || !data.filename) return { error: data.error ?? "upload failed" };
    return { filename: data.filename };
  } catch {
    return { error: "upload failed" };
  }
}
