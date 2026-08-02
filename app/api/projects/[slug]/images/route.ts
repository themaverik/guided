/*
 * List the images already in a project chapter's asset folder, for the picker.
 * GET /api/projects/<slug>/images?chapterId=chapter1 → { images: string[] }.
 */
import { NextResponse } from "next/server";
import { listChapterAssets } from "@/lib/project-store";
import { IMAGE_RE, safeSegment } from "@/lib/server-paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const chapterId = safeSegment(
    new URL(req.url).searchParams.get("chapterId") ?? "",
  );
  if (!chapterId) return NextResponse.json({ images: [] });
  try {
    const files = await listChapterAssets(slug, chapterId);
    return NextResponse.json({
      images: files.filter((f) => IMAGE_RE.test(f)).sort(),
    });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
