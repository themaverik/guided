/*
 * Ephemeral per-project store (ADR-005). Each project is a directory under
 * data/projects/<slug>/ holding book.json + meta.json + assets/. No database;
 * the filesystem is the store. Projects expire ~1h after their last update; the
 * sweep runs opportunistically from the project API routes.
 *
 * Server-only (uses fs). This slice is the foundation; routing/UI/asset
 * re-pointing land in the next slice.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Book } from "./book-schema";
import { CURRENT_SCHEMA_VERSION, DEFAULT_PAGE_CONFIG } from "./book-schema";
import { migrateBook } from "./book-migrate";

export const DATA_ROOT = path.join(process.cwd(), "data", "projects");
// Idle TTL before a project is swept. Default is 1 day (1440 min); override
// with GUIDED_PROJECT_TTL_MIN if a deployment wants a different window.
export const PROJECT_TTL_MS =
  Number(process.env.GUIDED_PROJECT_TTL_MIN ?? 1440) * 60 * 1000;

/** Slugs that must never be assigned to a user project. */
export const RESERVED_SLUGS = new Set([
  "demo",
  "quickstart",
  "terms",
  "privacy",
  "api",
  "assets",
  "print",
  "new",
  "_next",
]);

export interface ProjectMeta {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Base slug from a project name: lowercase, non-alphanumerics → hyphens. */
export function baseSlug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  return s || "project";
}

const projectDir = (slug: string) => path.join(DATA_ROOT, slug);
const metaPath = (slug: string) => path.join(projectDir(slug), "meta.json");
const bookPath = (slug: string) => path.join(projectDir(slug), "book.json");
export const assetDir = (slug: string, chapterId: string) =>
  path.join(projectDir(slug), "assets", chapterId.replace(/[^a-zA-Z0-9._-]/g, ""));

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** A unique, non-reserved slug derived from `name`, deduped against existing. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = baseSlug(name);
  let candidate = base;
  let n = 1;
  while (RESERVED_SLUGS.has(candidate) || (await exists(projectDir(candidate)))) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** A minimal starter book for a brand-new project. */
export function defaultBook(name: string): Book {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pageConfig: DEFAULT_PAGE_CONFIG,
    title: name,
    subtitle: "",
    author: "",
    edition: "",
    cover: "",
    chapters: [
      {
        id: "chapter1",
        title: "Chapter 1",
        description: "",
        steps: [{ title: "Step 1", instruction: "", image: "", layout: "single" }],
      },
    ],
  };
}

export async function createProject(name: string): Promise<ProjectMeta> {
  await sweepExpired();
  const slug = await uniqueSlug(name);
  const now = Date.now();
  const meta: ProjectMeta = { slug, name, createdAt: now, updatedAt: now };
  await mkdir(projectDir(slug), { recursive: true });
  await writeFile(metaPath(slug), JSON.stringify(meta, null, 2), "utf8");
  await writeFile(
    bookPath(slug),
    JSON.stringify(defaultBook(name), null, 2),
    "utf8",
  );
  return meta;
}

export async function projectExists(slug: string): Promise<boolean> {
  return exists(bookPath(slug));
}

/** Create a project at a specific slug from a given book (used to seed /demo). */
export async function seedProject(
  slug: string,
  name: string,
  book: Book,
): Promise<ProjectMeta> {
  const now = Date.now();
  const meta: ProjectMeta = { slug, name, createdAt: now, updatedAt: now };
  await mkdir(projectDir(slug), { recursive: true });
  await writeFile(metaPath(slug), JSON.stringify(meta, null, 2), "utf8");
  await writeFile(bookPath(slug), JSON.stringify(book, null, 2), "utf8");
  return meta;
}

export const assetsRoot = (slug: string) =>
  path.join(projectDir(slug), "assets");

/**
 * Create a new project from imported files (project-relative paths, e.g.
 * "book.json", "assets/chapter1/x.png"). Writes them under a fresh slug and a
 * fresh meta. Path-traversal guarded. Requires a book.json among the files.
 */
export async function importProject(
  name: string,
  files: { name: string; data: Buffer }[],
): Promise<ProjectMeta> {
  const slug = await uniqueSlug(name);
  const dir = projectDir(slug);
  await mkdir(dir, { recursive: true });

  let hasBook = false;
  for (const f of files) {
    const rel = f.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel === "meta.json") continue; // meta is regenerated
    const target = path.normalize(path.join(dir, rel));
    if (target !== dir && !target.startsWith(dir + path.sep)) continue; // traversal
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, f.data);
    if (rel === "book.json") hasBook = true;
  }
  if (!hasBook) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("archive has no book.json");
  }

  const now = Date.now();
  const meta: ProjectMeta = { slug, name, createdAt: now, updatedAt: now };
  await writeFile(metaPath(slug), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

/**
 * Resolve a relative asset path under a project's assets dir, guarding against
 * path traversal. Returns the absolute path if it exists, else null.
 */
export async function resolveAsset(
  slug: string,
  rel: string,
): Promise<string | null> {
  const baseDir = assetsRoot(slug);
  const target = path.normalize(path.join(baseDir, rel));
  if (target !== baseDir && !target.startsWith(baseDir + path.sep)) return null;
  return (await exists(target)) ? target : null;
}

export async function loadProjectBook(slug: string): Promise<Book> {
  const raw = await readFile(bookPath(slug), "utf8");
  return migrateBook(JSON.parse(raw) as Book);
}

export async function saveProjectBook(slug: string, book: Book): Promise<void> {
  await writeFile(bookPath(slug), JSON.stringify(book, null, 2), "utf8");
  await touch(slug);
}

export async function loadMeta(slug: string): Promise<ProjectMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(slug), "utf8")) as ProjectMeta;
  } catch {
    return null;
  }
}

/** Bump updatedAt so the project's TTL window resets. */
export async function touch(slug: string): Promise<void> {
  const meta = await loadMeta(slug);
  if (!meta) return;
  meta.updatedAt = Date.now();
  await writeFile(metaPath(slug), JSON.stringify(meta, null, 2), "utf8");
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const slugs = await readdir(DATA_ROOT);
    const metas = await Promise.all(slugs.map((s) => loadMeta(s)));
    return metas
      .filter((m): m is ProjectMeta => m !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Gather every file in a project (relative paths) for download/zip. */
export async function collectProjectFiles(
  slug: string,
): Promise<{ name: string; data: Buffer }[]> {
  const base = projectDir(slug);
  const out: { name: string; data: Buffer }[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(abs, r);
      else out.push({ name: r, data: await readFile(abs) });
    }
  }
  await walk(base, "");
  return out;
}

/** Delete projects idle longer than the TTL. Returns the slugs removed. */
export async function sweepExpired(ttlMs = PROJECT_TTL_MS): Promise<string[]> {
  const cutoff = Date.now() - ttlMs;
  const removed: string[] = [];
  for (const meta of await listProjects()) {
    if (meta.updatedAt < cutoff) {
      await rm(projectDir(meta.slug), { recursive: true, force: true });
      removed.push(meta.slug);
    }
  }
  return removed;
}
