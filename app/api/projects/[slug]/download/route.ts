/*
 * Download a project as a .zip (book.json + meta.json + assets/). Built with the
 * dependency-free store-method zip writer.
 */
import { NextResponse } from "next/server";
import {
  collectProjectFiles,
  loadProjectBook,
  projectExists,
} from "@/lib/project-store";
import { downloadName } from "@/lib/server-paths";
import { buildZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!(await projectExists(slug))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const files = await collectProjectFiles(slug);
  const zip = buildZip(files.map((f) => ({ name: `${slug}/${f.name}`, data: f.data })));
  const name = downloadName((await loadProjectBook(slug)).title, slug);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}.zip"`,
    },
  });
}
