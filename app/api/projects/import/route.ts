/*
 * Import a project from a downloaded .zip (book.json + assets). Creates a new
 * project and returns its slug. The archive's top-level folder (the old slug)
 * is stripped so files land at the project root.
 */
import { NextResponse } from "next/server";
import type { Book } from "@/lib/book-schema";
import { importProject } from "@/lib/project-store";
import { readZip } from "@/lib/unzip";

export const runtime = "nodejs";

// Project archives are store-only zips (lib/zip.ts), so the wire size tracks
// the raw size; readZip additionally caps total decompressed bytes.
const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: "archive too large" }, { status: 413 });
  }

  let entries;
  try {
    entries = readZip(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return NextResponse.json(
      { error: `could not read zip: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // Find book.json and strip the archive's top-level folder from every path.
  const bookEntry = entries.find(
    (e) => e.name === "book.json" || e.name.endsWith("/book.json"),
  );
  if (!bookEntry) {
    return NextResponse.json({ error: "archive has no book.json" }, { status: 400 });
  }
  const slash = bookEntry.name.lastIndexOf("/book.json");
  const topDir = slash > 0 ? bookEntry.name.slice(0, slash + 1) : "";
  const files = entries.map((e) => ({
    name: e.name.startsWith(topDir) ? e.name.slice(topDir.length) : e.name,
    data: e.data,
  }));

  let name = "Imported project";
  try {
    const book = JSON.parse(bookEntry.data.toString("utf8")) as Book;
    if (book.title) name = book.title;
  } catch {
    return NextResponse.json({ error: "book.json is not valid JSON" }, { status: 400 });
  }

  try {
    const meta = await importProject(name, files);
    return NextResponse.json(meta, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
