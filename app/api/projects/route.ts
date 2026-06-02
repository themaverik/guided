/*
 * Projects collection. GET lists projects (newest first); POST creates a new
 * one from a name and returns its slug. Each call opportunistically sweeps
 * expired projects (ADR-005).
 */
import { NextResponse } from "next/server";
import type { Book } from "@/lib/book-schema";
import {
  createProject,
  importProject,
  listProjects,
  sweepExpired,
} from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await sweepExpired();
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(req: Request) {
  let name = "";
  let book: Book | undefined;
  try {
    const body = (await req.json()) as { name?: string; book?: Book };
    name = (body.name ?? "").trim();
    book = body.book;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "project name required" }, { status: 400 });
  }
  // If a book is supplied (e.g. restored from localStorage), seed with it.
  if (book && Array.isArray(book.chapters)) {
    const meta = await importProject(name, [
      { name: "book.json", data: Buffer.from(JSON.stringify(book, null, 2), "utf8") },
    ]);
    return NextResponse.json(meta, { status: 201 });
  }
  const meta = await createProject(name);
  return NextResponse.json(meta, { status: 201 });
}
