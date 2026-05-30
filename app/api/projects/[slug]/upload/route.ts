/*
 * Per-project image upload. POST multipart { chapterId, file } → saves to
 * data/projects/<slug>/assets/<chapterId>/<file> and returns the bare filename.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { assetDir, projectExists, touch } from "@/lib/project-store";
import { IMAGE_RE, safeSegment } from "@/lib/server-paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!(await projectExists(slug))) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const chapterId = safeSegment(String(form.get("chapterId") ?? ""));
  const file = form.get("file");
  if (!chapterId || !(file instanceof File)) {
    return NextResponse.json(
      { error: "missing chapterId or file" },
      { status: 400 },
    );
  }

  const filename = safeSegment(file.name);
  if (!IMAGE_RE.test(filename)) {
    return NextResponse.json(
      { error: "unsupported file type" },
      { status: 400 },
    );
  }

  try {
    const dir = assetDir(slug, chapterId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    await touch(slug);
    return NextResponse.json({ filename });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
