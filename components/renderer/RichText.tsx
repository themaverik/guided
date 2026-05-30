/*
 * Renders a markdown-subset string to safe HTML (bold/italic + lists). The HTML
 * comes from lib/markdown, which escapes input and emits only a fixed tag set,
 * so dangerouslySetInnerHTML carries no XSS risk here.
 */
import { renderMarkdownBlocks, renderMarkdownInline } from "@/lib/markdown";

export default function RichText({
  text,
  block = false,
  className,
  as,
}: {
  text?: string;
  /** Block mode renders paragraphs + lists; inline mode only bold/italic. */
  block?: boolean;
  className?: string;
  as?: "span" | "div";
}) {
  const html = block
    ? renderMarkdownBlocks(text ?? "")
    : renderMarkdownInline(text ?? "");
  const Tag = as ?? (block ? "div" : "span");
  return (
    <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
