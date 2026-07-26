# Editor Improvement rev6 — Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per-task review by **staff-engineer + frontend-developer** agents (in parallel) before moving on, under **karpathy-guidelines** discipline. Task 5 is the largest — split it further at execution time if a reviewer would benefit.

**Goal:** Add a freely-placed chapter cover image, and per-page background image + text-colour override on the cover / chapter-intro / back-cover pages.

**Architecture:** Additive optional `Book` fields (`Chapter.coverImage`, `Chapter.background`/`pageTextColor`, `Ending.background`/`pageTextColor`, `Book.coverBackground`/`coverTextColor`). Render is data-driven and prints: `A4Book` resolves each page's own background/image (falling back to the book background) and each of the three page components applies its own `pageInkVars` on its `.page`. Editor UI reuses the existing `BackgroundSettings` pattern (extracted into a shared control) plus a drag/resize overlay on the chapter-intro preview. **ADR-001 + ADR-005 amended before any code.**

**Tech Stack:** Next.js 15 (App Router, server `A4Book`), React 19, TypeScript, Zustand, Vitest.

## Global Constraints

- **All new fields optional/additive.** Steps and no-background pages render
  **byte-identical to today.** No `schemaVersion` bump, no migration.
- **ADR-first:** amend `ADR-001` (config-driven renderer — chapter image) and
  `ADR-005` (persistence/hosting — per-page background) before code.
- **Immutability:** all edits via `lib/book-mutations.ts`.
- **Print-accurate, data-driven render:** chapter image + per-page bg/ink render
  in both preview and `/print`. The drag/resize handles are editor-only and must
  never print.
- Images stored as **bare filenames**, resolved via `backgroundImageSrc`
  (`book-render.ts:69`) against the current project, so they survive
  download/re-import (same rule as watermark/background).
- **Scope:** cover / chapter-intro / back-cover only. **No per-step background.**
- Base branch `feature/improvement-rev6` (continues after Wave 2).
- Gate every task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.

---

## File Structure

- `docs/adr/ADR-001-*.md`, `docs/adr/ADR-005-*.md` — amendments (Task 1).
- `lib/book-schema.ts` — `ChapterCoverImage`, `Chapter.coverImage?`,
  `Chapter.background?`/`pageTextColor?`, `Ending.background?`/`pageTextColor?`,
  `Book.coverBackground?`/`coverTextColor?`.
- `lib/book-mutations.ts` — `setChapterCoverImage`.
- `lib/book-render.ts` — `resolvePageBackground`.
- `lib/store.tsx` — `setChapterCoverImage` action.
- `components/renderer/A4Book.tsx` — per-page bg/image/ink resolution + wiring.
- `components/renderer/ChapterIntro.tsx` — cover `<img>` + `pageInkVars`.
- `components/renderer/CoverPage.tsx`, `BackCover.tsx` — `pageInkVars` + per-page bg.
- `components/renderer/renderer.css` — `.chap-cover-img`.
- `components/editor/PageDecorControls.tsx` — **new** shared bg+text control.
- `components/editor/ChapterList.tsx` — per-chapter decor + cover-image picker.
- `components/editor/EndingSettings.tsx`, `BookSettings.tsx` — decor controls.
- `components/editor/PreviewChapterImage.tsx` — **new** drag/resize overlay.
- `components/editor/PreviewPane.tsx` — mount the overlay when `stepIndex == null`.
- Tests: `lib/book-mutations.test.ts`, `lib/book-render.test.ts`.

---

## Task 1: Amend ADR-001 + ADR-005 (model change gate)

**Files:**
- Modify: `docs/adr/ADR-001-config-driven-a4-renderer-architecture.md`
- Modify: `docs/adr/ADR-005-multi-project-ephemeral-hosting.md`

- [ ] **Step 1: ADR-001 amendment** — document the freely-placed `Chapter.coverImage`
  (normalized rect + `ImageFit`, rendered on the chapter-intro page, prints).
- [ ] **Step 2: ADR-005 amendment** — document per-page `background`/`pageTextColor`
  on cover/chapter/back, resolved via `backgroundImageSrc` (portable bare
  filenames), book-level values as fallback.
- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-001-config-driven-a4-renderer-architecture.md docs/adr/ADR-005-multi-project-ephemeral-hosting.md
git commit -m "docs: amend ADR-001/005 for chapter image + per-page background"
```

---

## Task 2: Schema fields + `setChapterCoverImage` mutation

**Files:**
- Modify: `lib/book-schema.ts`
- Modify: `lib/book-mutations.ts`
- Test: `lib/book-mutations.test.ts`

**Interfaces:**
- Produces:
  - `interface ChapterCoverImage { image: string; x: number; y: number; w: number; h: number; fit?: ImageFit }`
  - `Chapter.coverImage?`, `Chapter.background?`, `Chapter.pageTextColor?`,
    `Ending.background?`, `Ending.pageTextColor?`, `Book.coverBackground?`,
    `Book.coverTextColor?`.
  - `setChapterCoverImage(book, ci, patch: Partial<ChapterCoverImage> | null): Book`
    — `null` clears; a partial merges into the existing (or a centred default).

- [ ] **Step 1: Add the schema fields**

In `lib/book-schema.ts`:

```ts
/** A freely-placed image on a chapter-intro page (normalized 0–1 rect). */
export interface ChapterCoverImage {
  image: string; // bare filename, resolved at render time
  x: number; y: number; w: number; h: number;
  fit?: ImageFit; // default "contain"
}
```

Add to `interface Chapter`: `coverImage?: ChapterCoverImage; background?: Background; pageTextColor?: string;`.
Add to `interface Ending`: `background?: Background; pageTextColor?: string;`.
Add to `interface Book`: `coverBackground?: Background; coverTextColor?: string;`.
(All optional — absent = today.)

- [ ] **Step 2: Write the failing tests**

In `lib/book-mutations.test.ts`:

```ts
import { setChapterCoverImage } from "./book-mutations";

describe("setChapterCoverImage", () => {
  it("sets a new cover image with a centred default rect", () => {
    const out = setChapterCoverImage(baseBook(), 0, { image: "hero.png" });
    const ci = out.chapters[0].coverImage!;
    expect(ci.image).toBe("hero.png");
    expect(ci.w).toBeGreaterThan(0);
  });
  it("merges a position patch into the existing image", () => {
    const b = setChapterCoverImage(baseBook(), 0, { image: "hero.png" });
    const out = setChapterCoverImage(b, 0, { x: 0.1, y: 0.2 });
    expect(out.chapters[0].coverImage).toMatchObject({ image: "hero.png", x: 0.1, y: 0.2 });
  });
  it("clears with null", () => {
    const b = setChapterCoverImage(baseBook(), 0, { image: "hero.png" });
    expect(setChapterCoverImage(b, 0, null).chapters[0].coverImage).toBeUndefined();
  });
  it("does not mutate the input", () => {
    const b = baseBook();
    setChapterCoverImage(b, 0, { image: "x.png" });
    expect(b.chapters[0].coverImage).toBeUndefined();
  });
});
```

(Use the file's existing base-book helper for `baseBook()`.)

- [ ] **Step 3: Run to verify FAIL**

Run: `pnpm test -- book-mutations`
Expected: FAIL — `setChapterCoverImage` not exported.

- [ ] **Step 4: Implement the mutation**

In `lib/book-mutations.ts`:

```ts
export function setChapterCoverImage(
  book: Book, ci: number, patch: Partial<ChapterCoverImage> | null,
): Book {
  const next = clone(book);
  const ch = next.chapters[ci];
  if (!ch) return book;
  if (patch === null) { delete ch.coverImage; return next; }
  const base = ch.coverImage ?? { image: "", x: 0.3, y: 0.35, w: 0.4, h: 0.3, fit: "contain" as const };
  ch.coverImage = { ...base, ...patch };
  return next;
}
```

Import `ChapterCoverImage` from `./book-schema`.

- [ ] **Step 5: Run to verify PASS + gate + commit**

```bash
pnpm test -- book-mutations
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/book-schema.ts lib/book-mutations.ts lib/book-mutations.test.ts
git commit -m "feat: chapter cover image + per-page background/ink schema + mutation"
```

---

## Task 3: Render — per-page background, chapter image, per-page ink

**Files:**
- Modify: `lib/book-render.ts` (`resolvePageBackground`)
- Test: `lib/book-render.test.ts`
- Modify: `components/renderer/A4Book.tsx`
- Modify: `components/renderer/ChapterIntro.tsx`, `CoverPage.tsx`, `BackCover.tsx`
- Modify: `components/renderer/renderer.css`

**Interfaces:**
- Produces: `resolvePageBackground(assetBase: string, pageBg?: Background, bookBg?: Background): Background | undefined` — page image wins; else book; else undefined; the returned image is URL-resolved.
- Each of the three page components gains `pageTextColor?: string` (applied via `pageInkVars` on its `.page`). `ChapterIntro` gains a resolved `coverImage?: ChapterCoverImage`.

- [ ] **Step 1: Write the failing test for the resolver**

In `lib/book-render.test.ts`:

```ts
import { resolvePageBackground } from "./book-render";

