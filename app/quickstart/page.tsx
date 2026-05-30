/* Quickstart guide for Guided. */
import Link from "next/link";
import "../landing.css";

export const metadata = { title: "Guided — Quickstart" };

export default function Quickstart() {
  return (
    <main className="prose">
      <Link className="back" href="/">
        ← Back
      </Link>
      <h1>Quickstart</h1>
      <p>
        Guided turns a stack of screenshots into a clean, print-ready A4
        guidebook. The screen is split in two: controls on the left, a live page
        preview on the right that updates as you type.
      </p>

      <h2>1. Start a project</h2>
      <p>
        From the home page choose <code>Start a new project</code> and give it a
        name, or open <code>View demo project</code> to explore a populated
        example. Each project lives at its own address, e.g.{" "}
        <code>/my-guide</code>.
      </p>

      <h2>2. Structure: chapters and steps</h2>
      <p>
        A guidebook is chapters, each containing steps. One step prints as one
        page. Use the <strong>Chapters</strong> panel to add, remove, reorder,
        and rename chapters; select a chapter to edit its steps the same way.
        Each step has a page title and a numbered introduction.
      </p>

      <h2>3. Rows and images</h2>
      <p>
        A step is built from rows. Each row holds one image (single or wide) or
        two (double, optionally with a connecting arrow). Pick an image from the
        dropdown or use <code>Upload new…</code> — uploaded files are stored with
        the project. Toggle the image border and tune its color, width, and
        radius.
      </p>

      <h2>4. Callouts</h2>
      <p>
        Callouts annotate a row. Choose a type (info, note, success, warning,
        danger), write a title and body, and place each callout to the{" "}
        <strong>side</strong> of the image or in a grid <strong>below</strong> —
        you can mix both in one row. Below-mode callouts can span multiple
        columns; side-mode callouts can be given a width.
      </p>

      <h2>5. Rich text</h2>
      <p>
        Instructions, descriptions, and callout bodies support light formatting:{" "}
        <code>**bold**</code>, <code>*italic*</code>, and bullet or numbered
        lists — use the toolbar above each field or type the markdown directly.
      </p>

      <h2>6. Look and feel</h2>
      <p>
        Set per-section fonts (family, size, color), add a page background image,
        and enable a watermark (text or icon, positioned and faded to taste).
      </p>

      <h2>7. Print and save</h2>
      <p>
        Use <code>Print / PDF</code> to open a clean, chrome-free version sized
        to true A4. Your work autosaves as you edit.
      </p>

      <p className="muted">
        Note: projects are temporary and are removed about an hour after you stop
        editing. Download your project to keep it (coming soon). See our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
