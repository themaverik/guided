/*
 * Per-project book persistence. GET loads the project's book.json; PUT saves it
 * (and bumps the TTL via the store's touch). Replaces the single-file /api/book.
 */
import { NextResponse } from "next/server";
import type { Book } from "@/lib/book-schema";
import {
  loadProjectBook,
  projectExists,
  saveProjectBook,
} from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!(await projectExists(slug))) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  return NextResponse.json(await loadProjectBook(slug));
}

export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!(await projectExists(slug))) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  let book: Book;
  try {
    book = (await req.json()) as Book;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!book || !Array.isArray(book.chapters)) {
    return NextResponse.json(
      { error: "body is not a valid book" },
      { status: 400 },
    );
  }
  await saveProjectBook(slug, book);
  return NextResponse.json({ ok: true });
}
