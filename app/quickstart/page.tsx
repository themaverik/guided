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

      <h2>3. The page grid and images</h2>
      <p>
        A step’s page is a flexible grid. Drag the dividers to resize rows and
        columns, and add or remove rows, columns, and cells from the step
        panel. Fill a cell by dragging an image file straight onto it, or pick
        an already-uploaded image from the cell’s dropdown — uploads are stored
        with the project. Per image you can choose how it fills the cell
        (maintain ratio, or crop to width/height) and give it a border that
        hugs the screenshot. (Existing content made with the classic row layout
        still works — each step has a layout toggle.)
      </p>

      <h2>4. Callouts</h2>
      <p>
        Callouts annotate a cell. Add one to a cell’s stack, choose a type
        (info, note, success, warning, danger), and write a title and body.
        Drag a callout off the stack to float it anywhere in the cell. If a
        page gets crowded, content auto-shrinks so nothing overflows the sheet.
      </p>

      <h2>5. Rich text and text blocks</h2>
      <p>
        Instructions, descriptions, callout bodies, and dedicated text-block
        cells support light formatting: <code>**bold**</code>,{" "}
        <code>*italic*</code>, <code>~~strikethrough~~</code>, headings, and
        bullet or numbered lists — use the toolbar above each field or type the
        markdown directly. Text blocks can be aligned left, center, or right.
      </p>

      <h2>6. Annotations</h2>
      <p>
        Use the floating palette over the preview to draw boxes, ellipses,
        brackets, text labels, and connectors right on the page — drag to size,
        snap to align, and double-click any shape to label it. Annotations
        print exactly as you see them.
      </p>

      <h2>7. Look and feel</h2>
      <p>
        Configure the page itself (size — including custom dimensions —
        orientation, margins, header/footer), set per-section fonts (family,
        size, color), add page background images with a matching text color,
        and enable a watermark (text or icon, positioned and faded to taste).
      </p>

      <h2>8. Print and save</h2>
      <p>
        Use <code>Print / PDF</code> to open a clean, chrome-free version sized
        to the true page dimensions, and <code>Download</code> to save the
        whole project as a .zip you can import later. Your work autosaves as
        you edit.
      </p>

      <p className="muted">
        Note: projects are temporary and are removed about an hour after you
        stop editing. Download your project to keep it. See our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
