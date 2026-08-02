"use client";

/*
 * Toast stack (DESIGN §6 Notification): fixed bottom-left over the left pane.
 * Renders the store's transient notices; ~4s auto-dismiss paused on hover or
 * focus; manual ×. Editor-only — never mounted on the print route.
 */
import { useEffect, useRef, useState } from "react";
import { useEditor, type Notice } from "@/lib/store";

const TOAST_MS = 4000;
const EXIT_MS = 140;
const MIN_RESUME_MS = 800;

function ToastItem({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);
  const remaining = useRef(TOAST_MS);
  const started = useRef(Date.now());
  const timer = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onDismiss, EXIT_MS);
  };

  useEffect(() => {
    started.current = Date.now();
    timer.current = window.setTimeout(close, remaining.current);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    window.clearTimeout(timer.current);
    remaining.current -= Date.now() - started.current;
  };
  const resume = () => {
    if (closingRef.current) return;
    started.current = Date.now();
    timer.current = window.setTimeout(close, Math.max(remaining.current, MIN_RESUME_MS));
  };

  return (
    <div
      className={`toast toast-${notice.tone}${closing ? " closing" : ""}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span>{notice.message}</span>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={close}>
        ×
      </button>
    </div>
  );
}

export default function Toast() {
  const notices = useEditor((s) => s.notices);
  const dismissNotice = useEditor((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <div className="toast-stack">
      {notices.map((n) => (
        <div key={n.id} role={n.tone === "danger" ? "alert" : "status"}>
          <ToastItem notice={n} onDismiss={() => dismissNotice(n.id)} />
        </div>
      ))}
    </div>
  );
}
