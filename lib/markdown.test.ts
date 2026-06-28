import { describe, it, expect } from "vitest";
import { renderMarkdownBlocks, renderMarkdownInline } from "@/lib/markdown";

describe("renderMarkdownBlocks — headings", () => {
  it("renders ## as <h2>", () => {
    expect(renderMarkdownBlocks("## Title")).toBe("<h2>Title</h2>");
  });
  it("renders ### as <h3>", () => {
    expect(renderMarkdownBlocks("### Sub")).toBe("<h3>Sub</h3>");
  });
  it("runs inline marks inside a heading", () => {
    expect(renderMarkdownBlocks("## **Bold** head")).toBe(
      "<h2><strong>Bold</strong> head</h2>",
    );
  });
  it("does not treat a single # as a heading", () => {
    expect(renderMarkdownBlocks("# Title")).toBe("<p># Title</p>");
  });
  it("escapes HTML inside a heading", () => {
    expect(renderMarkdownBlocks("## <script>x</script>")).toBe(
      "<h2>&lt;script&gt;x&lt;/script&gt;</h2>",
    );
  });
  it("separates a heading from a following paragraph", () => {
    expect(renderMarkdownBlocks("## H\nbody")).toBe("<h2>H</h2><p>body</p>");
  });
});

describe("strikethrough", () => {
  it("renders ~~x~~ as <del> inline", () => {
    expect(renderMarkdownInline("a ~~b~~ c")).toBe("a <del>b</del> c");
  });
  it("renders ~~x~~ in block mode", () => {
    expect(renderMarkdownBlocks("~~gone~~")).toBe("<p><del>gone</del></p>");
  });
  it("escapes HTML inside strike", () => {
    expect(renderMarkdownInline("~~<b>~~")).toBe("<del>&lt;b&gt;</del>");
  });
});

describe("existing marks still work", () => {
  it("renders bold + a bullet list", () => {
    expect(renderMarkdownBlocks("**hi**\n- a\n- b")).toBe(
      "<p><strong>hi</strong></p><ul><li>a</li><li>b</li></ul>",
    );
  });
});

describe("lists", () => {
  it("renders a numbered list as <ol>", () => {
    expect(renderMarkdownBlocks("1. a\n2. b")).toBe(
      "<ol><li>a</li><li>b</li></ol>",
    );
  });
  it("uses source markers loosely — any 'n.' continues the same <ol>", () => {
    expect(renderMarkdownBlocks("1. a\n1. b")).toBe(
      "<ol><li>a</li><li>b</li></ol>",
    );
  });
  it("runs inline marks inside list items", () => {
    expect(renderMarkdownBlocks("1. **a**\n2. *b*")).toBe(
      "<ol><li><strong>a</strong></li><li><em>b</em></li></ol>",
    );
  });
  it("starts a new list when the marker type changes (no mixing in one list)", () => {
    expect(renderMarkdownBlocks("- a\n1. b")).toBe(
      "<ul><li>a</li></ul><ol><li>b</li></ol>",
    );
  });
});
