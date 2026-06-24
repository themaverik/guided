# Page Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make page size, orientation, margins, and header/footer heights author-configurable end-to-end — data → migrate-on-load → renderer geometry → PDF export → settings UI — while existing books render pixel-identically.

**Architecture:** Builds on Plan 1's `PageConfig` type, `grid-math.pageDimensions`, and `migrateBook`. Two presets: `DEFAULT_PAGE_CONFIG` (new projects: 15/15/10 mm) and `LEGACY_PAGE_CONFIG` (migrated existing books: 18/0/0 mm = today's geometry). Geometry reaches the renderer as CSS custom properties on the `.book` root (joining `themeVars`); the existing `--page-*` variables already drive `renderer.css`. PDF size flows through the print route's `@page` (Chromium already honors `preferCSSPageSize`).

**Tech Stack:** TypeScript, vitest, Next.js 15 / React 19 (server + client components), Zustand, plain CSS.

## Global Constraints

- **Zero regression:** existing `book.json` files must render pixel-identically. Guaranteed by `LEGACY_PAGE_CONFIG` = `{ margins 18 mm, header 0, footer 0 }`, which reproduces the current `globals.css` geometry (`--page-margin: 18mm`, no header/footer).
- **New-project defaults** (PRD Decision 13): margins 15 mm, header 15 mm, footer 10 mm; author-confirmable. Stored in mm.
- **Immutability:** store actions and helpers return new objects (match `lib/book-mutations.ts` / `lib/store.tsx`).
- **`Book` JSON is source of truth;** HTML/PDF are derived.
- **mm everywhere** for geometry; do not round.
- Module alias `@/*` → repo root.
- Conventional Commits; **NO AI attribution / no Co-Authored-By trailer**.
- Before each commit: `pnpm test --run` (all green) AND `pnpm typecheck` (exit 0).

---

## File structure

- Modify `lib/book-schema.ts` — retune `DEFAULT_PAGE_CONFIG`, add `LEGACY_PAGE_CONFIG`.
- Modify `lib/book-schema.test.ts` — update the defaults test.
- Modify `lib/book-migrate.ts` / `lib/book-migrate.test.ts` — migrate with `LEGACY_PAGE_CONFIG`.
- Modify `lib/project-store.ts` — `defaultBook` stamps new config + version; `loadProjectBook` migrates.
- Modify `lib/book-io.ts` / add `lib/book-io.test.ts` — `parseBookSource` / `loadExampleBook` migrate.
- Create `lib/page-vars.ts` + `lib/page-vars.test.ts` — `pageVars(pageConfig)` → CSS custom props.
- Modify `components/renderer/A4Book.tsx` — merge `pageVars` into `rootStyle`.
- Modify `components/renderer/renderer.css` — reserve header/footer bands in `.page-inner`.
- Modify `app/[slug]/print/page.tsx` — inject dynamic `@page { size }`.
- Modify `lib/store.tsx` + `lib/store.test.ts` — `updatePageConfig` action.
- Create `components/editor/PageSettings.tsx` + modify `components/editor/LeftPane.tsx` — settings UI.

---

### Task 1: Page-config presets

**Files:**
- Modify: `lib/book-schema.ts`
- Modify: `lib/book-schema.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PAGE_CONFIG` (new value); `LEGACY_PAGE_CONFIG: PageConfig`.

- [ ] **Step 1: Update the failing test**

Replace the `DEFAULT_PAGE_CONFIG` assertion in `lib/book-schema.test.ts` and add a `LEGACY_PAGE_CONFIG` case:

```ts
import { DEFAULT_PAGE_CONFIG, LEGACY_PAGE_CONFIG, CURRENT_SCHEMA_VERSION } from "@/lib/book-schema";

describe("schema defaults", () => {
  it("new-project default: A4 portrait, 15mm margins, header 15mm, footer 10mm", () => {
    expect(DEFAULT_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      headerH: 15,
      footerH: 10,
    });
  });
  it("legacy-migration config preserves current geometry: 18mm margins, no header/footer", () => {
    expect(LEGACY_PAGE_CONFIG).toEqual({
      size: "A4",
      orientation: "portrait",
      margins: { top: 18, right: 18, bottom: 18, left: 18 },
      headerH: 0,
      footerH: 0,
    });
  });
  it("current schema version is 2", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-schema.test.ts`
Expected: FAIL — `LEGACY_PAGE_CONFIG` not exported / `DEFAULT_PAGE_CONFIG` header/footer mismatch.

- [ ] **Step 3: Update the constants**

