"use client";

/*
 * Slim banner reminding that the project is temporary, plus a confirm-on-close
 * (beforeunload) nudge so the user doesn't lose unsaved work. The browser shows
 * its own generic "Leave site?" dialog — the wording lives in the banner since
 * browsers don't allow custom beforeunload text.
 */
import { useEffect } from "react";
import { useEditor } from "@/lib/store";

export default function EphemeralNotice() {
  const slug = useEditor((s) => s.projectSlug);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <div className="ephemeral-notice" role="status">
      <span>
        This project is temporary — it’s deleted after <strong>1 day of
        inactivity</strong>. Download it to keep a copy.
      </span>
      <a
        className="ephemeral-download"
        href={`/api/projects/${slug}/download`}
        download
      >
        Download project
      </a>
    </div>
  );
}
