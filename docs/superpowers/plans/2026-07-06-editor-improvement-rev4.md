# Improvement Rev4 — Demo/Legacy/Background/Watermark/Fonts/Restore Bundle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six additive fixes/features gathered into one branch (`feature/improvement-rev4`):
demo-mode hardening, a legacy→grid migration path, working background-image fit modes, a
tandem (icon+text) watermark layout, a Roboto-first font default, and a restore/discard
overhaul (fixes the image-loss bug and adds a real "discard" action).

**Architecture:** No renderer-breaking schema changes. Two additive schema fields
(`Background.fit`, unchanged `Watermark`/`Theme` shapes), one new pure migration helper
(`forceGridLayout`), one new server route (`DELETE /api/projects/[slug]`), and CSS-only font/
watermark/background changes. `layoutMode`/`schemaVersion` gating (ADR-006) is reused, not
altered — zero regression for existing books stays non-negotiable per CLAUDE.md.

**Tech stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Zustand, vitest.

## Global constraints

- **Immutability:** all `Book` edits go through `lib/book-mutations.ts` / `lib/book-migrate.ts`
  pure helpers, never mutate in place (matches existing convention).
- **Zero regression:** existing `book.json` files render pixel-identically unless the user
  explicitly opts into a new default (grid on brand-new steps, Roboto as the new global default —
  both are new-content-only or globally-applied CSS swaps, not silent structural rewrites of
  existing per-book data).
- **Karpathy discipline:** minimum code that satisfies each requirement; no speculative modes
  beyond the five background-fit values and no new storage subsystem where the existing
  ephemeral-project-store (ADR-005) already solves the problem (see Task 6 below — no IndexedDB).
- **Execution:** subagent-driven development, karpathy-guidelines discipline, per-task review
  (staff-engineer + frontend-developer lens applied by the implementing agent itself, since no
  separate review subagents are wired into this environment), final whole-branch review before
  merge (`pnpm typecheck && pnpm lint && pnpm test`).

## Assumptions (flagged for user confirmation, proceeding with the stated default)

1. **New-project grid default.** The request's item 2 only mandates "new projects default to
   grid" under the *migration-infeasible* branch. Migration turned out feasible (Task 2), but
   grid is still made the default for brand-new steps/projects (not just the demo) — legacy stays
   available and lossless, but there is no reason to keep authoring new content in the
   soon-to-be-legacy path once migration is proven lossless.
2. **"Auto" background-fit ≡ prior hardcoded `cover` behavior.** The request's description of
   "auto" ("image should cover the page, crop excess") is the same mechanism as "crop". Both map
   to `object-fit: cover`; `auto` is the zero-config default so existing books render unchanged.
3. **"Discard on the homepage"** refers to the *only* project-listing UI that exists today —
   `LandingActions`'s "Recover unsaved work" (localStorage-cache) list. There is no separate
   full project directory on the homepage to discard from.
4. **Restore image fix is server-side, not a new client cache.** The existing project directory
   (assets included) normally still exists server-side for the TTL window (default 1 day) —
   far longer than a real "abrupt close." So the fix is: if the original project is still alive,
   sync the cached `book.json` onto it and reopen the *same* slug (assets untouched, so images
   survive). Only recreate a fresh project (current, lossy-for-images behavior) if the original
   has actually expired — an edge case that cannot be fixed without adding a client-side binary
   cache, which is out of scope per constraint above.

---

### Task 1: Demo-mode hardening (Item 1)

**Files:** `app/[slug]/page.tsx`, `lib/book-migrate.ts`, `components/editor/StepEditor.tsx`,
`lib/use-autosave.ts`, `components/landing/LandingActions.tsx`.

- [ ] **Step 1** — Add `forceGridLayout(book): Book` to `lib/book-migrate.ts`: maps every step to
  `{ ...step, layoutMode: "grid", grid: step.grid ?? legacyStepToGrid(step) }`. Pure, reuses
  `legacyStepToGrid`. Unit test alongside `migrateBook`'s existing tests.
- [ ] **Step 2** — In `app/[slug]/page.tsx`, when seeding `/demo` for the first time, run the
  loaded example book through `forceGridLayout` before `seedProject`. Demo-only; no other project
  seeding path changes.
- [ ] **Step 3** — In `StepEditor.tsx`, read `projectSlug` from the store; when
  `projectSlug === "demo"`, don't render the Layout `<select>` (legacy/grid toggle) — demo is
  always grid, so the control has nothing to offer.
