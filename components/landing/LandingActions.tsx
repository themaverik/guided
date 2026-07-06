"use client";

/*
 * Landing actions: Start a new project (prompts for a name → POST /api/projects
 * → navigate to /<slug>), View demo, View quickstart.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Book } from "@/lib/book-schema";
import { bookApiFor } from "@/lib/project-routes";
import ConfirmDialog from "@/components/editor/ConfirmDialog";

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
  const [pendingDiscard, setPendingDiscard] = useState<Recoverable | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);

  // Surface any locally-mirrored books (crash/expiry recovery).
  useEffect(() => {
    try {
      const found: Recoverable[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(LS_PREFIX)) continue;
        const slug = key.slice(LS_PREFIX.length);
        if (slug === "demo") continue; // demo is never offered for restore
        try {
          const book = JSON.parse(localStorage.getItem(key) ?? "") as Book;
          if (Array.isArray(book?.chapters)) {
            found.push({
              key,
              slug,
              title: book.title || slug,
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

  const clearAllConfirmed = () => {
    try {
      for (const r of recoverable) localStorage.removeItem(r.key);
    } catch {
      /* localStorage unavailable */
    }
    setRecoverable([]);
    setPendingClearAll(false);
  };

  const discardConfirmed = async () => {
    const item = pendingDiscard;
    setPendingDiscard(null);
    if (!item) return;
    try {
      // Best-effort: the underlying project may already be expired/gone.
      await fetch(`/api/projects/${item.slug}`, { method: "DELETE" });
    } catch {
      /* server-side delete failing shouldn't block clearing the local cache */
    }
    try {
      localStorage.removeItem(item.key);
    } catch {
      /* localStorage unavailable */
    }
    setRecoverable((prev) => prev.filter((r) => r.key !== item.key));
  };

  // Restore an abrupt-close checkpoint. The project usually still exists
  // server-side (TTL default 1 day, far longer than a crash-to-reopen gap), and
  // its assets are untouched there — so the fix for "images vanish on restore"
  // is to sync the cached book onto the SAME project and reopen it, not to
  // recreate a new project (which always starts with an empty assets folder).
  const restore = async (item: Recoverable) => {
    setBusy(true);
    setError(null);
    try {
      const check = await fetch(bookApiFor(item.slug));
      if (check.ok) {
        await fetch(bookApiFor(item.slug), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.book),
        });
        router.push(`/${item.slug}`);
        return;
      }
      // Original project expired — recreate under a new slug. Images cannot be
      // recovered here: the browser cache only ever held the book JSON, and the
      // source assets directory is gone.
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: item.title, book: item.book }),
      });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (res.ok && data.slug) {
        window.alert(
          "The original project had expired, so it was recreated — uploaded images could not be recovered.",
        );
        router.push(`/${data.slug}`);
      } else {
        setError(data.error ?? "Could not restore");
      }
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
              onClick={() => setPendingClearAll(true)}
              disabled={busy || recoverable.length === 0}
            >
              Clear all
            </button>
          </div>
          {recoverable.map((r) => (
            <div key={r.key} className="landing-recover-row">
              <button
                className="landing-btn"
                onClick={() => restore(r)}
                disabled={busy}
              >
                Restore “{r.title}”
              </button>
              <button
                type="button"
                className="landing-recover-clear"
                onClick={() => setPendingDiscard(r)}
                disabled={busy}
              >
                Discard
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="landing-error">{error}</p> : null}

      <ConfirmDialog
        open={pendingDiscard != null}
        title="Discard this project?"
        message={`This permanently deletes "${pendingDiscard?.title}" and removes it from this browser. This can't be undone.`}
        confirmLabel="Discard"
        tone="danger"
        onConfirm={() => void discardConfirmed()}
        onCancel={() => setPendingDiscard(null)}
      />
      <ConfirmDialog
        open={pendingClearAll}
        title="Clear all recovery checkpoints?"
        message={`This removes ${recoverable.length} recovery checkpoint${
          recoverable.length === 1 ? "" : "s"
        } from this browser. This can't be undone.`}
        confirmLabel="Clear all"
        tone="danger"
        onConfirm={clearAllConfirmed}
        onCancel={() => setPendingClearAll(false)}
      />
    </div>
  );
}