In `lib/book-schema.ts`, replace the existing `DEFAULT_PAGE_CONFIG` and add `LEGACY_PAGE_CONFIG`:

```ts
/** New-project page defaults (PRD Decision 13). Author-editable. */
export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  headerH: 15,
  footerH: 10,
};

/** Migration target for pre-grid books — reproduces the current rendered
 *  geometry (18mm margins, no header/footer) so existing books are pixel-identical. */
export const LEGACY_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 18, right: 18, bottom: 18, left: 18 },
  headerH: 0,
  footerH: 0,
};
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-schema.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/book-schema.ts lib/book-schema.test.ts
git commit -m "feat: page-config presets — new-project defaults + legacy-preserving config"
```

---

### Task 2: Migrate with the legacy-preserving config

**Files:**
- Modify: `lib/book-migrate.ts`
- Modify: `lib/book-migrate.test.ts`

**Interfaces:**
- Consumes: `LEGACY_PAGE_CONFIG` from `@/lib/book-schema`.

- [ ] **Step 1: Update the failing test**

In `lib/book-migrate.test.ts`, change the import and the pageConfig assertion in the `migrateBook` describe block:

```ts
import { migrateBook, legacyStepToGrid } from "@/lib/book-migrate";
import { CURRENT_SCHEMA_VERSION, LEGACY_PAGE_CONFIG, type Book } from "@/lib/book-schema";
```
and update the assertion:
```ts
  it("adds the legacy page config, grid, and stamps the version", () => {
    const out = migrateBook(baseBook([{ image: "a.jpg" }]));
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.pageConfig).toEqual(LEGACY_PAGE_CONFIG);
    expect(out.chapters[0].steps[0].grid).toBeDefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-migrate.test.ts`
Expected: FAIL — pageConfig equals the new `DEFAULT_PAGE_CONFIG`, not `LEGACY_PAGE_CONFIG`.

- [ ] **Step 3: Switch the migration to the legacy config**

In `lib/book-migrate.ts`, change the import `DEFAULT_PAGE_CONFIG` → `LEGACY_PAGE_CONFIG`, and in `migrateBook`:

```ts
    pageConfig: book.pageConfig ?? LEGACY_PAGE_CONFIG,
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/book-migrate.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/book-migrate.ts lib/book-migrate.test.ts
git commit -m "feat: migrate pre-grid books with the legacy-preserving page config"
```

---

### Task 3: Wire migrate-on-load + new-project defaults

**Files:**
- Modify: `lib/project-store.ts` (`defaultBook`, `loadProjectBook`)
- Modify: `lib/book-io.ts` (`parseBookSource`, `loadExampleBook`)
- Create: `lib/book-io.test.ts`

**Interfaces:**
- Consumes: `migrateBook` (`@/lib/book-migrate`), `DEFAULT_PAGE_CONFIG`, `CURRENT_SCHEMA_VERSION` (`@/lib/book-schema`).
- Produces: every server load path returns a migrated (`schemaVersion` 2) book; new projects are born current.

- [ ] **Step 1: Write the failing test** (covers the pure `parseBookSource` path)

```ts
// lib/book-io.test.ts
import { describe, it, expect } from "vitest";
import { parseBookSource } from "@/lib/book-io";
import { CURRENT_SCHEMA_VERSION, LEGACY_PAGE_CONFIG } from "@/lib/book-schema";

describe("parseBookSource migrates on load", () => {
  it("stamps a legacy window.BOOK to the current schema version with legacy geometry", () => {
    const src = `window.BOOK = { title: "T", subtitle: "", author: "", edition: "", cover: "", chapters: [{ id: "c", title: "C", description: "", steps: [{ image: "a.jpg" }] }] };`;
    const book = parseBookSource(src);
    expect(book.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(book.pageConfig).toEqual(LEGACY_PAGE_CONFIG);
    expect(book.chapters[0].steps[0].grid).toBeDefined();
    // lossless: original field survives
    expect(book.chapters[0].steps[0].image).toBe("a.jpg");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/book-io.test.ts`
Expected: FAIL — `schemaVersion` is undefined (no migration yet).

- [ ] **Step 3: Wire migration into the three load points**

In `lib/book-io.ts`, import migrate and apply it in `parseBookSource` and `loadExampleBook`:

```ts
import { migrateBook } from "./book-migrate";
```
```ts
// end of parseBookSource — replace `return shim.BOOK;`
  return migrateBook(shim.BOOK);
```
```ts
// loadExampleBook — replace the return
export async function loadExampleBook(): Promise<Book> {
  return migrateBook(JSON.parse(await readFile(EXAMPLE_BOOK_PATH, "utf8")) as Book);
}
```