- [ ] **Step 4** — In `LandingActions.tsx`'s recovery scan, skip any key whose slug is `"demo"`
  (`key.slice(LS_PREFIX.length) === "demo"`) so demo never appears in "Recover unsaved work".
- [ ] **Step 5** — In `lib/use-autosave.ts`, short-circuit `useAutosave` for `slug === "demo"`:
  skip both the localStorage mirror and the `PUT` — demo edits live only in the in-memory store
  for the session and vanish on reload.

### Task 2: Legacy→grid migration feasibility + bulk migrate action (Item 2)

**Feasibility verdict: YES.** `legacyStepToGrid` (`lib/book-migrate.ts:111`) already converts any
legacy step (single/double/wide image, side/below callouts) into an equivalent, lossless grid —
proven by `lib/book-migrate.test.ts` (row/cell counts, width splits, idempotency, losslessness).
`setStepLayoutMode(book, ci, si, "grid")` (`lib/book-mutations.ts:43`) already performs this
per-step, additively (original legacy fields untouched, so reverting to "Legacy" is safe too).

**Files:** `components/editor/BookSettings.tsx` (or wherever project-level actions live —
confirm during implementation), `lib/book-mutations.ts`, `lib/store.tsx`,
`lib/book-mutations.ts` (`blankStep`), `lib/project-store.ts` (`defaultBook`).

- [ ] **Step 1** — Add `migrateAllStepsToGrid(book): Book` to `lib/book-mutations.ts`: maps every
  step whose `stepLayoutMode(step) === "legacy"` through `setStepLayoutMode`-equivalent logic
  (grid: `step.grid ?? legacyStepToGrid(step)`, `layoutMode: "grid"`); steps already in grid mode
  pass through untouched (idempotent, preserves author grid edits).
- [ ] **Step 2** — Wire a `migrateAllToGrid()` store action + a "Migrate all legacy steps to
  grid" button (with a short explanatory line: additive, originals kept, reversible per-step) in
  the project-level settings panel. Button only renders when at least one step is still legacy.
- [ ] **Step 3** — Default `blankStep()` (`lib/book-mutations.ts:92`) and the first step in
  `defaultBook()` (`lib/project-store.ts:82`) to `layoutMode: "grid"` with a single empty
  row/cell (`grid: [{ heightFr: 1, cells: [{ widthFr: 1, objects: [] }] }]`), per Assumption 1.
  Existing steps (no `layoutMode` set) are unaffected — `stepLayoutMode()`'s fallback is untouched.

### Task 3: Background image fit modes (Item 3)

**Root cause of "doesn't work" (see design doc):** no real bug in the paint order, but (a) no
fit-mode control exists at all (`background-size: cover` hardcoded) and (b) the stored image URL
is baked with the project slug at upload time and never re-resolved, unlike the watermark icon —
so a duplicated/re-imported project's background silently 404s.

**Files:** `lib/book-schema.ts`, `lib/book-render.ts`, `components/renderer/PageBackground.tsx`,
`components/renderer/renderer.css`, `components/renderer/A4Book.tsx`,
`components/editor/BackgroundSettings.tsx`.

- [ ] **Step 1** — Add `BackgroundFit = "auto" | "crop" | "shrink" | "fit" | "stretch"` and
  `fit?: BackgroundFit` to `Background` in `lib/book-schema.ts`; `DEFAULT_BACKGROUND_FIT = "auto"`.
- [ ] **Step 2** — Store the background image as a **bare filename** (mirrors the watermark
  icon fix), not a full URL. Add `backgroundImageSrc(assetBase, image)` to `lib/book-render.ts`
  (same legacy-URL-rehoming shape as `watermarkIconSrc`). Update `BackgroundSettings.tsx` to save
  `data.filename` directly and resolve its own preview `<img>` through the new helper.
- [ ] **Step 3** — Resolve the background in `A4Book.tsx` the same way the watermark icon is
  resolved (`bg = book.background ? { ...book.background, image: backgroundImageSrc(assetBase,
  book.background.image) } : undefined`).
- [ ] **Step 4** — Switch `PageBackground.tsx` from a `background-image` div to an `<img>` with
  `object-fit`, since `scale-down` (needed for "shrink") has no `background-size` equivalent. Map
  `auto`/`crop` → `cover`, `shrink` → `scale-down`, `fit` → `contain`, `stretch` → `fill`.
