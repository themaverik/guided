# ADR-003: Inline Rich Text and Mixed Callout Placement

- Status: Accepted
- Date: 2026-05-30
- Deciders: Lamtei
- Relates to: ADR-001 (config-driven model; rejected TipTap). This revisits that for text content only.

## Context and Problem Statement

ROADMAP Phase 9 (Theme B) adds: inline bold/italic on any body text (#7), bullet/numbered lists in
paragraphs and callouts (#6), and mixed callout placement so a single row can have, e.g., two
callouts to the side and one below (#3). The first two touch how text is stored; the third changes
the callout placement model. The constraint from ADR-001 stands: the config is the hand-editable
source of truth, and we avoid heavy editor dependencies.

## Decision

### 1. Rich text is stored as a markdown-subset string (#6, #7)

Text fields stay **strings**. They may contain a constrained markdown subset:

- `**bold**` / `__bold__` → bold
- `*italic*` / `_italic_` → italic
- lines starting with `- ` or `* ` → unordered list; `1. ` → ordered list
- blank line → paragraph break

Impact on the data model: **none structural** — `instruction`, `body`, `description` remain
`string`. We add a small, dependency-free renderer (`lib/markdown.ts`) that HTML-escapes the input
first and only emits a fixed, safe set of tags (`<strong>`, `<em>`, `<ul>/<ol>/<li>`, `<p>`). Because
no raw HTML from the input is ever passed through, there is no XSS surface and no need for a
sanitizer dependency. Components render the result via `dangerouslySetInnerHTML`.

Rationale vs. TipTap/ProseMirror JSON: storing a document tree per field would balloon the config
and break hand-editability. Markdown keeps fields compact, diff-friendly, and human-editable.
TipTap may still be adopted later purely as the *editing surface*, serializing to/from this same
markdown — storage is unaffected.

Applied to the long-form fields (step instruction, row instruction, callout body, chapter
description). Titles remain plain for now (inline marks can be extended to them later without a
schema change, since they are already strings).

### 2. Per-callout placement enables mixed layouts (#3)

Add an optional `placement` to `Callout`:

```ts
interface Callout {
  type: CalloutType;
  title?: string;
  body?: string;
  placement?: "side" | "below"; // NEW — overrides the row default
}
```

A callout's effective placement is `callout.placement ?? row.calloutLayout ?? "side"`. The renderer
splits a row's callouts into a **side** group (rendered in the right-hand column) and a **below**
group (rendered in the grid beneath, with auto-numbered markers); both groups can be present at
once. `calloutCols` continues to control the below grid.

Backward compatibility: existing configs have no `placement`, so every callout inherits the row's
`calloutLayout` exactly as before — output is unchanged.

### Per-callout width (addendum)

Width is modeled per placement so it can never overflow (auto-fit only rescues vertically):

- below mode → `Callout.span?: 1|2|3` (clamped to `calloutCols`) sets how many grid columns the
  callout occupies. The below grid is full content width, so spans honor single/double automatically.
- side mode → `Callout.widthPct?: number` (10–100) caps the card to a percentage of the side
  column, which already narrows for double images. Relative units only; no absolute px width.

## Consequences

- No structural change to stored text; the config stays compact and hand-editable.
- A self-written markdown renderer is intentionally limited (no links/images/raw HTML), which keeps
  it safe without DOMPurify; if richer markdown is needed later, swap in a vetted library + sanitizer.
- Auto-fit is unaffected — it measures the rendered DOM, so lists and wrapped bold text are handled
  automatically.
- Mixed placement makes `row.calloutLayout` a *default* rather than an absolute; the editor exposes
  a per-callout override while keeping the row-level control as the default setter.

## References

- ROADMAP "v2 — Feature expansion", Phase 9.
- Feature request items #3, #6, #7.