In `lib/project-store.ts`, import migrate + the new-project config, migrate on load, and stamp new books:

```ts
import { migrateBook } from "./book-migrate";
import { CURRENT_SCHEMA_VERSION, DEFAULT_PAGE_CONFIG } from "./book-schema";
```
```ts
// loadProjectBook — migrate the parsed book
export async function loadProjectBook(slug: string): Promise<Book> {
  const raw = await readFile(bookPath(slug), "utf8");
  return migrateBook(JSON.parse(raw) as Book);
}
```
In `defaultBook`, add the two fields to the returned object (new projects are born current, so `migrateBook` is a no-op on them):
```ts
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pageConfig: DEFAULT_PAGE_CONFIG,
    title: name,
    // ...rest unchanged
  };
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `pnpm test --run && pnpm typecheck`
Expected: all PASS, `tsc` clean. (`loadProjectBook`/`loadExampleBook` are fs-bound; their wiring is a trivial composition of the migrate-tested code and is covered structurally by typecheck.)

- [ ] **Step 5: Commit**

```bash
git add lib/book-io.ts lib/book-io.test.ts lib/project-store.ts
git commit -m "feat: migrate books on load; new projects born at current schema version"
```

---

### Task 4: `pageVars` helper + apply to the page root

**Files:**
- Create: `lib/page-vars.ts`
- Create: `lib/page-vars.test.ts`
- Modify: `components/renderer/A4Book.tsx`

**Interfaces:**
- Consumes: `pageDimensions` (`@/lib/grid-math`), `PageConfig`/`LEGACY_PAGE_CONFIG` (`@/lib/book-schema`).
- Produces: `pageVars(cfg?: PageConfig): CSSProperties` — `--page-w/h/margin/header-h/footer-h` as mm strings. Falls back to `LEGACY_PAGE_CONFIG` when `cfg` is undefined (so un-migrated/edge books match today's geometry).

- [ ] **Step 1: Write the failing test**

```ts
// lib/page-vars.test.ts
import { describe, it, expect } from "vitest";
import { pageVars } from "@/lib/page-vars";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";

