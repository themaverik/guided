/*
 * Pluggable blob storage behind the project store (ADR-008). Keys are flat
 * "<slug>/…" paths ("demo/book.json", "demo/assets/chapter1/a.png").
 *
 * Two drivers:
 *  - fs (default): data/projects/<key> on local disk — the ADR-005 behavior.
 *  - netlify-blobs: site-scoped Netlify Blobs store, selected by
 *    GUIDED_STORAGE=blobs or on a deployed Netlify build (see
 *    resolveDriverKind — local runs always stay on fs unless asked otherwise).
 *
 * Callers (lib/project-store.ts) validate slugs and relative paths BEFORE
 * building keys; drivers treat keys as opaque.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageDriver {
  read(key: string): Promise<Buffer | null>;
  write(key: string, data: Buffer): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** All keys starting with `prefix` (full keys, not names). */
  listKeys(prefix: string): Promise<string[]>;
  /** Delete every key under `prefix`. No-op when nothing matches. */
  removePrefix(prefix: string): Promise<void>;
}

// --- Filesystem driver (local dev / self-hosted) ---

export function createFsDriver(root: string): StorageDriver {
  const toPath = (key: string) => path.join(root, ...key.split("/"));
  return {
    async read(key) {
      try {
        return await readFile(toPath(key));
      } catch {
        return null;
      }
    },
    async write(key, data) {
      const p = toPath(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, data);
    },
    async exists(key) {
      try {
        await stat(toPath(key));
        return true;
      } catch {
        return false;
      }
    },
    async listKeys(prefix) {
      const out: string[] = [];
      const walk = async (dir: string, rel: string): Promise<void> => {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          const r = rel ? `${rel}/${ent.name}` : ent.name;
          if (ent.isDirectory()) await walk(path.join(dir, ent.name), r);
          else if (r.startsWith(prefix)) out.push(r);
        }
      };
      // Walk only the subtree the prefix names, when it maps to a directory.
      const dirPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : "";
      if (dirPrefix && !dirPrefix.includes("..")) {
        await walk(toPath(dirPrefix), dirPrefix);
      } else {
        await walk(root, "");
      }
      return out;
    },
    async removePrefix(prefix) {
      if (prefix.endsWith("/")) {
        await rm(toPath(prefix.slice(0, -1)), { recursive: true, force: true });
        return;
      }
      for (const key of await this.listKeys(prefix)) {
        await rm(toPath(key), { force: true });
      }
    },
  };
}

// --- Netlify Blobs driver (deployed) ---

function createBlobsDriver(): StorageDriver {
  // Lazy so local dev never needs the Netlify environment.
  const getBlobStore = async () => {
    const { getStore } = await import("@netlify/blobs");
    // Strong consistency: create → redirect → load must read its own write.
    return getStore({ name: "guided-projects", consistency: "strong" });
  };
  return {
    async read(key) {
      const store = await getBlobStore();
      const buf = await store.get(key, { type: "arrayBuffer" });
      return buf === null ? null : Buffer.from(buf);
    },
    async write(key, data) {
      const store = await getBlobStore();
      await store.set(key, new Blob([new Uint8Array(data)]));
    },
    async exists(key) {
      const store = await getBlobStore();
      return (await store.getMetadata(key)) !== null;
    },
    async listKeys(prefix) {
      const store = await getBlobStore();
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
    async removePrefix(prefix) {
      const store = await getBlobStore();
      const { blobs } = await store.list({ prefix });
      await Promise.all(blobs.map((b) => store.delete(b.key)));
    },
  };
}

// --- Selection ---

export const FS_ROOT = path.join(process.cwd(), "data", "projects");

/**
 * Which driver an environment asks for, in order:
 *  1. GUIDED_STORAGE=fs|blobs — explicit, wins everywhere. The deployed site
 *     sets "blobs"; a local `.env.local` can set either.
 *  2. A real Netlify deploy — its function filesystem is read-only, so blobs.
 *     `netlify dev` also sets NETLIFY=true, but that is a local run: exclude it
 *     via NETLIFY_DEV/NETLIFY_LOCAL so it does not masquerade as a deploy.
 *  3. fs — every other local run (`pnpm dev`, tests, self-hosted).
 */
export function resolveDriverKind(
  env: Record<string, string | undefined> = process.env,
): "fs" | "blobs" {
  if (env.GUIDED_STORAGE === "fs") return "fs";
  if (env.GUIDED_STORAGE === "blobs") return "blobs";
  const isLocalNetlifyDev =
    env.NETLIFY_DEV === "true" || env.NETLIFY_LOCAL === "true";
  return env.NETLIFY === "true" && !isLocalNetlifyDev ? "blobs" : "fs";
}

function selectDriver(): StorageDriver {
  return resolveDriverKind() === "blobs"
    ? createBlobsDriver()
    : createFsDriver(FS_ROOT);
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  driver ??= selectDriver();
  return driver;
}
