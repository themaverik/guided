"use client";

/*
 * Landing actions: Start a new project (prompts for a name → POST /api/projects
 * → navigate to /<slug>), View demo, View quickstart.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingActions() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {error ? <p className="landing-error">{error}</p> : null}
    </div>
  );
}