describe("pageVars", () => {
  it("emits mm CSS vars for the new-project default (A4 portrait)", () => {
    expect(pageVars(DEFAULT_PAGE_CONFIG)).toEqual({
      "--page-w": "210mm",
      "--page-h": "297mm",
      "--page-margin": "15mm",
      "--page-header-h": "15mm",
      "--page-footer-h": "10mm",
    });
  });
  it("falls back to legacy geometry when config is undefined", () => {
    expect(pageVars(undefined)).toEqual({
      "--page-w": "210mm",
      "--page-h": "297mm",
      "--page-margin": "18mm",
      "--page-header-h": "0mm",
      "--page-footer-h": "0mm",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/page-vars.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/page-vars.ts
/** Page geometry → CSS custom properties for the .book root. mm strings. */
import type { CSSProperties } from "react";
import type { PageConfig } from "./book-schema";
import { LEGACY_PAGE_CONFIG } from "./book-schema";
import { pageDimensions } from "./grid-math";

export function pageVars(cfg: PageConfig | undefined): CSSProperties {
  const c = cfg ?? LEGACY_PAGE_CONFIG;
  const { w, h } = pageDimensions(c);
  // Margins are uniform in the UI today; the left value drives --page-margin.
  const vars: Record<string, string> = {
    "--page-w": `${w}mm`,
    "--page-h": `${h}mm`,
    "--page-margin": `${c.margins.left}mm`,
    "--page-header-h": `${c.headerH}mm`,
    "--page-footer-h": `${c.footerH}mm`,
  };
  return vars as CSSProperties;
}
```

- [ ] **Step 4: Apply in `A4Book.tsx`**

Add the import and merge into `rootStyle`:
```ts
import { pageVars } from "@/lib/page-vars";
```
```tsx
      rootStyle={{ ...themeVars(book.theme), ...pageVars(book.pageConfig) }}
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `pnpm test --run lib/page-vars.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/page-vars.ts lib/page-vars.test.ts components/renderer/A4Book.tsx
git commit -m "feat: drive page geometry CSS vars from pageConfig"
```

---

### Task 5: Reserve header/footer bands in the renderer

**Files:**
- Modify: `components/renderer/renderer.css`

This is a CSS-only task (no unit test). Verification is by build + a geometry check that legacy books are unchanged.

**Interfaces:**
- Consumes the `--page-header-h` / `--page-footer-h` vars from Task 4.

- [ ] **Step 1: Update `.page-inner` padding**

In `components/renderer/renderer.css`, replace the `.page-inner` `padding` line:
```css
/* was: padding: var(--margin); */
  padding:
    calc(var(--page-margin) + var(--page-header-h, 0mm))
    var(--page-margin)
    calc(var(--page-margin) + var(--page-footer-h, 0mm));
```
Leave the rest of `.page-inner` (height/flex/gap/position/z-index) unchanged. The `--margin` alias at `:root` may remain; it is no longer used by `.page-inner` but other rules may reference it — do not remove it in this task.

- [ ] **Step 2: Verify legacy geometry is unchanged**

Run: `pnpm build`
Expected: build succeeds.

Reasoning check (state it in the commit/PR): for a migrated existing book, `pageVars` emits `--page-header-h: 0mm` and `--page-footer-h: 0mm`, so the padding `calc(var(--page-margin) + 0mm)` = `var(--page-margin)` on all four sides — byte-identical to the previous `padding: var(--margin)` (both resolve to 18mm). New books get the extra header/footer bands. `use-auto-fit` reads the computed padding at runtime, so its budget math stays correct automatically.

- [ ] **Step 3: Commit**

```bash
git add components/renderer/renderer.css
git commit -m "feat: reserve header/footer bands in the page body region"
```

---

### Task 6: Drive PDF/print page size from pageConfig

**Files:**
- Modify: `app/[slug]/print/page.tsx`

**Interfaces:**
- Consumes: `pageDimensions` (`@/lib/grid-math`), `DEFAULT_PAGE_CONFIG` (`@/lib/book-schema`).

- [ ] **Step 1: Inject a dynamic `@page` size**

In `app/[slug]/print/page.tsx`, compute the page dimensions from the (already-migrated) book and emit an `@page` rule that overrides `renderer.css`'s static `@page { size: A4 }`. Replace the render return:

```tsx
import { pageDimensions } from "@/lib/grid-math";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";
```
```tsx
  const book = await loadProjectBook(slug);
  const { w, h } = pageDimensions(book.pageConfig ?? DEFAULT_PAGE_CONFIG);
  return (
    <>
      <style>{`@page { size: ${w}mm ${h}mm; margin: 0; }`}</style>
      <A4Book book={book} assetBase={assetBaseFor(slug)} />
    </>
  );
```

- [ ] **Step 2: Verify the build + typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: both succeed. (Chromium honors the CSS `@page` size because the PDF route already sets `preferCSSPageSize: true`; for a legacy/A4 book this emits `210mm 297mm`, equivalent to the prior `size: A4`.)

- [ ] **Step 3: Commit**

```bash
git add "app/[slug]/print/page.tsx"
git commit -m "feat: export PDF at the configured page size"
```

---

### Task 7: `updatePageConfig` action + Page settings UI

**Files:**
- Modify: `lib/store.tsx`
- Create: `lib/store.test.ts`
- Create: `components/editor/PageSettings.tsx`
- Modify: `components/editor/LeftPane.tsx`

**Interfaces:**
- Consumes: `PageConfig`, `PageSize`, `DEFAULT_PAGE_CONFIG` (`@/lib/book-schema`).
- Produces: `updatePageConfig(patch: Partial<PageConfig>): void` on the store; a `PageSettings` section.

- [ ] **Step 1: Write the failing store test** (the vanilla store is usable without React)

```ts
// lib/store.test.ts
import { describe, it, expect } from "vitest";
import { createEditorStore } from "@/lib/store";
import { DEFAULT_PAGE_CONFIG, type Book } from "@/lib/book-schema";

const book: Book = {
  schemaVersion: 2, pageConfig: DEFAULT_PAGE_CONFIG,
  title: "T", subtitle: "", author: "", edition: "", cover: "",
  chapters: [{ id: "c", title: "C", description: "", steps: [] }],
};

describe("updatePageConfig", () => {
  it("patches the page config immutably", () => {
    const store = createEditorStore(book, "slug");
    store.getState().updatePageConfig({ size: "Letter", orientation: "landscape" });
    expect(store.getState().book.pageConfig).toMatchObject({ size: "Letter", orientation: "landscape" });
    // unrelated fields preserved
    expect(store.getState().book.pageConfig?.margins).toEqual(DEFAULT_PAGE_CONFIG.margins);
    // input book object not mutated
    expect(book.pageConfig).toBe(DEFAULT_PAGE_CONFIG);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test --run lib/store.test.ts`
Expected: FAIL — `updatePageConfig` is not a function.

- [ ] **Step 3: Add the action**

In `lib/store.tsx`, add to the `EditorState` interface (near `updateBackground`):
```ts
  updatePageConfig: (patch: Partial<PageConfig>) => void;
```
add `PageConfig` to the type import from `./book-schema`, also import the default:
```ts
import { DEFAULT_WATERMARK_OPACITY, DEFAULT_PAGE_CONFIG } from "./book-schema";
```
and add the implementation (near `updateBackground`):
```ts
    updatePageConfig: (patch) =>
      set((s) => {
        const current: PageConfig = s.book.pageConfig ?? DEFAULT_PAGE_CONFIG;
        return { book: { ...s.book, pageConfig: { ...current, ...patch } } };
      }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test --run lib/store.test.ts && pnpm typecheck`
Expected: PASS, `tsc` clean.

- [ ] **Step 5: Create the settings UI**

```tsx
// components/editor/PageSettings.tsx
"use client";

/* Page configuration — size, orientation, margins, header/footer (mm). */
import type { PageSize } from "@/lib/book-schema";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";
import { useEditor } from "@/lib/store";

const SIZES: PageSize[] = ["A4", "Letter", "A5", "Legal", "Custom"];

export default function PageSettings() {
  const cfg = useEditor((s) => s.book.pageConfig) ?? DEFAULT_PAGE_CONFIG;
  const update = useEditor((s) => s.updatePageConfig);

  return (
    <section className="editor-section">
      <h2 className="editor-section-title">Page</h2>
      <div className="editor-field">
        <label htmlFor="pg-size">Size</label>
        <select
          id="pg-size"
          value={cfg.size}
          onChange={(e) => update({ size: e.target.value as PageSize })}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="editor-field">
        <label htmlFor="pg-orientation">Orientation</label>
        <select
          id="pg-orientation"
          value={cfg.orientation}
          onChange={(e) => update({ orientation: e.target.value as "portrait" | "landscape" })}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </div>
      <div className="editor-field">
        <label htmlFor="pg-margin">Margin (mm)</label>
        <input
          id="pg-margin"
          type="number"
          min={0}
          value={cfg.margins.left}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            update({ margins: { top: v, right: v, bottom: v, left: v } });
          }}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="pg-header">Header (mm)</label>
        <input
          id="pg-header"
          type="number"
          min={0}
          value={cfg.headerH}
          onChange={(e) => update({ headerH: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="editor-field">
        <label htmlFor="pg-footer">Footer (mm)</label>
        <input
          id="pg-footer"
          type="number"
          min={0}
          value={cfg.footerH}
          onChange={(e) => update({ footerH: Number(e.target.value) || 0 })}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Wire into `LeftPane.tsx`**

Add the import and render it after `<BookSettings />`:
```tsx
import PageSettings from "./PageSettings";
```
```tsx
      <BookSettings />
      <PageSettings />
```

- [ ] **Step 7: Verify build + full suite + typecheck**

Run: `pnpm test --run && pnpm typecheck && pnpm build`
Expected: all green. Manual check (note in PR): selecting Letter/landscape or changing margins updates the live preview; existing projects open unchanged (legacy geometry).

- [ ] **Step 8: Commit**

```bash
git add lib/store.tsx lib/store.test.ts components/editor/PageSettings.tsx components/editor/LeftPane.tsx
git commit -m "feat: page configuration settings UI"
```

---

## Self-review (done)

- **Spec coverage:** presets ✓ (T1), legacy migration ✓ (T2), migrate-on-load + new-project defaults ✓ (T3), geometry vars ✓ (T4), header/footer bands ✓ (T5), PDF size ✓ (T6), store action + UI ✓ (T7).
- **Zero-regression:** legacy books migrate to `LEGACY_PAGE_CONFIG` (18/0/0); `pageVars` + the `calc(... + 0mm)` padding resolve byte-identically to today's 18mm; PDF emits `210mm 297mm` ≡ `size: A4`. Stated and checked in T5/T6.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `pageVars`, `updatePageConfig`, `DEFAULT_PAGE_CONFIG`/`LEGACY_PAGE_CONFIG`, `pageDimensions` names/signatures agree across tasks.

## Carry-forward (not this plan)

- Header/footer *content* (author text, repositioning the metadata footer into the reserved footer band) is deferred; this plan only reserves the band space.
- The grid renderer + on-canvas divider resize ship next, with the cell-stack content model (Phase B).
- A Playwright E2E asserting a Letter-size PDF (the unit/build checks here cover the wiring; the visual size is best confirmed in E2E).
