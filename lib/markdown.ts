/*
 * Tiny, dependency-free markdown subset → HTML. SAFE BY CONSTRUCTION: the input
 * is HTML-escaped first, then only a fixed set of tags is emitted
 * (<strong>, <em>, <p>, <ul>/<ol>/<li>). No raw HTML from the input is ever
 * passed through, so there is no XSS surface and no sanitizer is needed.
 *
 * Supported:
 *   **bold** / __bold__        → <strong>
 *   *italic* / _italic_        → <em>
 *   - item / * item            → <ul><li>
 *   1. item                    → <ol><li>
 *   blank line                 → paragraph break
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline marks on already-escaped text. Bold before italic to avoid overlap. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
}

type LineKind = "ul" | "ol" | "p" | "blank";

function classify(line: string): { kind: LineKind; text: string } {
  if (/^\s*$/.test(line)) return { kind: "blank", text: "" };
  const ul = line.match(/^\s*[-*]\s+(.*)$/);
  if (ul) return { kind: "ul", text: ul[1] };
  const ol = line.match(/^\s*\d+\.\s+(.*)$/);
  if (ol) return { kind: "ol", text: ol[1] };
  return { kind: "p", text: line };
}

/**
 * Render block-level markdown (paragraphs + lists + inline marks) to safe HTML.
 * Consecutive non-list lines fold into one paragraph (soft line breaks joined).
 */
export function renderMarkdownBlocks(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const line of lines) {
    const { kind, text } = classify(line);
    if (kind === "blank") {
      flushPara();
      flushList();
      continue;
    }
    if (kind === "ul" || kind === "ol") {
      flushPara();
      if (listTag !== kind) {
        flushList();
        listTag = kind;
        out.push(`<${kind}>`);
      }
      out.push(`<li>${inline(escapeHtml(text))}</li>`);
    } else {
      flushList();
      para.push(text);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

/** Render inline-only markdown (bold/italic), single line, no block wrappers. */
export function renderMarkdownInline(src: string): string {
  if (!src) return "";
  return inline(escapeHtml(src));
}
