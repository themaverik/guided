"use client";

/*
 * Landing actions: Start a new project (prompts for a name → POST /api/projects
 * → navigate to /<slug>), View demo, View quickstart.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Book } from "@/lib/book-schema";

const LS_PREFIX = "guidebook:book:";

interface Recoverable {
  key: string;
  slug: string;
  title: string;
  book: Book;
}

export default function LandingActions() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [recoverable, setRecoverable] = useState<Recoverable[]>([]);

  // Surface any locally-mirrored books (crash/expiry recovery).
  useEffect(() => {
    try {
      const found: Recoverable[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(LS_PREFIX)) continue;
        try {
          const book = JSON.parse(localStorage.getItem(key) ?? "") as Book;
          if (Array.isArray(book?.chapters)) {
            found.push({
              key,
              slug: key.slice(LS_PREFIX.length),
              title: book.title || key.slice(LS_PREFIX.length),
              book,
            });
          }
        } catch {
          /* skip unparseable */
        }
      }
      setRecoverable(found);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const clearRecent = () => {
    if (recoverable.length === 0) return;
    const ok = window.confirm(
      `Clear ${recoverable.length} recovery checkpoint${
        recoverable.length === 1 ? "" : "s"
      } from this browser? This can't be undone.`,
    );
    if (!ok) return;
    try {
      for (const r of recoverable) localStorage.removeItem(r.key);
    } catch {
      /* localStorage unavailable */
    }
    setRecoverable([]);
  };

  const restore = async (item: Recoverable) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: item.title, book: item.book }),
      });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (res.ok && data.slug) router.push(`/${data.slug}`);
      else setError(data.error ?? "Could not restore");
    } catch {
      setError("Could not restore");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/projects/import", { method: "POST", body: fd });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (res.ok && data.slug) router.push(`/${data.slug}`);
      else setError(data.error ?? "Could not import project");
    } catch {
      setError("Could not import project");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a project name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (res.ok && data.slug) {
        router.push(`/${data.slug}`);
      } else {
        setError(data.error ?? "Could not create project");
      }
    } catch {
      setError("Could not create project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing-actions">
      {creating ? (
        <div className="landing-newform">
          <input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <button
            className="landing-btn primary"
            onClick={() => void create()}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      ) : (
        <button className="landing-btn primary" onClick={() => setCreating(true)}>
          Start a new project
        </button>
      )}

      <Link className="landing-btn" href="/demo">
        View demo project
      </Link>
      <Link className="landing-btn" href="/quickstart">
        View quickstart guide
      </Link>
      <button
        className="landing-btn"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? "Importing…" : "Import a project (.zip)"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={onImport}
      />

      {recoverable.length > 0 ? (
        <div className="landing-recover">
          <div className="landing-recover-head">
            <p className="landing-recover-title">
              Recover unsaved work (this browser)
            </p>
            <button
              type="button"
              className="landing-recover-clear"
              onClick={clearRecent}
              disabled={busy}
            >
              Clear all
            </button>
          </div>
          {recoverable.map((r) => (
            <button
              key={r.key}
              className="landing-btn"
              onClick={() => restore(r)}
              disabled={busy}
            >
              Restore “{r.title}”
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="landing-error">{error}</p> : null}
    </div>
  );
}
