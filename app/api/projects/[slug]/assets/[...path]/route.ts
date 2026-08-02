/*
 * Serve a project asset from data/projects/<slug>/assets/<...path>. Assets live
 * outside the static public/ tree, so they are streamed through this route with
 * a path-traversal guard (readAsset).
 */
import path from "node:path";
import { NextResponse } from "next/server";
import { readAsset } from "@/lib/project-store";

export const runtime = "nodejs";

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

type Ctx = { params: Promise<{ slug: string; path: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, path: segments } = await params;
  const rel = (segments ?? []).join("/");
  const bytes = await readAsset(slug, rel);
  if (bytes === null) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = path.extname(rel).toLowerCase();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": CONTENT_TYPE[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}
