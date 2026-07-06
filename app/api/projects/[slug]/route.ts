/*
 * Single-project resource. DELETE permanently discards a project (book, meta,
 * assets) — used by the homepage's "Discard" action (rev4 Task 6). Idempotent:
 * deleting an already-gone/expired project still returns 200.
 */
import { NextResponse } from "next/server";
import { deleteProject } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  await deleteProject(slug);
  return NextResponse.json({ ok: true });
}