describe("resolvePageBackground", () => {
  const base = "/api/projects/s/assets";
  it("uses the page background when it has an image", () => {
    const r = resolvePageBackground(base, { image: "p.png", opacity: 0.5 }, { image: "book.png" });
    expect(r).toEqual({ image: `${base}/_background/p.png`, opacity: 0.5 });
  });
  it("falls back to the book background", () => {
    const r = resolvePageBackground(base, undefined, { image: "book.png" });
    expect(r!.image).toBe(`${base}/_background/book.png`);
  });
  it("returns undefined when neither has an image", () => {
    expect(resolvePageBackground(base, {}, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm test -- book-render`
Expected: FAIL — `resolvePageBackground` not exported.

- [ ] **Step 3: Implement the resolver**

In `lib/book-render.ts` (near `backgroundImageSrc`):

```ts
export function resolvePageBackground(
  assetBase: string, pageBg?: Background, bookBg?: Background,
): Background | undefined {
  const chosen = pageBg?.image ? pageBg : bookBg;
  if (!chosen?.image) return undefined;
  return { ...chosen, image: backgroundImageSrc(assetBase, chosen.image) };
}
```

Ensure `Background` is imported in `book-render.ts`.

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm test -- book-render`
Expected: PASS.

- [ ] **Step 5: Per-page ink on the three pages**

In `CoverPage.tsx`, `ChapterIntro.tsx`, `BackCover.tsx`: add a `pageTextColor?: string` prop and apply it on the `<section className="page …">` via `style={pageInkVars(pageTextColor)}` (import `pageInkVars` from `@/lib/book-render`). `pageInkVars(undefined)` returns `{}`, so no-override pages fall through to the root cascade unchanged.

- [ ] **Step 6: Chapter cover image render**

In `ChapterIntro.tsx`, add a `coverImage?: ChapterCoverImage` prop; render it just after `<PageBackground/>` (behind the text, above the background):

```tsx
{coverImage?.image ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img className="chap-cover-img" aria-hidden alt="" src={coverImage.image}
    style={{ left: `${coverImage.x * 100}%`, top: `${coverImage.y * 100}%`,
             width: `${coverImage.w * 100}%`, height: `${coverImage.h * 100}%`,
             objectFit: coverImage.fit ?? "contain" }} />
) : null}
```

In `renderer.css` add: `.chap-cover-img { position: absolute; z-index: 0; }` (matches `.page-bg`/watermark layering; `.page` is already the positioned ancestor).

- [ ] **Step 7: Wire A4Book resolution**

In `components/renderer/A4Book.tsx`, resolve per page and pass down:

```tsx
<CoverPage book={book} paging={paging} watermark={wm}
  background={resolvePageBackground(assetBase, book.coverBackground, book.background)}
  pageTextColor={book.coverTextColor ?? book.pageTextColor} />
...
<ChapterIntro chapter={chapter} index={ci} paging={paging[ci]} watermark={wm}
  background={resolvePageBackground(assetBase, chapter.background, book.background)}
  pageTextColor={chapter.pageTextColor ?? book.pageTextColor}
  coverImage={chapter.coverImage
    ? { ...chapter.coverImage, image: backgroundImageSrc(assetBase, chapter.coverImage.image)! }
    : undefined} />
...
<BackCover book={book} watermark={wm}
  background={resolvePageBackground(assetBase, book.ending?.background, book.background)}
  pageTextColor={book.ending?.pageTextColor ?? book.pageTextColor} />
```

Steps keep the existing book-level `background={bg}` — unchanged. Import `resolvePageBackground`.

- [ ] **Step 8: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/book-render.ts lib/book-render.test.ts components/renderer/A4Book.tsx components/renderer/ChapterIntro.tsx components/renderer/CoverPage.tsx components/renderer/BackCover.tsx components/renderer/renderer.css
git commit -m "feat: per-page background + ink and chapter cover image render"
```

**Manual verify:** with data hand-set on the book, confirm a chapter intro / cover / back cover each show their own background + ink, steps unchanged, and it all prints.

---

## Task 4: Editor — decor controls + cover-image picker

**Files:**
- Create: `components/editor/PageDecorControls.tsx`
- Modify: `lib/store.tsx` (`setChapterCoverImage` action)
- Modify: `components/editor/ChapterList.tsx` (per-chapter decor + cover picker)
- Modify: `components/editor/EndingSettings.tsx`, `components/editor/BookSettings.tsx`

**Interfaces:**
- Produces: store action `setChapterCoverImage(ci: number, patch: Partial<ChapterCoverImage> | null)`; a reusable `<PageDecorControls>` for background image (upload/fit/opacity/clear) + optional text colour.

- [ ] **Step 1: Add the store action**

In `lib/store.tsx` interface + body:

```ts
  setChapterCoverImage: (ci: number, patch: Partial<ChapterCoverImage> | null) => void;
  // body:
  setChapterCoverImage: (ci, patch) =>
    set((s) => ({ book: M.setChapterCoverImage(s.book, ci, patch) })),
```

- [ ] **Step 2: Extract the shared decor control**

Create `components/editor/PageDecorControls.tsx` — a client component with props
`{ background?: Background; textColor?: string; onBackground: (patch: Partial<Background>) => void; onTextColor: (c: string | undefined) => void; slug: string }`.
Port the body of `BackgroundSettings.tsx` (upload to `_background` via the existing
endpoint, `backgroundImageSrc` preview, Fit select, Opacity slider, Remove, and
the "Custom color" text checkbox+picker), driving everything through the props
instead of the store. Do **not** refactor the existing `BackgroundSettings`
(book-level) — leave it as-is (karpathy: no adjacent refactor).

- [ ] **Step 3: Per-chapter decor + cover-image picker in ChapterList**

In `components/editor/ChapterList.tsx`, under each chapter's fields, render
`<PageDecorControls background={ch.background} textColor={ch.pageTextColor}
  onBackground={(p) => updateChapter(i, { background: { ...ch.background, ...p } })}
  onTextColor={(c) => updateChapter(i, { pageTextColor: c })} slug={slug} />`
plus a small cover-image row: an "Upload cover image…" button (upload to
`_background`, then `setChapterCoverImage(i, { image: filename })`), a filename +
`×` clear (`setChapterCoverImage(i, null)`), and a Fit select
(`setChapterCoverImage(i, { fit })`). Read `slug` from `useEditor((s) => s.projectSlug)`.

- [ ] **Step 4: Back-cover + cover decor**

In `EndingSettings.tsx` add `<PageDecorControls background={ending.background}
  textColor={ending.pageTextColor} onBackground={(p) => updateEnding({ background: { ...ending?.background, ...p } })}
  onTextColor={(c) => updateEnding({ pageTextColor: c })} slug={slug} />`.
In `BookSettings.tsx` (front cover) add `<PageDecorControls background={book.coverBackground}
  textColor={book.coverTextColor} onBackground={(p) => updateBookMeta({ coverBackground: { ...book.coverBackground, ...p } })}
  onTextColor={(c) => updateBookMeta({ coverTextColor: c })} slug={slug} />` under a "Cover page" subheading.

- [ ] **Step 5: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add lib/store.tsx components/editor/PageDecorControls.tsx components/editor/ChapterList.tsx components/editor/EndingSettings.tsx components/editor/BookSettings.tsx
git commit -m "feat: per-page background/text controls + chapter cover-image picker"
```

**Manual verify:** set a background + text colour on a chapter, the cover, and the back cover from the left pane; pick a chapter cover image; confirm all reflect in the preview.

---

## Task 5: Editor — chapter cover image drag/resize overlay (largest)

**Files:**
- Create: `components/editor/PreviewChapterImage.tsx`
- Modify: `components/editor/PreviewPane.tsx` (mount when `stepIndex == null`)
- Modify: `components/editor/editor.css` (handle styles reuse `.preview-anno-handle`)

**Interfaces:**
- Consumes: `setChapterCoverImage` action; the same `scalerRef`/`currentPage`
  measure approach `AnnotationSelectionPopover` uses (`PreviewPane.tsx:263-278`).
- Produces: a move + resize handle over the chapter-intro page that writes the
  normalized rect.

- [ ] **Step 1: Build the overlay component**

Create `components/editor/PreviewChapterImage.tsx` (client). Props:
`{ ci: number; coverImage: ChapterCoverImage; scalerRef; pageIndex: number; scale: number }`.
Measure the chapter-intro `.page` rect (mirror the popover's
`scalerRef.current?.querySelectorAll('.page')[pageIndex]` + `getBoundingClientRect`).
Render an absolutely-positioned SVG/overlay sized to the page with:
- a **move** handle at the image-rect centre,
- a **resize** handle at the bottom-right corner,
reusing the `Handle` visual (`.preview-anno-handle` from editor CSS). On pointer
drag, convert the pixel delta to normalized page units (`dx / pr.width`,
`dy / pr.height`), clamp to `[0,1]`, and call
`setChapterCoverImage(ci, { x, y })` (move) or `{ w, h }` (resize). Use
pointer-capture like the annotation drag.

- [ ] **Step 2: Mount it in PreviewPane**

In `components/editor/PreviewPane.tsx`, when `selection.stepIndex == null` and the
selected chapter has a `coverImage`, render `<PreviewChapterImage ci={selection.chapterIndex}
coverImage={book.chapters[selection.chapterIndex].coverImage!} scalerRef={scalerRef}
pageIndex={currentPage} scale={scale} />` alongside the existing overlays.

- [ ] **Step 3: Confirm handles never print**

The overlay lives only in the editor tree (`components/editor/**`), not in
`A4Book`/`ChapterIntro`, so it is absent from `/print` by construction. Verify by
loading the `/print` route for a chapter with a cover image — only the `<img>`
shows, no handles.

- [ ] **Step 4: Gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add components/editor/PreviewChapterImage.tsx components/editor/PreviewPane.tsx components/editor/editor.css
git commit -m "feat: drag/resize chapter cover image on the intro preview"
```

**Manual verify:** select a chapter, place a cover image, drag it around and resize
it on the intro preview; export and confirm it prints where placed with no handles.

---

## Task 6: Docs — ROADMAP + README

**Files:**
- Modify: `ROADMAP.md`, `README.md` (if user-facing)

- [ ] **Step 1: Update ROADMAP backlog markers** for the shipped rev6 waves.
- [ ] **Step 2: Note the new authoring features** in README if it lists them.
- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md README.md
git commit -m "docs: record rev6 chapter image + per-page background"
```

---

## Self-Review

- **Spec coverage:** #5 chapter image → Tasks 2 (schema/mutation), 3 (render), 4
  (picker), 5 (drag overlay); #6 per-page bg/ink → Tasks 2 (schema), 3 (render),
  4 (controls); ADR-001/005 gate → Task 1; docs → Task 6. Covered.
- **Placeholders:** none — real code/tests in each step. Task 5's overlay is
  described concretely against the existing popover/annotation-drag pattern; flagged
  as the largest and splittable.
- **Type consistency:** `ChapterCoverImage` used identically in schema, mutation,
  store action, render, and overlay; `setChapterCoverImage(book, ci, patch|null)`
  and its store wrapper `setChapterCoverImage(ci, patch|null)` match; per-page prop
  is `pageTextColor?: string` on all three pages; `resolvePageBackground(assetBase,
  pageBg, bookBg)` signature matches its three call sites.

## Execution Handoff

Subagent-driven development; staff-engineer + frontend-developer review per task
under karpathy discipline. Recommend merging each wave to `main` independently
after its review passes (Wave 1 → 2 → 3).