- [ ] **Step 5** — Add a "Fit" `<select>` (labelled Auto / Crop to fill / Shrink to fit / Fit
  within page / Stretch to fill) to `BackgroundSettings.tsx`, wired to `updateBackground({ fit })`.

### Task 4: Watermark image + text tandem layout, consistent opacity (Item 4)

**Files:** `components/renderer/Watermark.tsx` (no change needed — already supports
icon-only/text-only/both independently), `components/renderer/renderer.css`.

- [ ] **Step 1** — Opacity already applies once, on the outer `.watermark` wrapper, inherited by
  both `.wm-icon` and `.wm-text` — already consistent; add a regression note, no code change.
- [ ] **Step 2** — Change `.wm-mark` from `flex-direction: column` to `row` (icon left of text,
  vertically centered, small gap) in `renderer.css`. Rescale `.wm-icon` from the current
  full-width mm values (120mm center / 24mm corner — sized for a stacked logo) to icon-proportioned
  heights (`~40mm` center / `~14mm` corner, `width: auto`) so it reads as an icon beside the text,
  not a competing hero image.

### Task 5: Roboto as the default font, cover title excepted (Item 5)

**Files:** `app/globals.css`, `components/renderer/renderer.css`.

- [ ] **Step 1** — In `app/globals.css`'s `@theme` block, repoint `--font-heading` and
  `--font-body` at `var(--font-roboto), "Roboto", sans-serif`; add a new `--font-cover: var(
  --font-montserrat), "Montserrat", sans-serif` so the cover title keeps its current distinct
  look (nothing else references `--font-montserrat` directly after this change).
- [ ] **Step 2** — In `renderer.css`, change `.cover-title`'s fallback from
  `var(--th-cover-family, var(--font-heading))` to `var(--th-cover-family, var(--font-cover))`.
  Chapter/step/row titles and callouts keep referencing `--font-heading`/`--font-body` — both now
  resolve to Roboto by default, satisfying "the remaining sections use Roboto" without touching
  each selector individually.

### Task 6: Restore fixes images; homepage Discard reuses the annotation-delete dialog (Item 6)

**Root cause of the image-loss bug:** `restore()` in `LandingActions.tsx` always `POST
/api/projects` with the cached book, which runs `importProject()` into a **brand-new slug** with
an empty `assets/` dir — the real assets sit untouched under the *original* slug's project
directory, which (TTL default 1 day) is still there for any realistic "abrupt close."

**Files:** `components/landing/LandingActions.tsx`, `lib/project-store.ts`,
new `app/api/projects/[slug]/route.ts`.

- [ ] **Step 1** — Rewrite `restore(item)`: `GET /api/projects/${item.slug}/book` first.
  - **200** (project still alive): `PUT` the cached book onto that same slug (syncs any edits made
    right before the crash — assets are never touched), then `router.push('/'+item.slug)`. Images
    intact.
  - **404** (expired): fall back to the current recreate-under-a-new-slug path, and surface a
    one-line notice that uploaded images could not be recovered (cache never held binaries).
- [ ] **Step 2** — Add `deleteProject(slug)` to `lib/project-store.ts` (`rm(projectDir(slug), {
  recursive: true, force: true })`) and a new `app/api/projects/[slug]/route.ts` with a `DELETE`
  handler calling it.
- [ ] **Step 3** — In `LandingActions.tsx`, add a per-item **Discard** button next to Restore.
  Clicking it opens `ConfirmDialog` (same component/props/tone used by
  `AnnotationDeleteController` — `tone="danger"`, title "Discard this project?", confirm label
  "Discard"). On confirm: `DELETE /api/projects/${slug}` (best-effort — 404 if already expired is
  fine), then `localStorage.removeItem(key)`, drop it from the `recoverable` list. Upgrade the
  existing bulk "Clear all" to the same `ConfirmDialog` for visual consistency (currently a raw
  `window.confirm`).

## Verification

- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` green — add unit tests for `forceGridLayout`, `migrateAllStepsToGrid`,
  `backgroundImageSrc` (mirrors existing `watermarkIconSrc` test coverage if any).
- [ ] Manual/visual note in ROADMAP entry: renderer/CSS changes (watermark layout, fonts,
  background object-fit) are build-verified per repo convention (no DOM test harness).
